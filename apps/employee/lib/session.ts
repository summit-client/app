"use client";

/**
 * Who the signed-in person is, resolved once per page load.
 *
 * Same seam as the clinician portal (apps/data/lib/data.ts): with
 * NEXT_PUBLIC_DEV_PREVIEW=1 identity is a fixture and nothing touches Supabase;
 * otherwise it comes from the session and the caller's `profiles` row. Screens
 * never branch on the flag - they read `useSession()` either way.
 *
 * Two differences from the data portal's helper, both deliberate:
 *
 * 1. It is cached. `myClinicId()` there runs getUser() + a profiles select on
 *    every single write. The hub needs identity on nearly every operation, so
 *    resolving it per call would mean two round trips per keystroke-ish action.
 *    One in-flight promise is shared; refresh() re-resolves after a sign-in.
 *
 * 2. It reports WHY identity is unusable. A null clinic_id makes auth_clinic_id()
 *    return null, every RLS policy evaluate false, and a correctly signed-in user
 *    see an entirely empty portal - which reads as an auth bug and is not one.
 *    That failure mode is already written up in the deploy notes; surfacing it
 *    here is what stops the next person rediscovering it from scratch.
 */

import { createBrowserClient } from "@supabase/ssr";

export const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

/** `profiles.role` - the app permission. NOT `staff.role`, which is the clinical
 *  credential (BCBA / BCaBA / RBT / Supervisor) written by the scheduler's admin
 *  page. Two different columns with the same name; never conflate them. */
export type AppRole = "admin" | "supervisor" | "clinician" | "scheduler" | "client";

/** What the hub's screens actually switch on. */
export type HubRole = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";

/** Why identity is unusable, when it is. Null means the session is good. */
export type SessionProblem =
  | "NOT_SIGNED_IN"   // no Supabase session; proxy.ts should have redirected
  | "NO_PROFILE"      // signed in, but no row in `profiles`
  | "NO_CLINIC"       // profile exists, clinic_id is null -> every policy false
  | "ROLE_EXCLUDED";  // a role the hub has no screens for (scheduler, client)

export interface Session {
  userId: string;
  clinicId: string | null;
  appRole: AppRole | null;
  role: HubRole;
  fullName: string | null;
  supervisorId: string | null;
  problem: SessionProblem | null;
  isPreview: boolean;
}

const HUB_ROLE: Partial<Record<AppRole, HubRole>> = {
  admin: "ADMIN",
  supervisor: "SUPERVISOR",
  clinician: "EMPLOYEE",
};

/** A real uuid, so preview and live rows have the same shape. The previous
 *  fixture used the string "preview-user", which is not a uuid - every live
 *  write built from it failed the column's type cast, silently, because none of
 *  the write paths checked their result. */
export const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000001";
export const PREVIEW_CLINIC_ID = "00000000-0000-4000-8000-0000000000c1";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

function previewSession(role: HubRole = "ADMIN"): Session {
  return {
    userId: PREVIEW_USER_ID,
    clinicId: PREVIEW_CLINIC_ID,
    appRole: role === "ADMIN" ? "admin" : role === "SUPERVISOR" ? "supervisor" : "clinician",
    role,
    fullName: "Preview Employee",
    supervisorId: null,
    problem: null,
    isPreview: true,
  };
}

/** The preview role switcher writes here. It exists ONLY in preview - in live
 *  mode role comes from `profiles.role` and this is never consulted. */
const PREVIEW_ROLE_KEY = "summit-hub-preview-role";

export function previewRole(): HubRole {
  if (typeof window === "undefined") return "ADMIN";
  const v = localStorage.getItem(PREVIEW_ROLE_KEY);
  return v === "EMPLOYEE" || v === "SUPERVISOR" || v === "ADMIN" ? v : "ADMIN";
}

export function setPreviewRole(role: HubRole): void {
  if (!IS_PREVIEW) return;              // no-op in live mode, by construction
  localStorage.setItem(PREVIEW_ROLE_KEY, role);
  cached = null;
}

let cached: Promise<Session> | null = null;

async function resolve(): Promise<Session> {
  if (IS_PREVIEW) return previewSession(previewRole());

  const client = sb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    return {
      userId: "", clinicId: null, appRole: null, role: "EMPLOYEE",
      fullName: null, supervisorId: null, problem: "NOT_SIGNED_IN", isPreview: false,
    };
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, full_name, clinic_id, supervisor_id")
    .eq("id", user.id)
    .maybeSingle();

  const base = {
    userId: user.id,
    fullName: (profile?.full_name as string | null) ?? null,
    supervisorId: (profile?.supervisor_id as string | null) ?? null,
    isPreview: false,
  };

  if (error || !profile) {
    return { ...base, clinicId: null, appRole: null, role: "EMPLOYEE", problem: "NO_PROFILE" };
  }

  const appRole = (profile.role as AppRole | null) ?? null;
  const hubRole = appRole ? HUB_ROLE[appRole] : undefined;
  const clinicId = (profile.clinic_id as string | null) ?? null;

  // Order matters: a missing clinic_id is the more actionable of the two, and
  // it is the one that produces a blank portal rather than a partial one.
  const problem: SessionProblem | null =
    !clinicId ? "NO_CLINIC" : !hubRole ? "ROLE_EXCLUDED" : null;

  return { ...base, clinicId, appRole, role: hubRole ?? "EMPLOYEE", problem };
}

/** Resolve identity, sharing one in-flight request across all callers. */
export function getSession(): Promise<Session> {
  if (!cached) cached = resolve();
  return cached;
}

/** Drop the cache. Call after a sign-in, a sign-out, or a role change. */
export function refreshSession(): Promise<Session> {
  cached = null;
  return getSession();
}

/** Human-readable explanation for each problem, for the screens to render.
 *  Deliberately says what to DO - "empty portal" has been misdiagnosed as an
 *  auth failure before. */
export function explainProblem(p: SessionProblem): { title: string; detail: string } {
  switch (p) {
    case "NOT_SIGNED_IN":
      return {
        title: "You are not signed in",
        detail: "Sign in at summitclient.io and come back. If you keep landing here, the portal's auth gate is not reaching Supabase.",
      };
    case "NO_PROFILE":
      return {
        title: "No profile record",
        detail: "You are signed in, but there is no row for you in profiles. An administrator needs to create one before any screen can load.",
      };
    case "NO_CLINIC":
      return {
        title: "Your account is not attached to a clinic",
        detail: "Your profile has no clinic_id, so every record is correctly hidden from you. This is not a sign-in problem. An administrator sets profiles.clinic_id for your account.",
      };
    case "ROLE_EXCLUDED":
      return {
        title: "This portal is not for your role",
        detail: "The employee hub covers admin, supervisor and clinician accounts. Scheduler and client accounts have their own portals.",
      };
  }
}
