import type { NextApiRequest, NextApiResponse } from "next";
import { createFeedLookupClient } from "../../../../lib/calendar-feed-tokens";
import { clinicTodayDateStr } from "../../../../lib/clinic-date";
import { readDefaultSessionDurationMinutes } from "../../../../lib/org-settings";
import { buildAppointmentsIcs, type IcsSession } from "../../../../lib/ics";

/**
 * The actual subscribable calendar feed - unauthenticated, token-gated
 * instead. See pages/api/calendar.ics.ts's header for the cookie-based
 * one-time download this exists alongside (that route stays untouched
 * rather than growing a second trust model), and migration 0044's header
 * for the full design behind the token itself, checked here in application
 * code rather than by RLS.
 *
 * Deliberately never reads a session cookie: a calendar app's own periodic
 * re-fetch of a webcal:// URL carries nothing else, so this route can't
 * rely on anything a signed-in browser tab would have that a calendar
 * app's background poll would not. `createFeedLookupClient()` bypasses RLS
 * entirely for exactly that reason - every query below is scoped by hand
 * instead (the token itself, then the client_id it resolves to), the same
 * "the app never asks for one" discipline lib/admin-view-as.ts's header
 * already applies to clinic_id.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).send("GET only");
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  const supabase = createFeedLookupClient();

  const { data: tokenRow, error: tokenError } = await supabase
    .from("calendar_feed_tokens")
    .select("user_id, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenError) {
    console.error("calendar feed: token lookup failed:", tokenError.message);
    res.status(500).send("Something went wrong. Try again shortly.");
    return;
  }
  if (!tokenRow || tokenRow.revoked_at) {
    // Same response whether the token never existed or was revoked - a
    // calendar app can't act on the distinction, and telling them apart
    // would only tell someone probing a guessed token whether it once
    // existed.
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, clinic_id")
    .eq("user_id", tokenRow.user_id)
    .maybeSingle();

  if (clientError || !client) {
    console.error(
      "calendar feed: client lookup failed:",
      clientError?.message ?? "no linked clients row"
    );
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  // Same scoping as pages/api/calendar.ics.ts's query (today forward,
  // non-cancelled) - kept identical deliberately so the one-time download
  // and the live subscription never quietly disagree about which sessions
  // belong in a family's calendar.
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, session_date, hour, minute, type, status")
    .eq("client_id", client.id)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("calendar feed: failed to load sessions:", sessionsError.message);
    res.status(500).send("Couldn't load appointments. Try again shortly.");
    return;
  }

  const durationMinutes = await readDefaultSessionDurationMinutes(supabase, client.clinic_id);
  const ics = buildAppointmentsIcs(
    (sessions ?? []) as IcsSession[],
    client.name ?? "Client",
    durationMinutes
  );

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  // No Content-Disposition: attachment, unlike calendar.ics.ts - a calendar
  // app fetching a webcal:// subscription wants the body inline, not a
  // download prompt it has no way to act on.
  res.status(200).send(ics);
}
