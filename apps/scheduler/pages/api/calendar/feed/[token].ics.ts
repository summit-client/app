import type { NextApiRequest, NextApiResponse } from "next";
import { createFeedLookupClient } from "../../../../lib/calendar-feed-tokens";
import { clinicTodayDateStr } from "../../../../lib/clinic-date";
import { buildStaffScheduleIcs, type IcsStaffSession } from "../../../../lib/ics";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DURATION_MINUTES = 60; // matches pages/index.jsx's exportICS() fallback

/**
 * The actual subscribable calendar feed for apps/scheduler - unauthenticated,
 * token-gated instead, exactly the same trust model as
 * apps/client/pages/api/calendar/feed/[token].ics.ts (see migration 0044's
 * header for the full design of the table this reads, migration 0070's for
 * why staff can use it at all, and migration 0071's for the `kind` column
 * this file now branches on).
 *
 * TWO FEED KINDS, ONE ROUTE, BOTH TOKEN-RESOLVED - NEVER REQUEST-SUPPLIED:
 *
 *   - `kind = 'personal'` (default - every token created before migration
 *     0071 is this kind): the token owner's OWN upcoming sessions, full
 *     detail (client name, everything - UNCHANGED from before this file's
 *     0071 update), PLUS every other clinic staff member's sessions as
 *     privacy-scrubbed busy blocks (time + session type + location name
 *     only - see "THE SCRUBBING" below). This is feature 1 of the task this
 *     was built from: colleague occupancy visibility, not colleague
 *     surveillance.
 *   - `kind = 'front_desk'`: EVERY session in the clinic, ALL of it
 *     privacy-scrubbed the same way, including the generating admin's own
 *     sessions - nobody gets full detail in this feed. Meant for a shared/
 *     ambient display (a front-desk screen), not a personal view.
 *
 * SAFETY ARGUMENT (this route's whole justification - read this before
 * changing anything below; see also lib/ics.ts's header for how the
 * scrubbing itself is implemented, and migration 0071's header for the RLS
 * side of this):
 *
 *   1. token -> calendar_feed_tokens row -> { user_id, kind, clinic_id }
 *      (service-role lookup; this request carries no session, so nothing
 *      else could scope it - same reasoning as apps/client's version and
 *      the original personal-only version of this file).
 *   2. clinic_id is read DIRECTLY off the resolved token row (a column
 *      migration 0044 already put there) for BOTH kinds - not derived from
 *      anything the request supplies. For `personal`, employment_records is
 *      additionally consulted (scoped by the token's own user_id, exactly as
 *      before 0071) to resolve which staff_id is "own" vs "colleague"; for
 *      `front_desk` there is no "own" concept at all, so this step is
 *      skipped entirely and every session in the token's clinic_id is
 *      scrubbed uniformly.
 *   3. The sessions query is scoped ONLY by that server-resolved clinic_id
 *      (`eq("clinic_id", ...)`) plus the standard upcoming/non-cancelled
 *      filters - never by anything from the request's query string, headers,
 *      or body. There is no "which staff member" or "which clinic" input
 *      this route accepts at all beyond the token itself.
 *   4. WITHIN that clinic-scoped result set, "own" vs "colleague" (personal
 *      feed) is decided purely by comparing each row's own `employee_id` to
 *      the server-resolved staff_id from step 2 - again nothing the request
 *      supplies.
 *   5. THE SCRUBBING (what makes "colleague" safe to include at all): a
 *      colleague/front-desk entry is built from a session record that NEVER
 *      had its client_id resolved to a name in the first place (see the
 *      `clientNameById` map below - only ever populated from "own" rows'
 *      client_id values) and NEVER had home_address selected from the
 *      database at all (not even in the initial sessions query's column
 *      list) - so there is no client name or home address anywhere in this
 *      route's memory to leak for those rows, not merely a field that's
 *      dropped before rendering. is_home_visit (a boolean, not PHI) is the
 *      only home-visit-related column read, and it exists only to decide
 *      whether to show a location name at all (never the address) - see
 *      lib/ics.ts's buildEvent(). The other staff member's own name/identity
 *      is likewise never looked up for a colleague/front-desk row (contrast
 *      with the "own" staff-name lookup, done exactly once, for the CALNAME
 *      of a personal feed only).
 *   6. clinic_id is applied as a second, redundant filter on every query
 *      below (locations, session_types, and - for personal - the sessions
 *      query itself) even where the referenced id is already clinic-scoped
 *      by construction - same "not left to RLS alone" defense-in-depth this
 *      schema already uses elsewhere (see apps/client/lib/org-settings.ts's
 *      header for the established precedent). This route uses the service
 *      role and therefore bypasses RLS entirely by design (see below), so
 *      this redundancy is the only thing standing between a coding mistake
 *      here and a cross-clinic leak.
 *
 *   A leaked PERSONAL token therefore exposes exactly one person's own
 *   upcoming schedule in full, plus their own clinic's aggregate occupancy
 *   with no client names, no addresses, and no colleague names attached -
 *   never another clinic's data, never a client identity, never a home
 *   address. A leaked FRONT-DESK token exposes only that same scrubbed
 *   occupancy view, for nobody in particular, never anyone's client roster
 *   or home addresses, and never a personal detail for anyone including
 *   whoever generated it.
 *
 * Deliberately never reads a session cookie, for the same reason
 * apps/client's version doesn't: a calendar app's periodic background poll
 * of a webcal:// URL carries nothing else. createFeedLookupClient()
 * (service-role) bypasses RLS entirely for exactly that reason - every query
 * below is scoped by hand instead, which is why the redundant clinic_id
 * filters in point 6 above matter as much as they do.
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
    .select("user_id, revoked_at, kind, clinic_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenError) {
    console.error("calendar feed: token lookup failed:", tokenError.message);
    res.status(500).send("Something went wrong. Try again shortly.");
    return;
  }
  if (!tokenRow || tokenRow.revoked_at) {
    // Same response whether the token never existed or was revoked - see
    // apps/client's identical route for why: a calendar app can't act on the
    // distinction, and telling them apart only helps someone probing a
    // guessed token. Same for a bad/missing clinic_id on the row (should be
    // impossible - `not null` since 0044 - but treated as "not valid" rather
    // than a 500 if it ever happened, for the same reason.)
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }
  if (!tokenRow.clinic_id) {
    console.error("calendar feed: token row has no clinic_id - refusing rather than guessing.");
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  if (tokenRow.kind === "front_desk") {
    await serveFrontDeskFeed(supabase, tokenRow.clinic_id, res);
    return;
  }

  await servePersonalFeed(supabase, tokenRow.user_id, tokenRow.clinic_id, res);
}

/** Common session row shape both branches query - a superset of what either
 *  branch needs, so one query shape serves both. `employee_id` is only used
 *  by the personal branch (to split "own" vs "colleague"); it is otherwise
 *  ignored, and is never used to look up or expose the colleague's name. */
