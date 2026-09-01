/**
 * Pure date math for the caseload calendar (app/caseload's Calendar view).
 *
 * Deliberately NOT imported from apps/scheduler/components/calendar/dateUtils.ts.
 * Each app in this monorepo is its own Next.js root with its own module
 * resolution — cross-app imports of application code (as opposed to a real
 * `packages/*` workspace package) aren't how this codebase shares code (see
 * CLAUDE.md's "Where things belong": "Each app — what that portal does about
 * it. Screens and copy stay with the screens"). This file ports just the
 * handful of pure, dependency-free functions the read-only week/month grid
 * below actually needs (no gap/conflict math, no recurrence, no drag
 * snapping) rather than reaching across the app boundary or promoting the
 * scheduler's whole calendar module into a shared package for one read-only
 * consumer. If apps/scheduler's date math changes, this copy does not
 * inherit the fix — an accepted tradeoff for a narrow, read-only view.
 *
 * Same "append T12:00:00" trick as the scheduler's version, for the same
 * reason: dodges a plain "YYYY-MM-DD" landing on the wrong calendar day when
 * the browser's local timezone is behind UTC.
 */

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

/** Monday-anchored week start, matching apps/scheduler's own convention. */
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

/** "9:00 AM" from 24h hour/minute. */
export function fmtTime(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export interface WeekRange {
  days: Date[];
  queryStart: string;
  queryEnd: string;
  label: string;
}

/** The 7 days (Mon-Sun) containing `anchor`. */
export function computeWeekRange(anchor: Date): WeekRange {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return {
    days,
    queryStart: toDateStr(days[0]),
    queryEnd: toDateStr(days[days.length - 1]),
    label: `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
  };
}

export interface MonthRange {
  /** A stable 42-cell (6 row) grid, including the leading/trailing days of
   *  adjacent months that share a week with day 1 / the last day. */
  days: Date[];
  queryStart: string;
  queryEnd: string;
  label: string;
  monthIdx: number;
}

/** The full 6-row grid covering `anchor`'s month. */
export function computeMonthRange(anchor: Date): MonthRange {
  const gridStart = startOfMonthGrid(anchor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return {
    days,
    queryStart: toDateStr(days[0]),
    queryEnd: toDateStr(days[days.length - 1]),
    label: anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    monthIdx: anchor.getMonth(),
  };
}
