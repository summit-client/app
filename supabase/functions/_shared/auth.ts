// Shared by every provisioning function (invite-teammate, edit-teammate,
// provision-clinic). Deliberately NOT using the @supabase/server scaffold's
// withSupabase() helper the CLI generates by default - this repo has no way
// to verify that wrapper's exact auth semantics offline, and this is the
// first service-role-key usage in the whole codebase, so it's built on the
// same explicit, long-established primitives this repo already audits and
// trusts elsewhere: createClient() + auth.getUser() to verify a JWT against
// the auth server (see apps/*/proxy.ts - "getUser(), never getSession()").
//
// config.toml sets verify_jwt = false for all three functions - the edge
// gateway's own verifier rejected this project's asymmetric (ES256) access
// tokens with UNAUTHORIZED_ASYMMETRIC_JWT before the function code ever ran
// (confirmed live). getUser() below is what actually authenticates the
// caller instead: it checks the token against the auth server directly,
// which works regardless of signing algorithm, and is also what tells us
// WHICH user is calling, not just that some token was presented.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AppRole = "admin" | "supervisor" | "clinician" | "scheduler" | "client";

export interface CallerProfile {
  id: string;
  role: AppRole;
  clinic_id: string | null;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    // Reserved, auto-injected per function invocation by the Supabase Edge
    // Runtime - never set by hand, never the same value as any app's
    // NEXT_PUBLIC_SUPABASE_ANON_KEY, and never present in any app's
    // .env.local (see CLAUDE.md's hard constraint on this key).
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Verifies the caller's JWT against the auth server (not just that the edge
 * gateway accepted it) and returns their id. Returns null for anything
 * short of a fully verified session - missing header, malformed token,
 * expired token, or a token the auth server no longer recognises (e.g. a
 * banned/deactivated user, which is exactly how edit-teammate's
 * "deactivate" refuses a former teammate from here on, with no separate
 * check needed).
 */
export async function verifyCaller(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Service-role read of the caller's own profiles row - never the caller's
 * own RLS-scoped view of it, so this doesn't depend on (or need to assume)
 * what profiles' own SELECT policy happens to allow. clinic_id/role for
 * every authorization decision in these functions comes from here, never
 * from the request body.
 */
export async function getCallerProfile(admin: SupabaseClient, userId: string): Promise<CallerProfile | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CallerProfile;
}

/** DB-backed rate limit: an edge function has no reliable shared in-memory
 *  state across instances/cold starts, unlike apps/scheduler/pages/api/
 *  match.ts's in-process Map. provisioning_audit doubles as the source. */
export async function isRateLimited(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  maxPerHour: number,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("provisioning_audit")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actorId)
    .eq("action", action)
    .gte("created_at", since);
  if (error) return false; // fail open on the count query itself; the insert below still records the attempt
  return (count ?? 0) >= maxPerHour;
}

export async function recordAudit(
  admin: SupabaseClient,
  row: {
    actor_id: string;
    actor_clinic_id: string | null;
    action: "invite" | "edit" | "deactivate" | "provision_clinic";
    target_user_id?: string | null;
    target_clinic_id?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("provisioning_audit").insert(row);
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
