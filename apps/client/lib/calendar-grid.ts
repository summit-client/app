/**
 * Pure calendar-grid math for components/calendar-month.tsx - deliberately
 * separate from any real-time/timezone concern (unlike lib/clinic-date.ts).
 * This only ever answers "what date goes in which grid cell for month X,
 * Monday-start" - a layout question, not a data-correctness one, so it
 * uses UTC-based Date arithmetic purely as a safe way to do calendar math
 * (day/month rollover) without any of the DST pitfalls a real timezone
 * conversion has to worry about. "Today" for highlighting the current day
 * still has to come from the caller (lib/clinic-date.ts's
 * clinicTodayDateStr()) rather than a fresh client-side `new Date()` - see
 * that file's header for why a fresh client-side "now" would reintroduce
 * the same class of bug this app already fixed once.
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month, day));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Every date cell for a Monday-start month grid, in week-sized rows,
 * including the leading/trailing days from adjacent months needed to fill
 * complete weeks (5 or 6 rows depending on the month). `month` is
 * 0-indexed (0 = January), matching JS Date's own convention.
 */
export function getMonthGrid(year: number, month: number): string[][] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun..6=Sat
  const leadingDays = (firstWeekday + 6) % 7; // shift to Monday=0..Sunday=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  const cells: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leadingDays + 1;
    // Date.UTC normalizes an out-of-range day/month (0, negative, or past
    // the month's end) into the correct adjacent-month date on its own.
    const date = new Date(Date.UTC(year, month, dayOffset));
    cells.push(toDateStr(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Shifts a (year, 0-indexed month) pair by `offset` months in either
 *  direction - used for the month navigation buttons. */
export function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + month + offset;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** True if `dateStr` (YYYY-MM-DD) falls within the given 0-indexed month/year. */
export function isInMonth(dateStr: string, year: number, month: number): boolean {
  const [cellYear, cellMonth] = dateStr.split("-").map(Number);
  return cellYear === year && cellMonth - 1 === month;
}
