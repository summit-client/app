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
  opts: { nDays: number; showWeekends: boolean },
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
    const span = opts.showWeekends ? 7 : 5;
    const days = Array.from({ length: span }, (_, i) => addDays(start, i));
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

/** Working-day check against calendar.workDays' comma-separated setting. */
export function isWorkDay(d: Date, workDays: string[]): boolean {
  return workDays.includes(WEEKDAY_ABBR[d.getDay()]);
}

/** "08:00" -> 8 (hours since midnight, for the time-grid's vertical axis). */
export function parseTimeSetting(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h + (m || 0) / 60;
}
