import { clinicWallTimeToUtc } from "./clinic-date";

/**
 * ICS builder for a scheduling staff member's own upcoming-sessions feed
 * (pages/api/calendar/feed/[token].ics.ts). Same RFC 5545 mechanics as
 * apps/client/lib/ics.ts (line folding at 75 octets, TEXT escaping, stable
 * per-session UIDs) - copied rather than shared, since the two apps have no
 * common package to put it in and the event content itself differs (a
 * family's calendar names the child once per event; a staff member's names
 * the client and, since this app - unlike apps/client - actually has
 * session_types with a real per-type duration, uses that instead of one
 * flat org-wide default).
 */
export type IcsStaffSession = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  status: string;
  /** Resolved client name for the SUMMARY line - may be null if the client
   *  row couldn't be resolved (deleted client, bad data); the event still
   *  renders, just with a generic label instead of silently dropping the
   *  session from the feed. */
  clientName?: string | null;
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
  // both a family's and a staff member's calendar app side by side.
  const uid = `session-${session.id}-staff@summitclient.io`;
  const base = session.type || "Session";
  const summary = escapeText(session.clientName ? `${base} - ${session.clientName}` : base);

  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];

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

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Builds a complete RFC 5545 iCalendar document for one staff member's own
 * upcoming, non-cancelled sessions - `sessions` should already be filtered
 * that way by the caller (pages/api/calendar/feed/[token].ics.ts's query),
 * same discipline as apps/client/lib/ics.ts's equivalent function.
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
  staffName: string,
  durationMinutesFor: (session: IcsStaffSession) => number
): string {
  const dtstamp = formatUtcStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Summit Scheduler//Staff Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${staffName} - Summit Schedule`)}`,
  ];

  for (const session of sessions) {
    lines.push(...buildEvent(session, dtstamp, durationMinutesFor(session)));
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
