import type { NextApiRequest, NextApiResponse } from "next";
import { createFeedLookupClient } from "../../../../lib/calendar-feed-tokens";
import { clinicTodayDateStr } from "../../../../lib/clinic-date";
import { buildStaffScheduleIcs, type IcsStaffSession } from "../../../../lib/ics";

/**
 * The actual subscribable calendar feed for scheduling staff - unauthenticated,
 * token-gated instead, exactly the same trust model as
 * apps/client/pages/api/calendar/feed/[token].ics.ts (see migration 0044's
 * header for the full design of the table this reads, and migration 0070's
 * for why staff can use it at all now).
 *
 * SCOPE, DELIBERATE: this returns ONE staff member's OWN upcoming sessions
 * only - never the clinic's whole schedule. A bearer-token URL is a real PHI
 * exposure surface (whoever holds the link, or whoever it leaks to, reads it
 * with no further check), and a clinic-wide feed reachable off one guessable
 * -if-leaked token was explicitly considered and rejected for tonight's scope
 * - see this route's resolution chain below for exactly how that's enforced,
 * not just asserted.
 *
 * RESOLUTION CHAIN (this is the whole safety argument for this route):
 *
 *   1. token -> calendar_feed_tokens row -> user_id (service-role lookup;
 *      this request carries no session, so nothing else could scope it -
 *      same reasoning as apps/client's version).
 *   2. user_id -> employment_records -> staff_id, scoped to a CURRENT
 *      (end_date is null) row that actually HAS a staff_id (nullable - see
 *      migration 0026's header: plenty of employees are never booked). A
 *      user with no current staff-linked employment gets the same generic
 *      "no longer valid" response as an unknown/revoked token - nothing
 *      about that response tells a caller which case it was (see the 404
 *      branches below).
 *   3. staff_id (+ the clinic_id that same employment_records row carries)
 *      is the ONLY thing the sessions query is scoped by - `employee_id =
 *      staff_id`, one specific bigint resolved server-side from the token,
 *      never anything the request itself supplies. clinic_id is added as a
 *      second, redundant filter (same "not left to RLS alone" defense-in-
 *      depth this schema already uses elsewhere - see
 *      apps/client/lib/org-settings.ts's header for the established
 *      precedent) even though staff.id values are already globally unique,
 *      not per-clinic-reused.
 *   4. No parameter in this request (query string, headers, body) ever
 *      reaches the sessions query except by way of steps 1-3. There is no
 *      "which staff member" or "which clinic" input this route accepts at
 *      all - the token is the only input, and it resolves to exactly one
 *      staff_id or the request is refused. A leaked token therefore exposes
 *      exactly one person's own upcoming schedule, never anyone else's and
 *      never the clinic's roster-wide calendar.
 *
 * Deliberately never reads a session cookie, for the same reason
 * apps/client's version doesn't: a calendar app's periodic background poll
 * of a webcal:// URL carries nothing else. createFeedLookupClient()
 * (service-role) bypasses RLS entirely for exactly that reason - every query
 * below is scoped by hand instead.
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
    console.error("staff calendar feed: token lookup failed:", tokenError.message);
    res.status(500).send("Something went wrong. Try again shortly.");
    return;
  }
  if (!tokenRow || tokenRow.revoked_at) {
    // Same response whether the token never existed or was revoked - see
    // apps/client's identical route for why: a calendar app can't act on the
    // distinction, and telling them apart only helps someone probing a
    // guessed token.
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  // Step 2 of the resolution chain above: the ONLY place staff_id and
  // clinic_id enter this request, and both come from the token's user_id,
  // never from anything the caller supplied.
  const { data: employment, error: employmentError } = await supabase
    .from("employment_records")
    .select("staff_id, clinic_id")
    .eq("user_id", tokenRow.user_id)
    .is("end_date", null)
    .not("staff_id", "is", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employmentError) {
    console.error("staff calendar feed: employment_records lookup failed:", employmentError.message);
    res.status(500).send("Something went wrong. Try again shortly.");
    return;
  }
  if (!employment?.staff_id) {
    // Token is valid but the person it belongs to has no current
    // staff-linked employment (never had one, or it ended/was unlinked
    // since the token was generated) - same undifferentiated 404 as above,
    // for the same reason.
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("name")
    .eq("id", employment.staff_id)
    .eq("clinic_id", employment.clinic_id)
    .maybeSingle();

  if (staffError || !staffRow) {
    console.error(
      "staff calendar feed: staff lookup failed:",
      staffError?.message ?? "no matching staff row"
    );
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  // Step 3: employee_id = this one resolved staff_id, plus the redundant
  // clinic_id filter - see this file's header for why both.
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, session_date, hour, minute, type, status, client_id")
    .eq("employee_id", employment.staff_id)
    .eq("clinic_id", employment.clinic_id)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("staff calendar feed: failed to load sessions:", sessionsError.message);
    res.status(500).send("Couldn't load appointments. Try again shortly.");
    return;
  }

  const rows = sessions ?? [];

  // Client names for the SUMMARY line - one bulk lookup rather than N+1,
  // scoped to this same clinic (redundant with the sessions query's own
  // clinic_id filter, same defense-in-depth reasoning as above).
  const clientIds = [...new Set(rows.map((s) => s.client_id).filter((id): id is number => id != null))];
  const clientNameById = new Map<number, string>();
  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds)
      .eq("clinic_id", employment.clinic_id);
    if (clientsError) {
      // Not fatal - the feed still renders, just with a generic label
      // instead of the client's name on any session this couldn't resolve.
      console.error("staff calendar feed: client name lookup failed:", clientsError.message);
    } else {
      for (const c of clients ?? []) clientNameById.set(c.id, c.name);
    }
  }

  // session_types durations for this clinic, so DTEND reflects the actual
  // booked type instead of one flat org-wide default - see lib/ics.ts's
  // header for why this app can (and pages/index.jsx's exportICS() already
  // does) do better than apps/client's org-default fallback.
  const typeNames = [...new Set(rows.map((s) => s.type).filter((t): t is string => Boolean(t)))];
  const durationByType = new Map<string, number>();
  if (typeNames.length > 0) {
    const { data: types, error: typesError } = await supabase
      .from("session_types")
      .select("name, duration")
      .in("name", typeNames)
      .eq("clinic_id", employment.clinic_id);
    if (typesError) {
      console.error("staff calendar feed: session_types lookup failed:", typesError.message);
    } else {
      for (const t of types ?? []) {
        if (typeof t.duration === "number") durationByType.set(t.name, t.duration);
      }
    }
  }
  const DEFAULT_DURATION_MINUTES = 60; // matches pages/index.jsx's exportICS() fallback

  const icsSessions: IcsStaffSession[] = rows.map((s) => ({
    id: s.id,
    session_date: s.session_date,
    hour: s.hour,
    minute: s.minute,
    type: s.type,
    status: s.status,
    clientName: s.client_id != null ? clientNameById.get(s.client_id) ?? null : null,
  }));

  const ics = buildStaffScheduleIcs(
    icsSessions,
    staffRow.name ?? "Staff",
    (session) => (session.type && durationByType.get(session.type)) || DEFAULT_DURATION_MINUTES
  );

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  // No Content-Disposition: attachment - same as apps/client's version, a
  // webcal:// subscription wants the body inline, not a download prompt.
  res.status(200).send(ics);
}
