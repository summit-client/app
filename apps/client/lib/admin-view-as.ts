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
 * `clients` briefly had no clinic_id column at all (this file's first
 * version routed around that - see migration 0013's header for how that was
 * found and why it existed: the table predates this repo's migration
 * history entirely). Migration 0013 added it, backfilled every existing row
 * to Mount Etna, and rewrote the table's RLS to check it -
 * `clinic_id = auth_clinic_id() and (role in ('admin','scheduler'))` in
 * place of the old unconditional "any admin or scheduler sees every row".
 * This file's admin path is scoped to match: an admin only ever sees or
 * selects clients in their own clinic, the same boundary RLS now enforces
 * underneath it. Restoring that scoping here isn't optional once the column
 * exists - the whole point of multi-tenant scoping is that a second
 * clinic's admin (or someone who guesses another clinic's client id) gets
 * nothing, and code that queries clients without a clinic_id filter, on a
 * table where staff RLS is clinic-wide, would otherwise return every
 * clinic's data to the API layer regardless of what the database enforces
 * per-row - the filter here is what turns "the database would reject a
 * cross-clinic read" into "the app never asks for one".
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
    // cookie only says which id to re-check, never grants access on its own.
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
 *  inline selector - scoped to their own clinic. */
export async function listClinicClients(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<SelectableClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  // An RLS-filtered read returns [] with no error - this only catches the
  // other kind of empty result (wrong column, permission actually denied,
  // etc.), the exact distinction a bad .eq("clinic_id", ...) once hid, so
  // log it rather than silently treating both the same.
  if (error) console.error("listClinicClients failed:", error.message);
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
