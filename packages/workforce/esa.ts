/**
 * Ontario Employment Standards Act derivations.
 *
 * This is the same arithmetic as the views in migration 0027 and the rate
 * functions in 0028, written a second time in TypeScript. Two implementations
 * of one rule is normally a defect; here it is deliberate, for two reasons:
 *
 *   The screen has to show an employee their week as they enter it, before
 *   anything is saved. A round trip per keystroke is not that.
 *
 *   These rules are the ones with real consequences if they are wrong, and
 *   they are the ones that cannot be tested through the database from this
 *   machine. Written here they can be tested directly, and the tests are the
 *   specification the SQL is checked against.
 *
 * The rules implemented, with their sources:
 *
 *   Overtime          ESA s.22: 1.5x after 44 hours in a work week. The work
 *                     week is the employer's declared recurring 7-day period,
 *                     which is NOT the pay period.
 *   Regular rate      ESA s.1: for a salaried employee, the salary reduced to
 *                     an hourly amount over their regular work week.
 *   Blended rate      Where an employee works at two or more rates in a week,
 *                     overtime is paid on a weighted average of the rates for
 *                     the hours actually worked, not on the rate that happened
 *                     to apply to the 45th hour.
 *   Vacation pay      ESA s.35.2: 4% of wages under five years of service, 6%
 *                     at five years and over.
 *   Public holiday    ESA s.24: the regular wages earned in the four work
 *                     weeks before the work week containing the holiday, plus
 *                     vacation pay payable over that period, divided by 20.
 *
 * What is deliberately absent: source deductions. Income tax, CPP and EI
 * withholding belong to the payroll provider. Nothing here should be described
 * as producing net pay.
 */

export type ActivityCode = {
  code: string;
  countsAsWorked: boolean;
  countsAsProductive: boolean;
  billable: boolean;
};

export type TimeEntry = {
  id: string;
  workDate: string; // ISO date
  minutes: number;
  activity: ActivityCode;
  /** The regular rate applying on this date. Needed for blending. */
  hourlyRate?: number;
};

export type WorkWeekConfig = {
  /** 0 = Sunday, matching Postgres extract(dow) and JS getUTCDay(). */
  weekStartsDow: number;
  overtimeThresholdHours: number;
};

