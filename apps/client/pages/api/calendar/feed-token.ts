import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import { resolveViewedClient } from "../../../lib/admin-view-as";
import {
  generateFeedToken,
  feedUrlForToken,
  webcalUrlForToken,
} from "../../../lib/calendar-feed-tokens";

/**
 * Manages the signed-in family's own calendar feed token - the
 * authenticated half of migration 0041's calendar_feed_tokens feature (see
 * that migration's header for the full design). pages/appointments.tsx's
 * "Subscribe" control calls this to check the current state (GET), generate
 * a link (POST), and revoke one (DELETE). The unauthenticated other half -
 * what a calendar app actually polls - is
 * pages/api/calendar/feed/[token].ics.ts.
 *
 * At most one active token per user: POST revokes any existing active
 * token before minting a new one, matching the singular "Generate/Revoke"
 * framing this was asked for (BLOCKED-client.md's Round 4) rather than
 * letting a family accumulate an unbounded set of still-valid links with no
 * way to see or manage the older ones.
 *
 * Admin "view as" stays read-only, same as every other mutation in this app
 * (see lib/admin-view-as.ts's header) - refused up front here too, matching
 * pages/api/activities/status.ts and pages/api/sessions/request-change.ts,
 * rather than left for calendar_feed_tokens' own RLS to discover as an
 * opaque failure (an admin's calls here would fail
 * calendar_feed_tokens_insert/_update's `auth_role() = 'client'` check
 * anyway, since view-as never changes who the caller actually is).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const resolved = await resolveViewedClient(supabase, req, user.id);

  if (resolved.kind !== "viewing") {
    res.status(403).json({ error: "Not permitted" });
    return;
  }
  if (resolved.viewed.isAdminViewingAs) {
    res.status(403).json({
      error: "A calendar feed link can only be generated from the family's own account.",
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

    // Revoke-then-insert, not update-in-place: the old row stays as a
    // record that a link existed and when it stopped working, same
    // reasoning as revoke itself (migration 0041's header).
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