type SessionRow = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  session_type_id: number | null;
  status: string;
  client_id: number | null;
  employee_id: number | null;
  location_id: number | null;
  is_home_visit: boolean;
};

/** Location names for a set of rows, scoped to the given clinic - used only
 *  to label a SCRUBBED entry ("@ Downtown Clinic"), never to resolve a
 *  home-visit address (home_address is never selected anywhere in this
 *  file). Rows with `is_home_visit` are excluded from the lookup entirely,
 *  not merely from the result - see the SUMMARY logic in lib/ics.ts, which
 *  also independently refuses to show a location for a home visit. */
async function loadLocationNames(
  supabase: SupabaseClient,
  rows: SessionRow[],
  clinicId: string
): Promise<Map<number, string>> {
  const locationIds = [
    ...new Set(
      rows
        .filter((s) => !s.is_home_visit)
        .map((s) => s.location_id)
        .filter((id): id is number => id != null)
    ),
  ];
  const byId = new Map<number, string>();
  if (locationIds.length === 0) return byId;

  const { data: locations, error } = await supabase
    .from("locations")
    .select("id, name")
    .in("id", locationIds)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("calendar feed: location name lookup failed:", error.message);
    return byId;
  }
  for (const l of locations ?? []) byId.set(l.id, l.name);
  return byId;
}

