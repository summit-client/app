import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every API route built its own copy of this (six identical definitions).
 * Read-only: route handlers never need to write auth cookies back, since
 * proxy.ts's matcher already covers every /api/* route and has already
 * redirected an unauthenticated or stale-session request before the route
 * handler ever runs.
 */
export function routeServerClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}

/**
 * Shared staff-auth check for every Clinical Intelligence API route
 * (decision-tree, planning, reports/generate, session-plan, supervision,
 * clinical-query). Each route used to inline its own version of this and
 * collapse three different failure reasons into one generic 403 "Staff
 * access required":
 *
 *   - no `profiles` row at all
 *   - a real profile, but a role this feature doesn't serve (scheduler/client)
 *   - a real staff role, but `clinic_id` is null
 *
 * That last one is the one that actually mattered: none of the six routes
 * rejected it up front, so `clinicId` ended up `null` and flowed into
 * every downstream write. `ai_requests`/`clinical_decisions`/
 * `evidence_packets`'s RLS `with check (clinic_id = auth_clinic_id() and
 * auth_is_staff())` never matches a null clinic_id — `null = auth_clinic_id()`
 * is never true in SQL, even when both sides are null — so the insert would
 * throw. And `liveRetriever()`'s reads (`clinic_id = auth_clinic_id()`)
 * would just come back empty, reported as "no data for this client" rather
 * than "your account has no clinic attached" — the exact RLS-empty-set
 * trap CLAUDE.md documents for full-page gates, here showing up as a
 * confusing API error message instead of a blank screen.
 */

export type StaffAuthResult =
  | { ok: true; userId: string; clinicId: string; role: "admin" | "supervisor" | "clinician" }
  | { ok: false; status: number; error: string };

const STAFF_ROLES = ["admin", "supervisor", "clinician"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}

export async function requireStaff(sb: SupabaseClient): Promise<StaffAuthResult> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sign in required." };

  const { data: profile } = await sb.from("profiles").select("role, clinic_id").eq("id", user.id).maybeSingle();

  if (!profile) {
    return {
      ok: false, status: 403,
      error: "No profile record exists for this account yet. An administrator needs to set one up before this feature is usable.",
    };
  }
  if (!isStaffRole(profile.role)) {
    return {
      ok: false, status: 403,
      error: "This feature is for clinical staff (admin, supervisor or clinician) accounts.",
    };
  }
  if (!profile.clinic_id) {
    return {
      ok: false, status: 403,
      error: "Your account is not attached to a clinic, so there is nothing to run this against. An administrator sets profiles.clinic_id for your account.",
    };
  }
  return { ok: true, userId: user.id, clinicId: profile.clinic_id, role: profile.role };
}
