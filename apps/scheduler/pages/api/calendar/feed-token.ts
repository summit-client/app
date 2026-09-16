import type { NextApiRequest, NextApiResponse } from "next";
import { sessionFreshness } from "@summit/proxy-auth";
import { createClient } from "../../../lib/supabase-server";
import {
  generateFeedToken,
  feedUrlForToken,
  webcalUrlForToken,
} from "../../../lib/calendar-feed-tokens";

type FeedKind = "personal" | "front_desk";

/** GET/DELETE pass `?kind=front_desk` on the query string; POST passes
 *  `{ kind: "front_desk" }` in a JSON body. Anything else - absent, an
 *  unrecognized value, an array from a duplicated query param - resolves to
 *  "personal", which is this route's original, only-ever behavior before
 *  migration 0071 added the column. This is what keeps every existing call
 *  from components/CalendarFeedPanel.tsx (which never sends `kind` at all)
 *  working completely unchanged. */
function resolveKind(req: NextApiRequest): FeedKind {
  const raw = req.method === "POST" ? (req.body as { kind?: unknown } | undefined)?.kind : req.query.kind;
  return raw === "front_desk" ? "front_desk" : "personal";
}

/**
 * Manages the signed-in user's calendar feed token(s) - the staff-side
 * counterpart to apps/client/pages/api/calendar/feed-token.ts, against the
 * same `calendar_feed_tokens` table (migration 0044), admitting
 * clinician/scheduler/admin/supervisor for a PERSONAL token per migration
 * 0070, and now a second, distinct FRONT-DESK token kind per migration
 * 0071 (admin/scheduler only - see that migration's header for exactly who
 * and why). The "My calendar feed" panel in components/CalendarFeedPanel.tsx
 * calls this with no `kind` (defaulting to "personal") to check the current
 * state (GET), generate a link (POST), and revoke one (DELETE) - completely
 * unchanged by this file's 0071 update. The admin-only front-desk section in
 * pages/index.jsx's SettingsView calls the same three methods with
 * `kind: "front_desk"` for the clinic-wide feed instead. The unauthenticated
 * other half - what a calendar app actually polls, for either kind - is
 * pages/api/calendar/feed/[token].ics.ts.
 *
 * At most one active token PER KIND per user: POST revokes any existing
 * active token of the SAME kind before minting a new one, so generating a
 * new personal link never revokes an unrelated, still-active front-desk
 * link for the same admin, and vice versa - see the POST handler's own
 * comment on the revoke-then-insert step.
 *
 * No admin "view as" check here, unlike apps/client's version - this portal
 * has no equivalent concept (see the task this was scoped from), so that
 * part of the client-portal route is deliberately not ported.
 *
 * sessionFreshness() FIRST, before anything else - unlike apps/client's
 * equivalent route, this app's proxy.ts matcher excludes /api entirely
 * ("/((?!_next/static|_next/image|favicon.ico|api).*)"), so this route gets
 * none of the cross-portal refresh-token-race protection proxy.ts normally
 * provides for free. See pages/api/match.ts's header (the one other route in
 * this app that already had to solve this) and lib/supabase-server.ts's own
 * header for the full reasoning - CLAUDE.md's "cross-portal refresh-token
 * race" trap is exactly what skipping this would reopen.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const freshness = await sessionFreshness(
    Object.entries(req.cookies).map(([name, value]) => ({ name, value: value as string })),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  if (freshness === "stale") {
    res.status(401).json({ error: "Your session needs to refresh.", code: "SESSION_STALE" });
    return;
  }

  const supabase = createClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const kind = resolveKind(req);

  // clinic_id to insert a front-desk row under, resolved up front (both
  // POST and the role gate below need it) - set only on the front_desk
  // branch; the personal branch keeps its own separate profile fetch inside
  // the POST handler below, byte-for-byte as it was before this file learned
  // about `kind`, so a personal request's behavior/error messages are
  // provably unaffected by this change.
  let frontDeskClinicId: string | null = null;

  if (kind === "personal") {
    // Every method below needs this: GET's feed status is meaningless without
    // knowing which staff member it's for, and the feed route
    // (feed/[token].ics.ts) can only ever return sessions for a resolved
    // staff_id in the first place, so a caller who can't be resolved to one
    // gets told clearly why here rather than generating a token that would
    // just come back empty from the feed route forever.
    const { data: employment, error: employmentError } = await supabase
      .from("employment_records")
      .select("staff_id, clinic_id")
      .eq("user_id", user.id)
      .is("end_date", null)
      .not("staff_id", "is", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (employmentError) {
      console.error("feed-token: employment_records lookup failed:", employmentError.message);
      res.status(500).json({ error: "Couldn't resolve your scheduling record. Try again." });
      return;
    }

    if (!employment?.staff_id) {
      res.status(409).json({
        error:
          "Your account isn't linked to a scheduling resource yet - ask your administrator to check your employment record.",
        code: "NO_STAFF_LINK",
      });
      return;
    }
  } else {
    // front_desk - migration 0071 restricts INSERT to admin/scheduler at
    // the RLS layer already, but checking the role here too gives a clear,
    // specific reason instead of either a raw Postgres RLS error (POST) or
    // a silently-empty "not active" (GET/DELETE) that gives no hint a
    // clinician could never have one in the first place - CLAUDE.md's "RLS
    // returns empty sets, not errors" trap, avoided by checking up front.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.clinic_id) {
      console.error(
        "feed-token: could not resolve clinic_id for a front-desk request:",
        profileError?.message ?? "no clinic_id on profile"
      );
      res.status(500).json({ error: "Couldn't resolve your clinic. Try again." });
      return;
    }

    if (profile.role !== "admin" && profile.role !== "scheduler") {
      res.status(403).json({
        error: "Only an admin or scheduler can manage the front-desk calendar feed.",
        code: "FRONT_DESK_ROLE_EXCLUDED",
      });
      return;
    }

    frontDeskClinicId = profile.clinic_id;
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("calendar_feed_tokens")
      .select("token")
      .eq("kind", kind)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("feed-token GET: lookup failed:", error.message);
      res.status(500).json({ error: "Couldn't load your calendar feed status." });
      return;
    }

    res.status(200).json({
      active: Boolean(data),
      feedUrl: data ? feedUrlForToken(data.token) : null,
      webcalUrl: data ? webcalUrlForToken(data.token) : null,
    });
    return;
  }

  if (req.method === "POST") {
    let clinicId = frontDeskClinicId;

    if (kind === "personal") {
      // clinic_id for the new row - from the caller's own profile, same as
      // apps/client's version, not from the employment_records row above
      // (both should always agree; profiles is the identity table every other
      // insert in this app already scopes against, so this stays consistent
      // with that rather than introducing a second source for the same value).
      // Unchanged from before this file learned about `kind`.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("clinic_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.clinic_id) {
        console.error(
          "feed-token POST: could not resolve clinic_id:",
          profileError?.message ?? "no clinic_id on profile"
        );
        res.status(500).json({ error: "Couldn't resolve your clinic. Try again." });
        return;
      }
      clinicId = profile.clinic_id;
    }

    // Revoke-then-insert, not update-in-place - same reasoning as
    // apps/client's version (migration 0044's header): the old row stays as
    // a record that a link existed and when it stopped working. Scoped to
    // THIS SAME kind only (`.eq("kind", kind)`) so generating a new personal
    // token never revokes an unrelated, still-active front-desk token for
    // the same admin, and vice versa - the two kinds are independent links
    // with independent lifecycles even though they share one user_id.
    //
    // front_desk is scoped by clinic_id, not user_id: it's one shared link
    // the clinic's admins/schedulers jointly manage (migration 0072's own
    // reasoning for widening its select/update RLS the same way), not each
    // admin's own private front-desk token - regenerating it should replace
    // whichever one is currently active for this clinic, not leave a
    // colleague's still-active row behind because it belongs to a different
    // user_id. personal keeps its existing per-user scoping untouched.
    const revokeQuery = supabase
      .from("calendar_feed_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("kind", kind)
      .is("revoked_at", null);
    const { error: revokeError } = await (
      kind === "front_desk"
        ? revokeQuery.eq("clinic_id", clinicId)
        : revokeQuery.eq("user_id", user.id)
    );

    if (revokeError) {
      console.error("feed-token POST: failed to revoke prior token:", revokeError.message);
      res.status(500).json({ error: "Couldn't generate a new link. Try again." });
      return;
    }

    const token = generateFeedToken();
    const { error: insertError } = await supabase.from("calendar_feed_tokens").insert({
      clinic_id: clinicId,
      user_id: user.id,
      token,
      kind,
    });

    if (insertError) {
      console.error("feed-token POST: insert failed:", insertError.message);
      res.status(500).json({ error: "Couldn't generate a new link. Try again." });
      return;
    }

    res.status(201).json({
      active: true,
      feedUrl: feedUrlForToken(token),
      webcalUrl: webcalUrlForToken(token),
    });
    return;
  }

  if (req.method === "DELETE") {
    // Same clinic_id-not-user_id scoping as POST's revoke step above, and
    // for the same reason: a front-desk token is a shared clinic resource,
    // so any admin/scheduler can revoke the active one regardless of which
    // of them originally generated it.
    const deleteQuery = supabase
      .from("calendar_feed_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("kind", kind)
      .is("revoked_at", null);
    const { error } = await (
      kind === "front_desk"
        ? deleteQuery.eq("clinic_id", frontDeskClinicId as string)
        : deleteQuery.eq("user_id", user.id)
    );

    if (error) {
      console.error("feed-token DELETE: revoke failed:", error.message);
      res.status(500).json({ error: "Couldn't revoke your calendar feed link. Try again." });
      return;
    }

    res.status(200).json({ active: false, feedUrl: null, webcalUrl: null });
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).json({ error: "GET, POST, or DELETE only" });
}