/** session_types durations for the clinic, keyed by the session type's ID
 *  (migration 0085), covering every type present across ALL rows a feed will
 *  render - own and colleague/front-desk alike. A session TYPE is not PHI and
 *  is already shown for the token owner's own sessions, so no new exposure.
 *
 *  Keyed on the id rather than the name it used to use: an admin renaming a
 *  session type would otherwise make `.in("name", ...)` miss for every session
 *  still carrying the old label, and every affected event in a subscribed
 *  calendar would silently become DEFAULT_DURATION_MINUTES long. A row with no
 *  pointer (pre-0085, name matched nothing) gets the default, which is what it
 *  got before too. */
async function loadDurationsByTypeId(
  supabase: SupabaseClient,
  rows: SessionRow[],
  clinicId: string
): Promise<Map<number, number>> {
  const typeIds = [...new Set(rows.map((s) => s.session_type_id).filter((t): t is number => t != null))];
  const byId = new Map<number, number>();
  if (typeIds.length === 0) return byId;

  const { data: types, error } = await supabase
    .from("session_types")
    .select("id, duration")
    .in("id", typeIds)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("calendar feed: session_types lookup failed:", error.message);
    return byId;
  }
  for (const t of types ?? []) {
    if (typeof t.duration === "number") byId.set(t.id as number, t.duration);
  }
  return byId;
}

/**
 * `kind = 'personal'` - the token owner's own upcoming sessions, full detail
 * (UNCHANGED from before migration 0071), plus every other clinic staff
 * member's sessions as scrubbed busy blocks. See this file's header for the
 * full safety argument.
 */
async function servePersonalFeed(
  supabase: SupabaseClient,
  ownerUserId: string,
  clinicId: string,
  res: NextApiResponse
) {
  // Step 2 of the header's resolution chain: the ONLY place staff_id enters
  // this request, and it comes from the token's user_id, never from
  // anything the caller supplied.
  const { data: employment, error: employmentError } = await supabase
    .from("employment_records")
    .select("staff_id, clinic_id")
    .eq("user_id", ownerUserId)
    .is("end_date", null)
    .not("staff_id", "is", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employmentError) {
    console.error("personal calendar feed: employment_records lookup failed:", employmentError.message);
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
  // employment.clinic_id and the token's own clinic_id should always agree
  // (both ultimately come from the same profile at the time the token was
  // created) - employment.clinic_id is used from here on for the sessions
  // query, matching the pre-0071 implementation exactly, with the token's
  // clinic_id as the redundant, independent check (see header point 6).
  const staffClinicId = employment.clinic_id ?? clinicId;

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("name")
    .eq("id", employment.staff_id)
    .eq("clinic_id", staffClinicId)
    .maybeSingle();

  if (staffError || !staffRow) {
    console.error(
      "personal calendar feed: staff lookup failed:",
      staffError?.message ?? "no matching staff row"
    );
    res.status(404).send("This calendar feed link is no longer valid.");
    return;
  }

  // Step 3 of the header's chain: clinic-wide now (feature 1's widening),
  // but still clinic-scoped by a server-resolved id, never by anything the
  // caller supplied - the ONLY thing that changed from the pre-0071 query is
  // the removal of `.eq("employee_id", employment.staff_id)`, which used to
  // make this personal-only; that split now happens in memory below instead.
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, session_date, hour, minute, type, session_type_id, status, client_id, employee_id, location_id, is_home_visit")
    .eq("clinic_id", staffClinicId)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("personal calendar feed: failed to load sessions:", sessionsError.message);
    res.status(500).send("Couldn't load appointments. Try again shortly.");
    return;
  }

  const rows = (sessions ?? []) as SessionRow[];
  const ownRows = rows.filter((s) => s.employee_id === employment.staff_id);
  const colleagueRows = rows.filter((s) => s.employee_id !== employment.staff_id);

  // Client names for the SUMMARY line - ONLY ever resolved for the token
  // owner's OWN sessions (see header point 5: this is what makes a
  // colleague row safe to include - there is no client name in memory for
  // it at any point, not merely one that gets dropped before rendering).
  const clientIds = [
    ...new Set(ownRows.map((s) => s.client_id).filter((id): id is number => id != null)),
  ];
  const clientNameById = new Map<number, string>();
  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds)
      .eq("clinic_id", staffClinicId);
    if (clientsError) {
      // Not fatal - the feed still renders, just with a generic label
      // instead of the client's name on any session this couldn't resolve.
      console.error("personal calendar feed: client name lookup failed:", clientsError.message);
    } else {
      for (const c of clients ?? []) clientNameById.set(c.id, c.name);
    }
  }

  const [locationNameById, durationByTypeId] = await Promise.all([
    loadLocationNames(supabase, colleagueRows, staffClinicId),
    loadDurationsByTypeId(supabase, rows, staffClinicId),
  ]);

  const icsSessions: IcsStaffSession[] = [
    ...ownRows.map((s) => ({
      id: s.id,
      session_date: s.session_date,
      hour: s.hour,
      minute: s.minute,
      type: s.type,
      sessionTypeId: s.session_type_id,
      status: s.status,
      scope: "own" as const,
      clientName: s.client_id != null ? clientNameById.get(s.client_id) ?? null : null,
    })),
    ...colleagueRows.map((s) => ({
      id: s.id,
      session_date: s.session_date,
      hour: s.hour,
      minute: s.minute,
      type: s.type,
      sessionTypeId: s.session_type_id,
      status: s.status,
      scope: "colleague" as const,
      isHomeVisit: s.is_home_visit,
      locationName: s.location_id != null ? locationNameById.get(s.location_id) ?? null : null,
    })),
  ];

  const ics = buildStaffScheduleIcs(
    icsSessions,
    `${staffRow.name ?? "Staff"} - Summit Schedule`,
    (session) => (session.sessionTypeId != null && durationByTypeId.get(session.sessionTypeId as number)) || DEFAULT_DURATION_MINUTES
  );

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  // No Content-Disposition: attachment - same as apps/client's version, a
  // webcal:// subscription wants the body inline, not a download prompt.
  res.status(200).send(ics);
}

