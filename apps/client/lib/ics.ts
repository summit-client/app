import { clinicWallTimeToUtc } from "./clinic-date";

/** The columns pages/api/calendar.ics.ts actually selects - the same
 *  session shape pages/appointments.tsx already fetches, minus `status`
 *  and `staff` which the export doesn't need (cancelled sessions are
 *  filtered out before this ever runs). */
export type IcsSession = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  /**
   * Whose session, when the export covers more than one child. Omitted for a
   * single-child export, where repeating the name in every event title is
   * noise in a calendar the parent already knows the subject of.
   */
  childName?: string | null;
};

const ICS_LINE_MAX_OCTETS = 75;

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline must be
 *  escaped in TEXT values. Backslash first, or escaping the other
 *  characters would double-escape the backslash this function itself
 *  inserts. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: a content line longer than 75 octets (excluding the line
 * break) must be "folded" - split at a boundary and continued on the next
 * physical line with a leading space, which itself counts toward that
 * line's 75-octet budget. Folds on UTF-8 byte length, not character
 * count (a multi-byte character - an accented name, say - must never be
 * split across the boundary, which would corrupt it), by backing off the
 * split point while sitting on a UTF-8 continuation byte.
 */
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
    // Continuation lines lose 1 octet of budget to the leading space
    // RFC 5545 requires on every folded line after the first.
    limit = ICS_LINE_MAX_OCTETS - 1;
  }

  return segments.join("\r\n ");
}

function formatUtcStamp(date: Date): string {
  // "2026-08-31T18:00:00.000Z" -> "20260831T180000Z"
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

function buildEvent(session: IcsSession, dtstamp: string, durationMinutes: number): string[] {
  // Stable per session id, not regenerated per download - a calendar app
  // re-importing this feed later updates the existing event instead of
  // creating a duplicate.
  const uid = `session-${session.id}@summitclient.io`;
  // The child leads the title on a family export. In a calendar app the
  // summary is often all that fits, and "Maya - Therapy Session" is the half
  // a parent with two children actually needs.
  const base = session.type || "Therapy Session";
  const summary = escapeText(session.childName ? `${session.childName} - ${base}` : base);

  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];

  if (session.hour === null) {
    // No time set for this session yet - an all-day placeholder is honest
    // about what's actually known, instead of either inventing a time or
    // silently dropping the appointment from the export.
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(session.session_date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(session.session_date, 1))}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(
      `DESCRIPTION:${escapeText(
        "Time not yet set for this session - check the Summit Client Portal or contact your clinic to confirm."
      )}`
    );
  } else {
    const minute = session.minute ?? 0;
    const start = clinicWallTimeToUtc(session.session_date, session.hour, minute);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    lines.push(`DTSTART:${formatUtcStamp(start)}`);
    lines.push(`DTEND:${formatUtcStamp(end)}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(
      `DESCRIPTION:${escapeText(
        // durationMinutes is the org's own configured default
        // (org.defaultSessionDuration via lib/org-settings.ts), not this
        // specific session's actual length - no session_types join or
        // duration column is available anywhere this app queries, only the
        // org-wide default this event falls back to. Still says
        // "estimated" for that reason, not because the number itself is a
        // guess.
        `Estimated ${durationMinutes}-minute duration (your clinic's default session length) - exact length isn't available here. Check the Summit Client Portal or contact your clinic to confirm.`
      )}`
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Builds a complete RFC 5545 iCalendar document for a client's upcoming
 * appointments - CRLF line endings, folded at 75 octets, text values
 * escaped. `sessions` should already be filtered to upcoming/non-cancelled
 * (pages/api/calendar.ics.ts and pages/api/calendar/feed/[token].ics.ts
 * both do this at the query level, matching pages/index.tsx's "Upcoming
 * Sessions" query) - this function doesn't filter anything itself, it
 * exports whatever it's given.
 *
 * `durationMinutes` - the org's configured default session length
 * (lib/org-settings.ts's `readDefaultSessionDurationMinutes()`), applied to
 * every timed event alike since no per-session duration is available here.
 * Passed in rather than read internally so this function stays a pure,
 * synchronous builder - both callers already have it by the time they call
 * this, from one query each makes anyway.
 */
export function buildAppointmentsIcs(
  sessions: IcsSession[],
  clientName: string,
  durationMinutes: number
): string {
  const dtstamp = formatUtcStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Summit Client Portal//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Not core RFC 5545, but a widely-honored de facto extension (Google
    // Calendar, Apple Calendar) for the imported calendar's display name;
    // harmless no-op for any client that doesn't recognize it.
    `X-WR-CALNAME:${escapeText(`${clientName} - Summit Appointments`)}`,
  ];

  for (const session of sessions) {
    lines.push(...buildEvent(session, dtstamp, durationMinutes));
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
