import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin "view as client" — lets an admin account simulate what a specific
 * family sees, for diagnosing a reported issue, without the family ever
 * sharing credentials or the admin needing a row in `clients`.
 *
 * Read-only: apps/client has no forms or mutations anywhere (checked before
 * building this), so there is nothing for an admin to do "as" the family by
 * mistake - only look at the same read-only dashboard/appointments pages a
 * real client account would.
 *
 * Cookie-based rather than a `?as=` query param carried through every link:
 * once chosen, the client persists across navigation without every link in
 * the app needing to remember to forward it. Scoped to this app only (no
 * `.summitclient.io` domain, unlike the shared SSO cookie) and short-lived -
 * this is a support-session convenience, not a standing setting.
 */
export const VIEW_AS_COOKIE = "admin_view_as_client";
const VIEW_AS_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours - one support session

export interface ViewedClient {
  clientId: string;
  clientName: string;
  /** True when this is an admin looking at someone else's data, not a real client account. */
  isAdminViewingAs: boolean;
}

export interface SelectableClient {
  id: string;
  name: string | null;
}

export type ResolveResult =
  | { kind: "viewing"; viewed: ViewedClient }
  | { kind: "needs-selection"; clinicId: string }
  | { kind: "not-permitted" };

/**
 * Figures out whose dashboard to render for the signed-in user:
 *
 *   - role "client"  -> their own linked `clients` row (unchanged behaviour).
 *   - role "admin"   -> the client named in VIEW_AS_COOKIE, re-validated on
 *                       every request to still belong to the admin's own
 *                       clinic (the cookie's value is never trusted alone -
 *                       it's just "which id to re-check", not a grant).
 *                       No cookie, or a cookie that no longer validates ->
 *                       "needs-selection", so the page can send them to the
 *                       picker instead of rendering anyone's PHI.
 *   - any other role -> "not-permitted". apps/client's proxy.ts only checks
 *       that *some* session exists, not which role - previously any signed-in
 *       staff account (scheduler, clinician, ...) that guessed this URL fell
 *       through to the same clinic-wide, unscoped `sessions` query as an
 *       admin now deliberately gets. Closing that off here.
 */
export async function resolveViewedClient(
  supabase: SupabaseClient,
  req: NextApiRequest,
  userId: string,
): Promise<ResolveResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, clinic_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role === "client") {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      kind: "viewing",
      viewed: { clientId: client?.id ?? "", clientName: client?.name ?? "Client", isAdminViewingAs: false },
    };
  }

  if (profile?.role === "admin" && profile.clinic_id) {
    const cookieClientId = req.cookies[VIEW_AS_COOKIE];
    if (!cookieClientId) return { kind: "needs-selection", clinicId: profile.clinic_id };

    // Re-validated against the admin's own clinic on every request - the
    // cookie only says which id to check, never grants access on its own.
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", cookieClientId)
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    if (!client) return { kind: "needs-selection", clinicId: profile.clinic_id };

    return {
      kind: "viewing",
      viewed: { clientId: client.id, clientName: client.name ?? "Client", isAdminViewingAs: true },
    };
  }

  return { kind: "not-permitted" };
}

/** The clients an admin can choose to view as, for the landing page's
 *  inline selector - always scoped to their own clinic. */
export async function listClinicClients(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<SelectableClient[]> {
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  return data ?? [];
}

export function setViewAsCookie(res: NextApiResponse, clientId: string) {
  appendSetCookie(res, serializeViewAsCookie(clientId, VIEW_AS_MAX_AGE_SECONDS));
}

export function clearViewAsCookie(res: NextApiResponse) {
  appendSetCookie(res, serializeViewAsCookie("", 0));
}

/**
 * res.setHeader("Set-Cookie", ...) *replaces* the header rather than adding
 * to it - calling it here after the Supabase server client has already set
 * its own session-refresh Set-Cookie (createClient's setAll, invoked by
 * supabase.auth.getUser()) would silently clobber that cookie instead of
 * sitting alongside it. Always merge with whatever is already queued.
 */
function appendSetCookie(res: NextApiResponse, cookie: string) {
  const existing = res.getHeader("Set-Cookie");
  const merged = existing === undefined ? [cookie] : ([] as string[]).concat(existing as string | string[], cookie);
  res.setHeader("Set-Cookie", merged);
}

function serializeViewAsCookie(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${VIEW_AS_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