/**
 * `kind = 'front_desk'` - every session in the clinic, all of it scrubbed
 * the same way as a personal feed's colleague entries. Nobody, including
 * whoever generated this token, gets full detail here - see this file's
 * header.
 */
async function serveFrontDeskFeed(supabase: SupabaseClient, clinicId: string, res: NextApiResponse) {
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, session_date, hour, minute, type, session_type_id, status, client_id, employee_id, location_id, is_home_visit")
    .eq("clinic_id", clinicId)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("front-desk calendar feed: failed to load sessions:", sessionsError.message);
    res.status(500).send("Couldn't load appointments. Try again shortly.");
    return;
  }

  const rows = (sessions ?? []) as SessionRow[];

  // No client lookup at all in this branch - deliberately not even
  // attempted (contrast with servePersonalFeed's ownRows-only lookup) since
  // every row here renders scrubbed; see header point 5.
  const [locationNameById, durationByTypeId, clinicRow] = await Promise.all([
    loadLocationNames(supabase, rows, clinicId),
    loadDurationsByTypeId(supabase, rows, clinicId),
    supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle(),
  ]);

  if (clinicRow.error) {
    // Not fatal - only affects the CALNAME cosmetic label.
    console.error("front-desk calendar feed: clinic name lookup failed:", clinicRow.error.message);
  }

  const icsSessions: IcsStaffSession[] = rows.map((s) => ({
    id: s.id,
    session_date: s.session_date,
    hour: s.hour,
    minute: s.minute,
    type: s.type,
    sessionTypeId: s.session_type_id,
    status: s.status,
    scope: "colleague" as const,
    isHomeVisit: s.is_home_visit,
    locationName: s.location_id != null ? locationNameById.get(s.location_id) ?? null : null,
  }));

  const clinicName = clinicRow.data?.name || "Clinic";
  const ics = buildStaffScheduleIcs(
    icsSessions,
    `${clinicName} Front Desk - Summit Schedule`,
    (session) => (session.sessionTypeId != null && durationByTypeId.get(session.sessionTypeId as number)) || DEFAULT_DURATION_MINUTES
  );

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.status(200).send(ics);
}
