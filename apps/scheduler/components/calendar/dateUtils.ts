/**
 * Pure date math for the calendar rebuild. No React, no Supabase - kept
 * separate so the "what dates does this view actually cover" logic is easy
 * to reason about (and change) on its own.
 *
 * No date library exists in this app (confirmed - apps/scheduler has none
 * of date-fns/dayjs/luxon in its package.json) and adding one isn't
 * necessary for this scope, so this sticks to native Date. Every place that
 * parses a plain "YYYY-MM-DD" string appends "T12:00:00" first - the same
 * trick already used elsewhere in this file (dayFromDate,
 * generateRecurringDates) to dodge a date landing on the wrong calendar day
 * when the browser's local timezone is behind UTC.
 */

export type ViewMode = "day" | "ndays" | "week" | "month";

export const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateStr(s: string): Date {
  return new Date(`${s}T12:00:00`);
}

export function todayDateStr(): string {
  return toDateStr(new Date());
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function addMonths(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + n);
  return copy;
}

export function isSameDate(a: Date, b: Date): boolean {
  return toDateStr(a) === toDateStr(b);
}

/** Monday-anchored week start, matching org.weekStart's Monday default and
 *  the existing DAYS array's Mon-first ordering elsewhere in this app. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

export function startOfMonthGrid(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}

export interface ViewRange {
  /** Every date this view should render a column/cell for. */
  days: Date[];
  /** Inclusive bounds, for the session query. */
  queryStart: Date;
  queryEnd: Date;
  label: string;
}

/**
 * Given the active view mode and its anchor date, compute exactly which
 * dates are on screen. `anchor` means: the first day shown in Day/N-day
 * mode, any day within the shown week in Week mode, any day within the
 * shown month in Month mode - `shiftView` below always returns a new
 * anchor that keeps this consistent across navigation.
 */
export function computeViewRange(
  mode: ViewMode,
  anchor: Date,
  opts: { nDays: number; showWeekends: boolean; workDays: string[] },
): ViewRange {
  if (mode === "day") {
    return {
      days: [anchor],
      queryStart: anchor,
      queryEnd: anchor,
      label: anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    };
  }
  if (mode === "ndays") {
    const days = Array.from({ length: opts.nDays }, (_, i) => addDays(anchor, i));
    return {
      days,
      queryStart: days[0],
      queryEnd: days[days.length - 1],
      label: `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${days[days.length - 1].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }
  if (mode === "week") {
    const start = startOfWeek(anchor);
    const full = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    // "Work week" reflects the org's actual configured work days (including
    // Saturday when it's turned on in Settings) instead of a hardcoded
    // Mon-Fri span - a work week with Saturday enabled should show 6 days.
    const days = opts.showWeekends ? full : full.filter((d) => opts.workDays.includes(WEEKDAY_ABBR[d.getDay()]));
    return {
      days,
      queryStart: days[0],
      queryEnd: days[days.length - 1],
      label: `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${days[days.length - 1].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }
  // month: a full 6-row grid (42 days) so every month renders a stable
  // number of rows and always shows the leading/trailing days from the
  // adjacent months that share a week with day 1 / the last day.
  const gridStart = startOfMonthGrid(anchor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return {
    days,
    queryStart: days[0],
    queryEnd: days[days.length - 1],
    label: anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
  };
}

/** Prev/Next: shift the anchor by exactly this view's own range. */
export function shiftView(mode: ViewMode, anchor: Date, direction: 1 | -1, nDays: number): Date {
  if (mode === "day") return addDays(anchor, direction * 1);
  if (mode === "ndays") return addDays(anchor, direction * nDays);
  if (mode === "week") return addDays(anchor, direction * 7);
  return addMonths(anchor, direction * 1);
}

/** "Thu 2026-08-20 4:00 PM - 5:00 PM" - the one place text stays instead of
 *  an icon, since a range like this isn't something an icon can carry. */
export function formatFullRange(dateStr: string, hour: number, minute: number, durationMinutes: number): string {
  const start = parseDateStr(dateStr);
  const weekday = WEEKDAY_ABBR[start.getDay()];
  const startMinutesTotal = hour * 60 + minute;
  const endMinutesTotal = startMinutesTotal + durationMinutes;
  const fmt = (totalMin: number) => {
    const h24 = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  return `${weekday} ${dateStr} ${fmt(startMinutesTotal)} - ${fmt(endMinutesTotal)}`;
}

/** "August 2026" for a run of days entirely inside one month; "Aug 31 - Sep
 *  6, 2026" (or "Dec 28, 2026 - Jan 3, 2027" across a year boundary) when it
 *  spans two - the exact ambiguity a numbers-only day strip ("Monday 31,
 *  Tuesday 1...") leaves unresolved once the run crosses a month boundary
 *  (issue #133: the dual mini-calendar showed day numbers with no month at
 *  all). Takes the raw day list rather than just first/last so callers that
 *  already have `weekDays` computed don't need to re-derive anything. */
export function formatWeekMonthLabel(days: Date[]): string {
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const sameYear = first.getFullYear() === last.getFullYear();
  const startLabel = first.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  const endLabel = last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

/** Working-day check against calendar.workDays' comma-separated setting. */
export function isWorkDay(d: Date, workDays: string[]): boolean {
  return workDays.includes(WEEKDAY_ABBR[d.getDay()]);
}

/** "08:00" -> 8 (hours since midnight, for the time-grid's vertical axis). */
export function parseTimeSetting(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h + (m || 0) / 60;
}

/**
 * A session type's gap-before/gap-after (session_types.gap_before_minutes/
 * gap_after_minutes) is meant to warn - never block - a scheduler from
 * booking someone into a clinician's or client's prep/wind-down buffer.
 * "Multiple sessions can run concurrently across different clinicians or
 * clients" (a real quote from the ask this implements) - so this only ever
 * fires for the SAME clinician or the SAME client, matching the exact
 * conflict check elsewhere in this app which is also warn-not-block.
 *
 * Both sides' gaps are honoured symmetrically: encroaching on either
 * session's own buffer counts, not just the new one's.
 */
export interface GapWindow {
  sessionDate: string;
  employeeId: number;
  clientId: number | null;
  startMinutes: number; // hour * 60 + minute
  durationMinutes: number;
  gapBeforeMinutes: number;
  gapAfterMinutes: number;
}

/** Weekly occurrences starting from an exact date (not a calendar term's own
 *  start, the way the Create wizard's generateRecurringDates is anchored) -
 *  used when converting a single session into a repeating one from the
 *  reschedule mini-calendar. */
export function generateWeeklyDatesFrom(startDateStr: string, endType: "date" | "count", endDate: string, endCount: string | number): string[] {
  const dates: string[] = [];
  const cur = parseDateStr(startDateStr);
  const absEnd = endType === "date" && endDate ? parseDateStr(endDate) : parseDateStr("2999-12-31");
  const max = endType === "count" ? Number(endCount) : 9999;
  while (cur <= absEnd && dates.length < max) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

export function gapsOverlap(a: GapWindow, b: GapWindow): boolean {
  if (a.sessionDate !== b.sessionDate) return false;
  const sameParty = a.employeeId === b.employeeId || (a.clientId != null && a.clientId === b.clientId);
  if (!sameParty) return false;
  const aStart = a.startMinutes - a.gapBeforeMinutes;
  const aEnd = a.startMinutes + a.durationMinutes + a.gapAfterMinutes;
  const bStart = b.startMinutes - b.gapBeforeMinutes;
  const bEnd = b.startMinutes + b.durationMinutes + b.gapAfterMinutes;
  return aStart < bEnd && bStart < aEnd;
}
