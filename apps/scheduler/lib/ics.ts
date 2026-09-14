import { clinicWallTimeToUtc } from "./clinic-date";

/**
 * ICS builder for apps/scheduler's two calendar_feed_tokens-backed feeds
 * (pages/api/calendar/feed/[token].ics.ts) - a staff member's own personal
 * feed (`kind = 'personal'`) and the clinic-wide "front desk" feed
 * (`kind = 'front_desk'`, migration 0071). Same RFC 5545 mechanics as
 * apps/client/lib/ics.ts (line folding at 75 octets, TEXT escaping, stable
 * per-session UIDs) - copied rather than shared, since the two apps have no
 * common package to put it in and the event content itself differs (a
 * family's calendar names the child once per event; a staff member's names
 * the client and, since this app - unlike apps/client - actually has
 * session_types with a real per-type duration, uses that instead of one
 * flat org-wide default).
 *
 * `scope` (added alongside migration 0071's account-owner-approved
 * widening, see that migration's header) is what separates a FULL-DETAIL
 * event from a PRIVACY-SCRUBBED "busy" block within the same feed:
 *
 *   - "own"       - exactly the original, unchanged behavior: a personal
 *                    feed's token-owner's own sessions, client name and all.
 *                    Never used in a front-desk feed (nobody's own sessions
 *                    get special treatment there - see [token].ics.ts).
 *   - "colleague" - every OTHER session visible in the feed: a personal
 *                    feed's other-staff entries, and EVERY entry in a
 *                    front-desk feed (including the generating admin's own).
 *                    buildEvent() below renders this scope with no client
 *                    name, no staff name, no home-visit address - see its
 *                    own comment for the exact SUMMARY/DESCRIPTION text and
 *                    why each field was chosen.
 *
 * `scope` defaults to "own" when absent so nothing about the original,
 * already-shipped single-purpose call from before migration 0071 would
 * silently change shape if some future caller forgot to set it - though as
 * of this change every caller in this file's one consumer sets it
 * explicitly.
 */
export type IcsStaffSession = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  status: string;
  scope?: "own" | "colleague";
  /** Resolved client name for the SUMMARY line - may be null if the client
   *  row couldn't be resolved (deleted client, bad data); the event still
   *  renders, just with a generic label instead of silently dropping the
   *  session from the feed. ONLY ever read for scope "own" - see buildEvent
   *  below. A caller building a "colleague" entry should simply not resolve
   *  a client name for it in the first place (defense in depth: even if
   *  this field were set by mistake on a colleague entry, buildEvent never
   *  reads it for that scope). */
  clientName?: string | null;
  /** Resolved location name (locations.name) for a "colleague" entry's
   *  SUMMARY - never the address, and never read at all for scope "own"
   *  (the original personal feed never showed location, and this change
   *  does not add it there - see buildEvent's comment). Ignored when
   *  isHomeVisit is true, since a home visit's location is the client's own
   *  address, never shown to a colleague. */
  locationName?: string | null;
  /** sessions.is_home_visit - for a "colleague" entry, forces the SUMMARY to
   *  a generic "home visit" busy-block instead of any location name, and
   *  home_address is never selected by the caller in the first place (see
   *  [token].ics.ts) so there is nothing here that could leak it even by
   *  accident. */
  isHomeVisit?: boolean;
};

const ICS_LINE_MAX_OCTETS = 75;

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= ICS_LINE_MAX_OCTETS) {
    return line;
  }

  const segments: string[] = [];
  let start = 0;
  let limit = ICS_LINE_MAX_OCTETS;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    segments.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = ICS_LINE_MAX_OCTETS - 1;
  }

  return segments.join("\r\n ");
}

