/**
 * Time-off entitlements for the Employee Hub.
 *
 * Policy (Beta 1):
 *  - Vacation: 10 days/year (2 weeks, the Ontario ESA minimum), rising to
 *    15 days/year (3 weeks) once the employee reaches 5 years of service, per
 *    the ESA. Configurable below.
 *  - Sick / mental-health: 5 days/year (a Mount Etna policy that exceeds the
 *    ESA's 3 unpaid job-protected sick days).
 *  - Both entitlements are per "entitlement year" and reset on the employee's
 *    hire-date anniversary.
 *
 * These are pure functions (no DB) so they are easy to test and reuse.
 */

export const TIME_OFF_POLICY = {
  vacationBaseDays: 10, // < 5 years service (Ontario ESA: 2 weeks)
  vacationSeniorDays: 15, // >= 5 years service (Ontario ESA: 3 weeks)
  seniorityYears: 5,
  sickDays: 5, // sick or mental-health days (company policy)
} as const;

export type TimeOffType = "VACATION" | "SICK";
export type TimeOffStatusLite = "REQUESTED" | "APPROVED" | "DENIED" | "CANCELLED";

export interface RequestLite {
  type: TimeOffType;
  days: number;
  status: TimeOffStatusLite;
  startDate: Date;
}

export interface Balance {
  entitled: number;
  used: number; // approved within the current entitlement year
  pending: number; // requested but not yet decided
  remaining: number;
}

export interface Entitlements {
  serviceYears: number;
  yearStart: Date;
  yearEnd: Date; // == next reset (anniversary)
  nextReset: Date;
  vacation: Balance;
  sick: Balance;
}

function anniversaryInYear(hireDate: Date, year: number): Date {
  return new Date(year, hireDate.getMonth(), hireDate.getDate());
}

/** Whole years of completed service as of `now`. */
export function serviceYears(hireDate: Date, now = new Date()): number {
  let years = now.getFullYear() - hireDate.getFullYear();
  const anniv = anniversaryInYear(hireDate, now.getFullYear());
  if (now < anniv) years -= 1;
  return Math.max(0, years);
}

/** Current entitlement year window [start, end) based on the hire anniversary. */
export function entitlementYear(hireDate: Date, now = new Date()): { start: Date; end: Date } {
  let start = anniversaryInYear(hireDate, now.getFullYear());
  if (now < start) start = anniversaryInYear(hireDate, now.getFullYear() - 1);
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  return { start, end };
}

export function nextAnniversary(hireDate: Date, now = new Date()): Date {
  return entitlementYear(hireDate, now).end;
}

export function vacationEntitlement(years: number): number {
  return years >= TIME_OFF_POLICY.seniorityYears
    ? TIME_OFF_POLICY.vacationSeniorDays
    : TIME_OFF_POLICY.vacationBaseDays;
}

/** Inclusive calendar-day count between two dates (min 0.5). */
export function inclusiveDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.max(0.5, Math.round(ms / 86_400_000) + 1);
}

/** Compute vacation + sick balances for the current entitlement year. */
export function computeEntitlements(
  hireDate: Date,
  requests: RequestLite[],
  now = new Date(),
): Entitlements {
  const { start, end } = entitlementYear(hireDate, now);
  const years = serviceYears(hireDate, now);

  const tally = (type: TimeOffType) => {
    let used = 0;
    let pending = 0;
    for (const r of requests) {
      if (r.type !== type) continue;
      if (r.startDate < start || r.startDate >= end) continue;
      if (r.status === "APPROVED") used += r.days;
      else if (r.status === "REQUESTED") pending += r.days;
    }
    return { used, pending };
  };

  const v = tally("VACATION");
  const s = tally("SICK");
  const vEnt = vacationEntitlement(years);
  const sEnt = TIME_OFF_POLICY.sickDays;

  return {
    serviceYears: years,
    yearStart: start,
    yearEnd: end,
    nextReset: end,
    vacation: {
      entitled: vEnt,
      used: v.used,
      pending: v.pending,
      remaining: Math.max(0, vEnt - v.used - v.pending),
    },
    sick: {
      entitled: sEnt,
      used: s.used,
      pending: s.pending,
      remaining: Math.max(0, sEnt - s.used - s.pending),
    },
  };
}
