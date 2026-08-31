import { useMemo, useState } from "react";
import { getMonthGrid, shiftMonth, isInMonth } from "../lib/calendar-grid";
import styles from "../styles/design-b.module.css";

export type CalendarEntry = {
  id: number;
  session_date: string;
  /** Already derived by the caller (pages/appointments.tsx's
   *  normalizeStatus()) - this component only renders, it doesn't decide
   *  what counts as scheduled/completed/cancelled. */
  status: "scheduled" | "completed" | "cancelled";
  label: string;
};

type Props = {
  entries: CalendarEntry[];
  /** Clinic-local "today" (lib/clinic-date.ts's clinicTodayDateStr()),
   *  passed down rather than computed here - a fresh client-side
   *  `new Date()` would be exactly the browser-timezone mismatch this app
   *  already fixed once for date filtering (see lib/clinic-date.ts). */
  todayDateStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** How many session chips a day cell shows before collapsing into "+N more" -
 *  keeps a busy day from blowing out the grid's row height. */
const MAX_VISIBLE_PER_DAY = 3;

/** Maps a derived status to its module class - an explicit lookup instead
 *  of a template-literal className so a typo/unhandled status shows up as
 *  a TypeScript error, not a silently-missing class at runtime. */
const CHIP_CLASS: Record<CalendarEntry["status"], "calendarChipScheduled" | "calendarChipCompleted" | "calendarChipCancelled"> = {
  scheduled: "calendarChipScheduled",
  completed: "calendarChipCompleted",
  cancelled: "calendarChipCancelled",
};

/**
 * A read-only month calendar for pages/appointments.tsx's "Calendar" view -
 * purely presentational over whatever `entries` it's given (no query of
 * its own, no new schema risk), which is why appointments.tsx has to
 * derive `status` before handing sessions to it. Clicking a day toggles it
 * as the active filter via `onSelectDate`; the caller owns what that
 * selection actually does to the list below.
 */
export function CalendarMonth({ entries, todayDateStr, selectedDate, onSelectDate }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);

  const base = useMemo(() => {
    const [year, month] = todayDateStr.split("-").map(Number);
    return { year, month: month - 1 };
  }, [todayDateStr]);

  const target = useMemo(() => shiftMonth(base.year, base.month, monthOffset), [base, monthOffset]);

  const weeks = useMemo(() => getMonthGrid(target.year, target.month), [target]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      if (!map.has(entry.session_date)) {
        map.set(entry.session_date, []);
      }
      map.get(entry.session_date)!.push(entry);
    }
    return map;
  }, [entries]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(target.year, target.month, 1))
      ),
    [target]
  );

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <button
          type="button"
          onClick={() => setMonthOffset((offset) => offset - 1)}
          aria-label="Previous month"
          className={styles.calendarNavButton}
        >
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          onClick={() => setMonthOffset((offset) => offset + 1)}
          aria-label="Next month"
          className={styles.calendarNavButton}
        >
          ›
        </button>
      </div>

      <div className={styles.calendarWeekdays} aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className={styles.calendarGrid} role="grid" aria-label={monthLabel}>
        {weeks.map((week) => (
          <div className={styles.calendarWeek} role="row" key={week[0]}>
            {week.map((dateStr) => {
              const dayEntries = entriesByDate.get(dateStr) ?? [];
              const inMonth = isInMonth(dateStr, target.year, target.month);
              const isToday = dateStr === todayDateStr;
              const isSelected = dateStr === selectedDate;
              const dayNumber = Number(dateStr.slice(8, 10));
              const visible = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
              const overflow = dayEntries.length - visible.length;

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={dateStr}
                  onClick={() => onSelectDate(isSelected ? null : dateStr)}
                  aria-pressed={isSelected}
                  aria-label={`${dateStr}${
                    dayEntries.length
                      ? `, ${dayEntries.length} appointment${dayEntries.length === 1 ? "" : "s"}`
                      : ""
                  }`}
                  className={[
                    styles.calendarDay,
                    inMonth ? "" : styles.calendarDayOutside,
                    isToday ? styles.calendarDayToday : "",
                    isSelected ? styles.calendarDaySelected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={styles.calendarDayNumber}>{dayNumber}</span>

                  {visible.length > 0 && (
                    <span className={styles.calendarDayEntries}>
                      {visible.map((entry) => (
                        <span
                          key={entry.id}
                          className={`${styles.calendarChip} ${styles[CHIP_CLASS[entry.status]]}`}
                        >
                          {entry.label}
                        </span>
                      ))}
                      {overflow > 0 && <span className={styles.calendarChipMore}>+{overflow} more</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