function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildEvent(
  session: IcsStaffSession,
  dtstamp: string,
  durationMinutes: number
): string[] {
  // Same UID scheme as apps/client's export - stable per session id, so a
  // calendar app re-fetching this feed updates the existing event rather
  // than duplicating it. Distinct suffix (-staff) so the two feeds' UIDs
  // never collide if the same underlying session row is ever visible in
  // both a family's and a staff member's calendar app side by side. Shared
  // by both scopes deliberately - a given session id is exactly one
  // person's session, so it is never rendered as "own" in one place and
  // "colleague" in another WITHIN the same feed (see this file's header);
  // reusing the format across the personal and front-desk feeds (separate
  // ICS documents) is fine, since UID only has to be unique within one feed.
  const uid = `session-${session.id}-staff@summitclient.io`;
  const base = session.type || "Session";

  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];

  if (session.scope === "colleague") {
    // PRIVACY-SCRUBBED busy block (migration 0071's account-owner-approved
    // widening - see this file's header and [token].ics.ts's own safety-
    // argument comment for the full reasoning). Deliberately excludes:
    //   - the client's name/identifier (never read from this session at all
    //     - see IcsStaffSession.clientName's own comment)
    //   - the home-visit address (never read either - see .isHomeVisit)
    //   - which specific colleague this is (no staff name anywhere below -
    //     the whole point is occupancy visibility, not surveillance)
    // and includes exactly what the task asked for: the time block (DTSTART
    // /DTEND below, same computation as "own"), the session type, and the
    // location NAME only.
    const summary = escapeText(
      session.isHomeVisit
        ? `Busy – ${base} (home visit)`
        : session.locationName
        ? `Busy – ${base} @ ${session.locationName}`
        : `Busy – ${base}`
    );
    const description = escapeText(
      "This time belongs to another staff member at this clinic - details are private to them."
    );

    if (session.hour === null) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(session.session_date)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(session.session_date, 1))}`);
    } else {
      const minute = session.minute ?? 0;
      const start = clinicWallTimeToUtc(session.session_date, session.hour, minute);
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      lines.push(`DTSTART:${formatUtcStamp(start)}`);
      lines.push(`DTEND:${formatUtcStamp(end)}`);
    }
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${description}`);
  } else {
    // scope "own" - UNCHANGED from the original personal-feed
    // implementation (pre-migration-0071). Do not add fields here (e.g.
    // location) without confirming that is a deliberate change to the
    // owner's own event shape, not scrubbing logic leaking into this branch.
    const summary = escapeText(session.clientName ? `${base} - ${session.clientName}` : base);

    if (session.hour === null) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(session.session_date)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(session.session_date, 1))}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(
        `DESCRIPTION:${escapeText(
          "Time not yet set for this session - check the Summit Scheduler to confirm."
        )}`
      );
    } else {
      const minute = session.minute ?? 0;
      const start = clinicWallTimeToUtc(session.session_date, session.hour, minute);
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      lines.push(`DTSTART:${formatUtcStamp(start)}`);
      lines.push(`DTEND:${formatUtcStamp(end)}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DESCRIPTION:${escapeText(`Status: ${session.status}`)}`);
    }
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Builds a complete RFC 5545 iCalendar document for either feed kind -
 * `sessions` should already be filtered to upcoming/non-cancelled and have
 * `scope` set on every entry by the caller (pages/api/calendar/feed/[token]
 * .ics.ts's query), same discipline as apps/client/lib/ics.ts's equivalent
 * function.
 *
 * `calendarName` is used verbatim as X-WR-CALNAME - the caller decides what
 * that should say (a personal feed's own "{staff name} - Summit Schedule",
 * unchanged from before migration 0071; a front-desk feed's
 * "{clinic name} Front Desk - Summit Schedule" instead - see
 * [token].ics.ts). Renamed from this function's original `staffName`
 * parameter now that it is not always a staff member's name; every call
 * site was updated in the same change.
 *
 * `durationMinutesFor` resolves a session's duration from its `type`
 * (session_types.name -> session_types.duration) rather than one flat
 * org-wide default - unlike apps/client, this app already loads
 * session_types for the same clinic these sessions belong to, so a more
 * accurate per-type duration is available and this uses it, matching
 * pages/index.jsx's existing exportICS()'s own duration lookup
 * (`sessionTypes.find(s => s.name === b.type)`, `st?.duration || 60`) rather
 * than inventing a different fallback story for the same data.
 */
export function buildStaffScheduleIcs(
  sessions: IcsStaffSession[],
  calendarName: string,
  durationMinutesFor: (session: IcsStaffSession) => number
): string {
  const dtstamp = formatUtcStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Summit Scheduler//Staff Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const session of sessions) {
    lines.push(...buildEvent(session, dtstamp, durationMinutesFor(session)));
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
