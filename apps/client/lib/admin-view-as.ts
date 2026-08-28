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
  | { kind: "needs-selection" }
  | { kind: "not-permitted" };

/**
 * `clients` has no clinic_id column at all - confirmed live (querying it
 * throws `column "clinic_id" does not exist`), not merely absent from this
 * repo's tracked migrations the way its RLS policies are (see below). Its
 * one live RLS policy that matters here, "Admins and schedulers have full
 * access to clients", is unconditional: `profiles.role in ('admin',
 * 'scheduler')`, no clinic check anywhere. So on this table specifically,
 * an admin's own clinic_id is not the boundary - there isn't one. Every
 * .eq("clinic_id", ...) in this file's first version was filtering on a
 * column that doesn't exist, which silently produced an empty result every
 * time (a Postgrest error, not an RLS-filtered empty set, but the effect
 * looked identical from the picker: "no clients in your clinic yet" with
 * clients that plainly existed). Fixed by dropping the clinic filter
 * entirely and relying on the real policy: any admin sees every client.
 *
 * That policy is itself worth flagging, not routing around: it means this
 * table has no per-clinic isolation for staff at all, unlike the PHI tables
 * added since (clinic_id + auth_clinic_id()-scoped policies, per CLAUDE.md's
 * "every PHI table carries clinic_id" rule). Harmless today - Mount Etna is
 * the only clinic - but it's exactly the kind of thing that needs fixing
 * before a second clinic's admin could reach this table.
 */
export async function resolveViewedClient(
  supabase: SupabaseClient,
  req: NextApiRequest,
  userId: string,
): Promise<ResolveResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
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

  if (profile?.role === "admin") {
    const cookieClientId = req.cookies[VIEW_AS_COOKIE];
    if (!cookieClientId) return { kind: "needs-selection" };

    // Re-validated on every request rather than trusting the cookie alone -
    // it only says which id to re-check. There's no clinic to check it
    // against (see the file header), so this just confirms the id still
    // names a real client at all.
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", cookieClientId)
      .maybeSingle();

    if (!client) return { kind: "needs-selection" };

    return {
      kind: "viewing",
      viewed: { clientId: client.id, clientName: client.name ?? "Client", isAdminViewingAs: true },
    };
  }

  return { kind: "not-permitted" };
}

/** The clients an admin can choose to view as, for the landing page's
 *  inline selector. Every client, not scoped to a clinic - see the file
 *  header on resolveViewedClient for why there's nothing to scope by. */
export async function listSelectableClients(
  supabase: SupabaseClient,
): Promise<SelectableClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });
  // An RLS-filtered read returns [] with no error - this only catches the
  // other kind of empty result (wrong column, permission actually denied,
  // etc.), but that distinction is exactly what a bad .eq("clinic_id", ...)
  // hid before, so log it rather than silently treating both the same.
  if (error) console.error("listSelectableClients failed:", error.message);
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
