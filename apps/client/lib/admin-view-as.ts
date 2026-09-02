import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin "view as client" — lets an admin account simulate what a specific
 * family sees, for diagnosing a reported issue, without the family ever
 * sharing credentials or the admin needing a row in `clients`.
 *
 * Read-only: apps/client had no forms or mutations anywhere when this was
 * built, so there was nothing for an admin to do "as" the family by
 * mistake - only look at the same read-only dashboard/appointments pages a
 * real client account would. That's no longer true app-wide (migration
 * 0035's home-program activities added the app's first mutation - a family
 * marking their own activity in_progress/completed) but is still true of
 * this "view as" path specifically: pages/api/activities/status.ts checks
 * `isAdminViewingAs` up front and refuses the write before ever touching
 * the database, on top of RLS refusing it anyway (auth_role() for an admin
 * account is 'admin', not 'client'). An admin simulating a family still
 * only ever looks.
 *
 * Cookie-based rather than a `?as=` query param carried through every link:
 * once chosen, the client persists across navigation without every link in
 * the app needing to remember to forward it. Scoped to this app only (no
 * `.summitclient.io` domain, unlike the shared SSO cookie) and short-lived -
 * this is a support-session convenience, not a standing setting.
 */
export const VIEW_AS_COOKIE = "admin_view_as_client";

/**
 * Which child a guardian is currently looking at.
 *
 * The family switcher already remembers this in localStorage for the pages it
 * renders, but a page resolved on the server cannot read localStorage - so a
 * parent who switched to their second child would switch back on any page that
 * resolves through here. This cookie carries the same choice server-side.
 *
 * A preference, not a permission. The value is checked against `my_family`,
 * which RLS already limits to this guardian's own children, so a forged cookie
 * selects nothing the caller could not already open.
 */
export const VIEWED_CHILD_COOKIE = "summit_viewed_child";
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

/** Mirrors @summit/session's SessionProblem shape for the two ways a real
 *  `client`-role account can have nothing to show: no clinic_id (every RLS
 *  policy evaluates false), or a clinic_id but no linked `clients` row. Both
 *  used to fall through to `clientId: ""` and render as an empty dashboard/
 *  appointments list - indistinguishable from "no sessions scheduled," the
 *  exact RLS-empty-set trap CLAUDE.md calls out. */
export type AccountProblem = "NO_CLINIC" | "NO_CLIENT_LINK";

export type ResolveResult =
  | { kind: "viewing"; viewed: ViewedClient }
  | { kind: "needs-selection"; clinicId: string }
  | { kind: "not-permitted" }
  | { kind: "account-problem"; problem: AccountProblem }
  | { kind: "error" };

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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, clinic_id")
    .eq("id", userId)
    .maybeSingle();

  // A real query failure (network blip, transient DB error - not an RLS
  // filter, which returns [] with no error) used to fall straight through
  // every branch below to "not-permitted", which both callers turn into a
  // silent redirect home. That looks identical to "wrong role" from the
  // outside and would bounce a perfectly legitimate family member away
  // from their own dashboard during a transient outage, with nothing
  // telling them why. Surface it as its own case instead.
  if (profileError) {
    console.error("resolveViewedClient: profile lookup failed:", profileError.message);
    return { kind: "error" };
  }

  if (profile?.role === "client") {
    if (!profile.clinic_id) {
      return { kind: "account-problem", problem: "NO_CLINIC" };
    }

    // The legacy direct link first, so a single-child family that predates
    // households resolves exactly as it always did.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();

    if (clientError) {
      console.error("resolveViewedClient: client lookup failed:", clientError.message);
      return { kind: "error" };
    }

    if (client) {
      return {
        kind: "viewing",
        viewed: { clientId: client.id, clientName: client.name ?? "Client", isAdminViewingAs: false },
      };
    }

    // No direct link means a guardian on a household record, which is the
    // normal case since migration 0046. Without this fallback every page that
    // resolves a client here - the dashboard, appointments, funding, documents,
    // home program, the calendar export - reports NO_CLIENT_LINK to a parent
    // whose account is perfectly fine, because `clients.user_id` is the
    // one-child link the household model replaced.
    const { data: family, error: familyError } = await supabase
      .from("my_family")
      .select("client_id, client_name, preferred_name")
      .order("client_name", { ascending: true });

    if (familyError) {
      console.error("resolveViewedClient: family lookup failed:", familyError.message);
      return { kind: "error" };
    }

    const children = family ?? [];
    if (children.length === 0) {
      return { kind: "account-problem", problem: "NO_CLIENT_LINK" };
    }

    // Which child the parent last chose. The cookie is a preference, never a
    // grant: an id that is not in `my_family` is ignored, and `my_family` is
    // already scoped to this guardian by RLS, so a forged cookie selects
    // nothing it could not already reach.
    const remembered = req.cookies[VIEWED_CHILD_COOKIE];
    const chosen =
      children.find((c) => String(c.client_id) === remembered) ?? children[0];

    return {
      kind: "viewing",
      viewed: {
        clientId: String(chosen.client_id),
        clientName: chosen.preferred_name || chosen.client_name || "Client",
        isAdminViewingAs: false,
      },
    };
  }

  if (profile?.role === "admin" && profile.clinic_id) {
    const cookieClientId = req.cookies[VIEW_AS_COOKIE];
    if (!cookieClientId) return { kind: "needs-selection", clinicId: profile.clinic_id };

    // Re-validated against the admin's own clinic on every request - the
    // cookie only says which id to re-check, never grants access on its own.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", cookieClientId)
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    if (clientError) {
      // Previously fell through to "needs-selection" on any failure here,
      // same as a genuinely unknown/foreign client id - which silently
      // re-shows the picker (and, worse, looks like the admin's previous
      // selection was quietly forgotten) instead of saying a lookup failed.
      console.error("resolveViewedClient: admin view-as client lookup failed:", clientError.message);
      return { kind: "error" };
    }

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
): Promise<{ clients: SelectableClient[]; error: boolean }> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  // An RLS-filtered read returns [] with no error - this only catches the
  // other kind of empty result (wrong column, permission actually denied,
  // etc.), the exact distinction a bad .eq("clinic_id", ...) once hid, so
  // log it rather than silently treating both the same. The caller also
  // gets the error flag now instead of just a same-shaped [] either way,
  // since "your clinic has zero clients" and "the client list failed to
  // load" need different copy on the picker.
  if (error) console.error("listClinicClients failed:", error.message);
  return { clients: data ?? [], error: Boolean(error) };
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
