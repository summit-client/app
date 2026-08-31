/**
 * Tests for the ESA derivations.
 *
 * These are the specification. The SQL views in 0027 and 0028 implement the
 * same rules and should be checked against these cases the first time a
 * database is available to run them.
 *
 *   node --experimental-strip-types --test esa.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORK_WEEK,
  costMultiplier,
  fourWeeksBefore,
  hourlyFromSalary,
  publicHolidayPay,
  summarizeWeeks,
  vacationPay,
  vacationPercent,
  weekEarnings,
  workWeekStart,
  type ActivityCode,
  type TimeEntry,
} from "./esa.ts";

const DIRECT: ActivityCode = {
  code: "DIRECT", countsAsWorked: true, countsAsProductive: true, billable: true,
};
const NOTES: ActivityCode = {
  code: "NOTES", countsAsWorked: true, countsAsProductive: false, billable: false,
};
const HOLIDAY: ActivityCode = {
  code: "HOLIDAY", countsAsWorked: false, countsAsProductive: false, billable: false,
};

let seq = 0;
const entry = (workDate: string, hours: number, activity = DIRECT, hourlyRate?: number): TimeEntry =>
  ({ id: `e${seq++}`, workDate, minutes: Math.round(hours * 60), activity, hourlyRate });

test("work week starts on the declared day", () => {
  // 2026-03-11 is a Wednesday.
  assert.equal(workWeekStart("2026-03-11"), "2026-03-08");            // Sunday week
  assert.equal(workWeekStart("2026-03-11", { weekStartsDow: 1, overtimeThresholdHours: 44 }),
    "2026-03-09");                                                     // Monday week
  // A date that already IS the start day stays put.
  assert.equal(workWeekStart("2026-03-08"), "2026-03-08");
});

test("dates are calendar dates, not instants", () => {
  // The whole point of parsing as UTC. In a timezone behind UTC, a local parse
  // of this date lands on the previous day and moves the week.
  const prev = process.env.TZ;
  process.env.TZ = "America/Toronto";
  try {
    assert.equal(workWeekStart("2026-03-08"), "2026-03-08");
    // 2026-03-08 is also the DST transition in Toronto, which is exactly where
    // a local-time implementation goes wrong.
    assert.equal(workWeekStart("2026-03-09"), "2026-03-08");
  } finally {
    process.env.TZ = prev;
  }
});

test("a malformed date is rejected where it is passed, not four frames later", () => {
  assert.throws(() => workWeekStart("2026-03-014"), /Not a calendar date/);
  assert.throws(() => workWeekStart("not a date"), /Not a calendar date/);
});

test("no overtime at or below the threshold", () => {
  const week = summarizeWeeks([
    entry("2026-03-09", 8), entry("2026-03-10", 8), entry("2026-03-11", 8),
    entry("2026-03-12", 8), entry("2026-03-13", 8),
  ])[0];
  assert.equal(week.workedHours, 40);
  assert.equal(week.overtimeHours, 0);
  assert.equal(week.regularHours, 40);
});

test("overtime is the excess over 44 in a work week", () => {
  const week = summarizeWeeks([
    entry("2026-03-09", 10), entry("2026-03-10", 10), entry("2026-03-11", 10),
    entry("2026-03-12", 10), entry("2026-03-13", 10),
  ])[0];
  assert.equal(week.workedHours, 50);
  assert.equal(week.regularHours, 44);
  assert.equal(week.overtimeHours, 6);
});

test("the work week, not the pay period, decides overtime", () => {
  // The defect this whole design exists to prevent: 60 hours then 20 hours.
  // Over two work weeks that is 16 hours of overtime. Summed over one
  // bi-weekly period it is 80 hours and none at all.
  const weeks = summarizeWeeks([
    // 60 hours in the work week beginning Sunday 8 March.
    entry("2026-03-09", 10), entry("2026-03-10", 10), entry("2026-03-11", 10),
    entry("2026-03-12", 10), entry("2026-03-13", 10), entry("2026-03-14", 10),
    // 20 hours in the following work week.
    entry("2026-03-16", 10), entry("2026-03-17", 10),
  ]);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].overtimeHours, 16);
  assert.equal(weeks[1].overtimeHours, 0);

  const totalOvertime = weeks.reduce((s, w) => s + w.overtimeHours, 0);
  assert.equal(totalOvertime, 16);

  // And the number a period-based calculation would have produced.
  const pooled = summarizeWeeks(
    [entry("2026-03-09", 80)],
    { ...DEFAULT_WORK_WEEK, overtimeThresholdHours: 88 },
  )[0];
  assert.equal(pooled.overtimeHours, 0);
});

test("paid-but-not-worked time is excluded from the overtime threshold", () => {
  // 40 worked hours plus an 8-hour public holiday is not 4 hours of overtime.
  const week = summarizeWeeks([
    entry("2026-03-09", 8), entry("2026-03-10", 8), entry("2026-03-11", 8),
    entry("2026-03-12", 8), entry("2026-03-13", 8),
    entry("2026-03-13", 8, HOLIDAY),
  ])[0];
  assert.equal(week.workedHours, 40);
  assert.equal(week.nonWorkedHours, 8);
  assert.equal(week.overtimeHours, 0);
});

test("productive and billable hours are narrower than worked hours", () => {
  const week = summarizeWeeks([
    entry("2026-03-09", 6, DIRECT),
    entry("2026-03-09", 2, NOTES),
  ])[0];
  assert.equal(week.workedHours, 8);
  assert.equal(week.productiveHours, 6);
  assert.equal(week.billableHours, 6);
});

test("overtime is paid on the blended rate, not the last rate worked", () => {
  // 30 hours at $40 and 20 at $30. The blend is (30*40 + 20*30) / 50 = $36.
  const week = summarizeWeeks([
    entry("2026-03-09", 30, DIRECT, 40),
    entry("2026-03-12", 20, DIRECT, 30),
  ])[0];
  assert.equal(week.workedHours, 50);
  assert.equal(week.overtimeHours, 6);
  assert.equal(week.blendedRegularRate, 36);

  const pay = weekEarnings(week);
  assert.equal(pay.regularPay, 44 * 36);
  assert.equal(pay.overtimePay, round2(6 * 36 * 1.5));
  assert.equal(pay.overtimePremium, round2(6 * 36 * 0.5));
  assert.equal(pay.gross, round2(44 * 36 + 6 * 36 * 1.5));
});

test("an unrated entry does not drag the blend to zero", () => {
  const week = summarizeWeeks([
    entry("2026-03-09", 20, DIRECT, 40),
    entry("2026-03-10", 20, DIRECT),          // no rate recorded
  ])[0];
  assert.equal(week.blendedRegularRate, 40);
});

test("earnings report no rate rather than guessing at zero", () => {
  const week = summarizeWeeks([entry("2026-03-09", 8)])[0];
  const pay = weekEarnings(week);
  assert.equal(pay.rateUsed, null);
  assert.equal(pay.gross, 0);

  const withFallback = weekEarnings(week, 25);
  assert.equal(withFallback.rateUsed, 25);
  assert.equal(withFallback.gross, 200);
});

test("a salary reduces over 52 weeks", () => {
  assert.equal(hourlyFromSalary(78000, 37.5), round2(78000 / (37.5 * 52)));
  // Part-time: the FTE reduces the hours, not the salary.
  assert.equal(hourlyFromSalary(39000, 37.5, 0.5), round2(39000 / (37.5 * 0.5 * 52)));
  assert.equal(hourlyFromSalary(50000, 0), 0);
});

test("vacation pay steps from 4% to 6% at five years", () => {
  assert.equal(vacationPercent("2021-06-01", "2026-05-31"), 4);
  assert.equal(vacationPercent("2021-06-01", "2026-06-01"), 6);
  assert.equal(vacationPay(10000, "2021-06-01", "2026-05-31"), 400);
  assert.equal(vacationPay(10000, "2021-06-01", "2026-06-01"), 600);
});

test("public holiday pay divides four weeks of regular wages by twenty", () => {
  assert.equal(publicHolidayPay({ regularWagesInFourWeeks: 6000 }), 300);
  assert.equal(
    publicHolidayPay({ regularWagesInFourWeeks: 6000, vacationPayInFourWeeks: 240 }),
    312,
  );
  // Part-time: six days worked in four weeks still divides by 20, not by 6.
  assert.equal(publicHolidayPay({ regularWagesInFourWeeks: 1200 }), 60);
});

test("the four preceding work weeks are the four before the holiday's own week", () => {
  // Canada Day 2026 is Wednesday 1 July; its work week starts Sunday 28 June.
  const weeks = fourWeeksBefore("2026-07-01");
  assert.deepEqual(weeks, ["2026-05-31", "2026-06-07", "2026-06-14", "2026-06-21"]);
  assert.equal(weeks.length, 4);
});

test("cost loading sums to a multiplier, and defaults to no loading", () => {
  assert.equal(costMultiplier({}), 1);
  assert.equal(
    costMultiplier({ cppPercent: 5.95, eiPercent: 2.28, wsibPercent: 1.2, vacationPercent: 4 }),
    round2(1 + 13.43 / 100),
  );
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
