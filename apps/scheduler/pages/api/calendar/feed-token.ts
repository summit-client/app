import type { NextApiRequest, NextApiResponse } from "next";
import { sessionFreshness } from "@summit/proxy-auth";
import { createClient } from "../../../lib/supabase-server";
import {
  generateFeedToken,
  feedUrlForToken,
  webcalUrlForToken,
} from "../../../lib/calendar-feed-tokens";

/**
 * Manages the signed-in scheduling staff member's own calendar feed token -
 * the staff-side counterpart to apps/client/pages/api/calendar/feed-token.ts,
 * against the same `calendar_feed_tokens` table (migration 0044), now
 * admitting clinician/scheduler/admin/supervisor per migration 0070 (see
 * that migration's header for exactly who and why). The "My calendar feed"
 * panel in components/Sidebar.tsx calls this to check the current state
 * (GET), generate a link (POST), and revoke one (DELETE). The unauthenticated
 * other half - what a calendar app actually polls - is
 * pages/api/calendar/feed/[token].ics.ts.
 *
 * At most one active token per user, same as apps/client's version: POST
 * revokes any existing active token before minting a new one.
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

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("calendar_feed_tokens")
      .select("token")
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
    // clinic_id for the new row - from the caller's own profile, same as
    // apps/client's version, not from the employment_records row above
    // (both should always agree; profiles is the identity table every other
    // insert in this app already scopes against, so this stays consistent
    // with that rather than introducing a second source for the same value).
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

    // Revoke-then-insert, not update-in-place - same reasoning as
    // apps/client's version (migration 0044's header): the old row stays as
    // a record that a link existed and when it stopped working.
    const { error: revokeError } = await supabase
      .from("calendar_feed_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("feed-token POST: failed to revoke prior token:", revokeError.message);
      res.status(500).json({ error: "Couldn't generate a new link. Try again." });
      return;
    }

    const token = generateFeedToken();
    const { error: insertError } = await supabase.from("calendar_feed_tokens").insert({
      clinic_id: profile.clinic_id,
      user_id: user.id,
      token,
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
    const { error } = await supabase
      .from("calendar_feed_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null);

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