export const DEFAULT_WORK_WEEK: WorkWeekConfig = {
  weekStartsDow: 0,
  overtimeThresholdHours: 44,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The Monday (or whichever day the employer declared) that starts the work
 * week containing this date.
 *
 * Parsed as UTC throughout. A local-time parse of "2026-03-08" in a timezone
 * behind UTC lands on the 7th, which moves the day of week, which moves the
 * work week, which moves the overtime. Dates here are calendar dates, not
 * instants, and treating them as instants is the bug that produces an
 * off-by-one week twice a year at the DST boundary.
 */
export function workWeekStart(date: string, config: WorkWeekConfig = DEFAULT_WORK_WEEK): string {
  const d = new Date(`${date}T00:00:00Z`);
  // A malformed date must say so here. Left unchecked it produces an Invalid
  // Date that survives the arithmetic and only throws at toISOString, several
  // frames away from the value that caused it.
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Not a calendar date: ${JSON.stringify(date)} (expected YYYY-MM-DD)`);
  }
  const shift = (d.getUTCDay() - config.weekStartsDow + 7) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export type WeekSummary = {
  workWeekStart: string;
  workedHours: number;
  nonWorkedHours: number;
  productiveHours: number;
  billableHours: number;
  regularHours: number;
  overtimeHours: number;
  /**
   * The weighted average of the rates actually worked in the week. This is the
   * figure the overtime premium is paid on, not the highest or the latest
   * rate. Undefined when no entry carried a rate.
   */
  blendedRegularRate?: number;
};

/** Group entries into declared work weeks and apply the overtime split. */
export function summarizeWeeks(
  entries: TimeEntry[],
  config: WorkWeekConfig = DEFAULT_WORK_WEEK,
): WeekSummary[] {
  const byWeek = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const wk = workWeekStart(e.workDate, config);
    const list = byWeek.get(wk);
    if (list) list.push(e);
    else byWeek.set(wk, [e]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([workWeekStart, weekEntries]) => {
      const hours = (pred: (e: TimeEntry) => boolean) =>
        round2(weekEntries.filter(pred).reduce((s, e) => s + e.minutes, 0) / 60);

      const workedHours = hours((e) => e.activity.countsAsWorked);
      const overtimeHours = round2(Math.max(0, workedHours - config.overtimeThresholdHours));

      // Blend across worked hours that carry a rate. An entry with no rate is
      // excluded from both halves of the average rather than counted at zero,
      // which would drag the blend down and underpay the premium.
      const rated = weekEntries.filter((e) => e.activity.countsAsWorked && e.hourlyRate != null);
      const ratedMinutes = rated.reduce((s, e) => s + e.minutes, 0);
      const blendedRegularRate = ratedMinutes
        ? round2(rated.reduce((s, e) => s + e.minutes * e.hourlyRate!, 0) / ratedMinutes)
        : undefined;

      return {
        workWeekStart,
        workedHours,
        nonWorkedHours: hours((e) => !e.activity.countsAsWorked),
        productiveHours: hours((e) => e.activity.countsAsProductive),
        billableHours: hours((e) => e.activity.billable),
        regularHours: round2(Math.min(workedHours, config.overtimeThresholdHours)),
        overtimeHours,
        blendedRegularRate,
      };
    });
}

/**
 * Gross earnings for a week: regular hours at the blended rate, plus overtime
 * at one and a half times it.
 *
 * Returns the premium separately as well as folded into the total, because
 * the premium is the number a payroll provider wants on its own line and the
 * number an operations report needs in order to say what overtime cost.
 */
export function weekEarnings(week: WeekSummary, fallbackRate?: number): {
  regularPay: number;
  overtimePay: number;
  overtimePremium: number;
  gross: number;
  rateUsed: number | null;
} {
  const rate = week.blendedRegularRate ?? fallbackRate;
  if (rate == null) {
    return { regularPay: 0, overtimePay: 0, overtimePremium: 0, gross: 0, rateUsed: null };
  }
  const regularPay = round2(week.regularHours * rate);
  const overtimePay = round2(week.overtimeHours * rate * 1.5);
  return {
    regularPay,
    overtimePay,
    overtimePremium: round2(week.overtimeHours * rate * 0.5),
    gross: round2(regularPay + overtimePay),
    rateUsed: rate,
  };
}

/**
 * A salaried employee's regular rate.
 *
 * 52 weeks rather than 52.18. The ESA reduces a salary over the employee's
 * regular work week; using the more precise 365.25/7 produces a marginally
 * lower hourly rate, and a lower regular rate means a lower overtime premium.
 * Where a rounding choice moves money, it should move it toward the employee.
 */
export function hourlyFromSalary(annualSalary: number, standardWeeklyHours: number, fte = 1): number {
  const hoursPerYear = standardWeeklyHours * fte * 52;
  if (hoursPerYear <= 0) return 0;
  return round2(annualSalary / hoursPerYear);
}

/**
 * ESA vacation pay percentage. 4% under five years of completed service, 6%
 * at five years and over, measured at the date in question rather than today.
 */
export function vacationPercent(serviceStart: string, on: string): 4 | 6 {
  const start = new Date(`${serviceStart}T00:00:00Z`);
  const at = new Date(`${on}T00:00:00Z`);
  const fiveYears = new Date(start);
  fiveYears.setUTCFullYear(fiveYears.getUTCFullYear() + 5);
  return at >= fiveYears ? 6 : 4;
}

export function vacationPay(grossWages: number, serviceStart: string, on: string): number {
  return round2(grossWages * (vacationPercent(serviceStart, on) / 100));
}

/**
 * Public holiday pay, ESA s.24.
 *
 * The regular wages earned in the four work weeks before the work week
 * containing the holiday, plus vacation pay payable over those weeks, divided
 * by twenty.
 *
 * Two things this gets right that a naive "average daily wage" does not:
 * overtime pay is excluded from regular wages, and the divisor is a fixed 20
 * rather than the number of days actually worked. A part-time employee who
 * worked six days in four weeks is entitled to their four-week wages over 20,
 * not to an average of those six days.
 */
export function publicHolidayPay(input: {
  /** Regular wages, EXCLUDING any overtime premium, over the four preceding work weeks. */
  regularWagesInFourWeeks: number;
  /** Vacation pay payable with respect to those same four weeks. */
  vacationPayInFourWeeks?: number;
}): number {
  return round2(
    (input.regularWagesInFourWeeks + (input.vacationPayInFourWeeks ?? 0)) / 20,
  );
}

/**
 * The four work weeks preceding the work week that contains a holiday, as
 * start dates, oldest first. Callers sum wages over these to feed
 * publicHolidayPay.
 */
export function fourWeeksBefore(
  holidayDate: string,
  config: WorkWeekConfig = DEFAULT_WORK_WEEK,
): string[] {
  const holidayWeek = workWeekStart(holidayDate, config);
  const out: string[] = [];
  for (let i = 4; i >= 1; i--) {
    const d = new Date(`${holidayWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The employer's cost of an hour, given pay and the loading percentages. */
export function costMultiplier(loading: {
  cppPercent?: number;
  eiPercent?: number;
  wsibPercent?: number;
  ehtPercent?: number;
  vacationPercent?: number;
  benefitsPercent?: number;
  otherPercent?: number;
}): number {
  const total =
    (loading.cppPercent ?? 0) +
    (loading.eiPercent ?? 0) +
    (loading.wsibPercent ?? 0) +
    (loading.ehtPercent ?? 0) +
    (loading.vacationPercent ?? 0) +
    (loading.benefitsPercent ?? 0) +
    (loading.otherPercent ?? 0);
  return round2(1 + total / 100);
}
