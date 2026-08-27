"use client";

/**
 * @summit/session — who the signed-in person is, resolved once per page load,
 * and which portals their role may use.
 *
 * Lifted out of apps/employee/lib/session.ts, which was the only place that did
 * this properly. apps/data resolved the same thing partially and per-call
 * (`myClinicId()` ran getUser() plus a profiles select on every single write),
 * apps/client and apps/scheduler did not resolve it at all, and the portal bar
 * had no idea who was looking at it. One implementation, four consumers.
 *
 * The split this package draws:
 *
 *   Here          identity, and the problems that are true regardless of which
 *                 portal you are standing in — not signed in, no profile row,
 *                 no clinic.
 *
 *   @summit/portals  which portals exist and who may use each. Identity and the
 *                 portal catalogue are different facts with different lifetimes
 *                 — the catalogue becomes per-tenant configuration in phase 2 —
 *                 so this package reads that one rather than owning it.
 *
 *   In each app   what that portal does about it. The employee hub maps
 *                 AppRole to its own three-way HubRole; the clinician portal
 *                 does not need to. Screens and copy stay with the screens.
 *
 * With NEXT_PUBLIC_DEV_PREVIEW=1 identity is a fixture and nothing touches
 * Supabase. Callers never branch on the flag — they read getIdentity() either
 * way. Note the flag is double-gated in each app's proxy.ts (it must also not
 * be a production build), so a stray env value on the droplet cannot open a
 * portal; this module is only the identity half of that.
 */

import { createBrowserClient } from "@supabase/ssr";
import { admits, isAppRole, portal, type AppRole, type PortalKey } from "@summit/portals";

export type { AppRole, PortalKey };

export const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

/** Why identity is unusable, when it is. Null means it is good. */
export type SessionProblem =
  | "NOT_SIGNED_IN"   // no Supabase session; the portal's proxy should have redirected
  | "NO_PROFILE"      // signed in, but no row in `profiles`
  | "NO_CLINIC"       // profile exists, clinic_id is null -> every policy false
  | "ROLE_EXCLUDED";  // a real role, but not one this portal serves

export interface Identity {
  userId: string;
  clinicId: string | null;
  appRole: AppRole | null;
  fullName: string | null;
  supervisorId: string | null;
  isPreview: boolean;
  /** Portal-independent problems only. `gate()` adds ROLE_EXCLUDED. */
  problem: SessionProblem | null;
}

/**
 * Real uuids, so preview and live rows have the same shape. An earlier fixture
 * used the string "preview-user", which is not a uuid — every live write built
 * from it failed the column's type cast, silently, because none of the write
 * paths checked their result.
 */
export const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000001";
export const PREVIEW_CLINIC_ID = "00000000-0000-4000-8000-0000000000c1";
export const PREVIEW_FULL_NAME = "Sherpa Doe";

/** The preview role switcher writes here. Preview only — in live mode the role
 *  comes from `profiles.role` and this is never consulted. */
const PREVIEW_ROLE_KEY = "summit-preview-role";

export function previewRole(fallback: AppRole = "admin"): AppRole {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(PREVIEW_ROLE_KEY);
    return isAppRole(v) ? v : fallback;
  } catch {
    return fallback; // private mode
  }
}

export function setPreviewRole(role: AppRole): void {
  if (!IS_PREVIEW) return; // no-op in live mode, by construction
  try {
    localStorage.setItem(PREVIEW_ROLE_KEY, role);
  } catch { /* private mode */ }
  cached = null;
}

function previewIdentity(role: AppRole): Identity {
  return {
    userId: PREVIEW_USER_ID,
    clinicId: PREVIEW_CLINIC_ID,
    appRole: role,
    fullName: PREVIEW_FULL_NAME,
    supervisorId: null,
    isPreview: true,
    problem: null,
  };
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

let cached: Promise<Identity> | null = null;

async function resolve(): Promise<Identity> {
  if (IS_PREVIEW) return previewIdentity(previewRole());

  const client = sb();
  // getUser(), not getSession(): it verifies the JWT against the auth server
  // rather than trusting whatever is in the cookie.
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    return {
      userId: "", clinicId: null, appRole: null, fullName: null,
      supervisorId: null, isPreview: false, problem: "NOT_SIGNED_IN",
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
    return { ...base, clinicId: null, appRole: null, problem: "NO_PROFILE" };
  }

  const raw = profile.role as unknown;
  const appRole = isAppRole(raw) ? raw : null;
  const clinicId = (profile.clinic_id as string | null) ?? null;

  // A null clinic_id makes auth_clinic_id() return null, every RLS policy
  // evaluate false, and a correctly signed-in user see an entirely empty
  // portal — which reads as an auth bug and is not one. Reported, not guessed
  // at. An unrecognised role lands here as NO_PROFILE-adjacent rather than
  // silently becoming null-with-no-problem.
  const problem: SessionProblem | null =
    !clinicId ? "NO_CLINIC" : !appRole ? "NO_PROFILE" : null;

  return { ...base, clinicId, appRole, problem };
}

/**
 * Resolve identity, sharing one in-flight request across all callers.
 *
 * Cached because portals need identity on nearly every operation — the
 * clinician portal was paying getUser() plus a profiles select on every write —
 * and resolving per call means two round trips per user action.
 */
export function getIdentity(): Promise<Identity> {
  if (!cached) cached = resolve();
  return cached;
}

/** Drop the cache. Call after a sign-in, a sign-out, or a role change. */
export function refreshIdentity(): Promise<Identity> {
  cached = null;
  return getIdentity();
}

/**
 * Identity as seen from one portal: the same object, plus ROLE_EXCLUDED when
 * the role is real but not one this portal serves. An existing problem wins —
 * telling someone their role is wrong when they have no clinic sends them to
 * the wrong administrator.
 */
export function gate(identity: Identity, key: PortalKey): Identity {
  if (identity.problem) return identity;
  if (admits(key, identity.appRole)) return identity;
  return { ...identity, problem: "ROLE_EXCLUDED" };
}

/**
 * What to render for each problem. Deliberately says what to DO, and who does
 * it — "empty portal" has been misdiagnosed as an auth failure more than once.
 */
export function explainProblem(
  problem: SessionProblem,
  key: PortalKey,
): { title: string; detail: string } {
  switch (problem) {
    case "NOT_SIGNED_IN":
      return {
        title: "You are not signed in",
        detail:
          "Sign in at summitclient.io and come back. If you keep landing here, this portal's auth gate is not reaching Supabase.",
      };
    case "NO_PROFILE":
      return {
        title: "No usable profile record",
        detail:
          "You are signed in, but there is no row for you in profiles, or its role is not one Summit issues. An administrator needs to fix that before any screen can load.",
      };
    case "NO_CLINIC":
      return {
        title: "Your account is not attached to a clinic",
        detail:
          "Your profile has no clinic_id, so every record is correctly hidden from you. This is not a sign-in problem. An administrator sets profiles.clinic_id for your account.",
      };
    case "ROLE_EXCLUDED": {
      const p = portal(key);
      return {
        title: `${p.label} is not for your role`,
        detail: `This portal covers ${p.roles.join(", ")} accounts. Your other portals are listed in the bar at the top of the page.`,
      };
    }
  }
}
