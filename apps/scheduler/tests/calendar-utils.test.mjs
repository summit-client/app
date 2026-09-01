/**
 * Tests the SHIPPED calendar utility functions, not reimplemented copies -
 * same reasoning as apps/employee/tests/onboarding-certificates.test.mjs
 * (whose esbuild-lookup approach this mirrors): bundles the real
 * components/calendar/{dateUtils,types,suggestions}.ts with esbuild and
 * exercises the actual exports. This is the only automated verification
 * available for this session's date-math, conflict-detection, and
 * conflict-resolution-suggestion logic - there is no Supabase-backed
 * environment here to click through the UI in a browser.
 *
 * Run: node tests/calendar-utils.test.mjs
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const roots = ["../../node_modules/.pnpm", "../../../node_modules/.pnpm"];
let esbuildMain = null;
for (const root of roots) {
  if (!existsSync(root)) continue;
  const dir = readdirSync(root).find((d) => d.startsWith("esbuild@"));
  if (!dir) continue;
  const candidate = join(root, dir, "node_modules/esbuild/lib/main.js");
  if (existsSync(candidate)) { esbuildMain = resolve(candidate); break; }
}
if (!esbuildMain) { console.log("SKIP: esbuild not found - run pnpm install at the repo root"); process.exit(0); }
const esbuild = await import(pathToFileURL(esbuildMain).href);

const temps = [];
const bundleOf = async (entry, name) => {
  const out = join("tests", name);
  await esbuild.build({ entryPoints: [entry], bundle: true, outfile: out, format: "esm", platform: "neutral" });
  temps.push(out);
  return pathToFileURL(resolve(out)).href;
};
const cleanup = () => temps.forEach((f) => { try { unlinkSync(f); } catch { /* already gone */ } });
process.on("exit", cleanup);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const dateUtils = await import(await bundleOf("components/calendar/dateUtils.ts", "_dateUtils.bundle.mjs"));
const types = await import(await bundleOf("components/calendar/types.ts", "_types.bundle.mjs"));
const suggestions = await import(await bundleOf("components/calendar/suggestions.ts", "_suggestions.bundle.mjs"));

const {
  toDateStr, parseDateStr, addDays, startOfWeek, computeViewRange, shiftView, gapsOverlap, generateWeeklyDatesFrom, formatFullRange,
} = dateUtils;
const { sessionDuration, sessionGridIncrement } = types;
const { isAvailable, hasSessionConflict, hasClientSessionConflict, buildBusyBlocks, suggestSameClinicianOtherTime, suggestDifferentClinicianSameSlot } = suggestions;

console.log("dateUtils");

// A Thursday - 2026-08-20.
const thu = "2026-08-20";
t("startOfWeek is Monday-anchored", toDateStr(startOfWeek(parseDateStr(thu))) === "2026-08-17");

{
  const r = computeViewRange("day", parseDateStr(thu), { nDays: 3, showWeekends: false, workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] });
  t("day mode: exactly one day", r.days.length === 1 && toDateStr(r.days[0]) === thu);
}
{
  const r = computeViewRange("ndays", parseDateStr(thu), { nDays: 4, showWeekends: false, workDays: [] });
  t("ndays mode: N consecutive days from anchor", r.days.length === 4 && toDateStr(r.days[0]) === thu && toDateStr(r.days[3]) === "2026-08-23");
}
{
  const r = computeViewRange("week", parseDateStr(thu), { nDays: 5, showWeekends: false, workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] });
  t("work week: 5 days, Mon-Fri", r.days.length === 5 && toDateStr(r.days[0]) === "2026-08-17" && toDateStr(r.days[4]) === "2026-08-21");
}
{
  // Saturday enabled in work days -> work week should show 6 days, not a
  // hardcoded Mon-Fri - this was a real bug fixed this session.
  const r = computeViewRange("week", parseDateStr(thu), { nDays: 5, showWeekends: false, workDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] });
  t("work week honours calendar.workDays (Saturday included)", r.days.length === 6 && toDateStr(r.days[5]) === "2026-08-22", `got ${r.days.length} days`);
}
{
  const r = computeViewRange("week", parseDateStr(thu), { nDays: 5, showWeekends: true, workDays: [] });
  t("full week: always 7 days regardless of workDays", r.days.length === 7 && toDateStr(r.days[6]) === "2026-08-23");
}
{
  const r = computeViewRange("month", parseDateStr(thu), { nDays: 5, showWeekends: false, workDays: [] });
  t("month mode: always a 42-day grid", r.days.length === 42);
}
{
  const next = shiftView("week", parseDateStr(thu), 1, 5);
  t("shiftView week: +7 days", toDateStr(next) === "2026-08-27");
  const prev = shiftView("ndays", parseDateStr(thu), -1, 3);
  t("shiftView ndays: -nDays", toDateStr(prev) === "2026-08-17");
}
t(
  "formatFullRange produces the exact spec'd format",
  formatFullRange("2026-08-20", 16, 0, 60) === "Thu 2026-08-20 4:00 PM - 5:00 PM",
  formatFullRange("2026-08-20", 16, 0, 60),
);

console.log("gapsOverlap");

const base = { sessionDate: thu, startMinutes: 600, durationMinutes: 60, gapBeforeMinutes: 0, gapAfterMinutes: 15 };
t(
  "same clinician, gap-after encroached -> overlap",
  gapsOverlap({ ...base, employeeId: 1, clientId: 10 }, { sessionDate: thu, employeeId: 1, clientId: 20, startMinutes: 665, durationMinutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0 }),
);
t(
  "different clinician AND different client -> never overlaps regardless of gap",
  !gapsOverlap({ ...base, employeeId: 1, clientId: 10 }, { sessionDate: thu, employeeId: 2, clientId: 20, startMinutes: 660, durationMinutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0 }),
);
t(
  "same client, different clinician, gap encroached -> overlap",
  gapsOverlap({ ...base, employeeId: 1, clientId: 10 }, { sessionDate: thu, employeeId: 2, clientId: 10, startMinutes: 665, durationMinutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0 }),
);
t(
  "different day -> never overlaps",
  !gapsOverlap({ ...base, employeeId: 1, clientId: 10 }, { sessionDate: "2026-08-21", employeeId: 1, clientId: 10, startMinutes: 665, durationMinutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0 }),
);
t(
  "no gap set, back-to-back sessions -> no overlap",
  !gapsOverlap({ sessionDate: thu, employeeId: 1, clientId: 10, startMinutes: 600, durationMinutes: 60, gapBeforeMinutes: 0, gapAfterMinutes: 0 }, { sessionDate: thu, employeeId: 1, clientId: 20, startMinutes: 660, durationMinutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0 }),
);

console.log("generateWeeklyDatesFrom");

{
  const dates = generateWeeklyDatesFrom(thu, "count", "", 3);
  t("count-bounded: exactly N dates, weekly, anchored on the exact start date", dates.length === 3 && dates[0] === thu && dates[1] === "2026-08-27" && dates[2] === "2026-09-03", dates.join(","));
}
{
  // Weekly from 08-20: 08-20, 08-27, 09-03 - the third occurrence is past
  // the 09-02 boundary, so only the first two should come back.
  const dates = generateWeeklyDatesFrom(thu, "date", "2026-09-02", "");
  t("date-bounded: stops at or before the end date", dates.length === 2 && dates[dates.length - 1] === "2026-08-27", dates.join(","));
}

console.log("types.ts");

const sessionTypes = [{ id: 1, name: "Direct Therapy", duration: 60, grid_increment_minutes: null }, { id: 2, name: "Assessment", duration: 63, grid_increment_minutes: 1 }];
t("sessionDuration reads duration from the matching type", sessionDuration({ type: "Direct Therapy" }, sessionTypes) === 60);
t("sessionDuration falls back to 60 for an unknown type", sessionDuration({ type: "Nonexistent" }, sessionTypes) === 60);
t("sessionGridIncrement uses the type override when set", sessionGridIncrement({ type: "Assessment" }, sessionTypes, 15) === 1);
t("sessionGridIncrement falls back to the org default when unset", sessionGridIncrement({ type: "Direct Therapy" }, sessionTypes, 15) === 15);
t("sessionGridIncrement falls back to the org default with no session", sessionGridIncrement(undefined, sessionTypes, 15) === 15);

console.log("suggestions.ts");

{
  const avail = [{ staff_id: 1, day: "Thu", start_time: "09:00", end_time: "17:00" }];
  t("isAvailable: inside a window", isAvailable(1, "Thu", 600, 660, avail));
  t("isAvailable: outside any window", !isAvailable(1, "Thu", 480, 540, avail));
  t("isAvailable: no data for that staff/day", !isAvailable(2, "Thu", 600, 660, avail));
}
{
  const existingSessions = [{ id: 1, employee_id: 1, session_date: thu, hour: 10, minute: 0, durationMinutes: 60, status: "scheduled" }];
  t("hasSessionConflict: exact overlap", hasSessionConflict(1, thu, 600, 60, existingSessions));
  t("hasSessionConflict: no overlap after the existing session ends", !hasSessionConflict(1, thu, 660, 60, existingSessions));
  t("hasSessionConflict: cancelled sessions never conflict", !hasSessionConflict(1, thu, 600, 60, [{ ...existingSessions[0], status: "cancelled" }]));
  t("hasSessionConflict: excludeSessionId skips itself (dragging in place)", !hasSessionConflict(1, thu, 600, 60, existingSessions, 1));
}
{
  // Same clinician, only available Thu 9-17, already booked 10-11 - the
  // engine should suggest a different in-window, conflict-free time this
  // week, never the exact original slot.
  const staffAvailability = [{ staff_id: 1, day: "Thu", start_time: "09:00", end_time: "17:00" }];
  const existingSessions = [{ id: 1, employee_id: 1, session_date: thu, hour: 10, minute: 0, durationMinutes: 60, status: "scheduled" }];
  const results = suggestSameClinicianOtherTime({
    employeeId: 1, employeeName: "Sarah", dateStr: thu, hour: 10, minute: 0, durationMinutes: 60,
    sessions: existingSessions, staffAvailability, workStartHour: 8, workEndHour: 18, incrementMinutes: 60, maxResults: 5,
  });
  t("same-clinician suggestions: non-empty", results.length > 0);
  t("same-clinician suggestions: never the exact original slot", !results.some((r) => r.dateStr === thu && r.hour === 10 && r.minute === 0));
  t("same-clinician suggestions: never outside the clinician's own availability window", results.every((r) => r.hour >= 9 && r.hour < 17));
  t("same-clinician suggestions: never a slot that's actually booked", !results.some((r) => r.dateStr === thu && r.hour === 10));
}
{
  // Hard constraint: never suggest a different location, and the day/time
  // must stay exactly the same when the clinician changes.
  const staffAvailability = [
    { staff_id: 1, day: "Thu", start_time: "09:00", end_time: "17:00" },
    { staff_id: 2, day: "Thu", start_time: "09:00", end_time: "17:00" },
    { staff_id: 3, day: "Thu", start_time: "09:00", end_time: "17:00" },
  ];
  const employees = [
    { id: 2, name: "Same location", location_id: 100 },
    { id: 3, name: "Different location", location_id: 200 },
  ];
  const results = suggestDifferentClinicianSameSlot({
    dateStr: thu, hour: 10, minute: 0, durationMinutes: 60, locationId: 100, excludeEmployeeId: 1,
    employees, sessions: [], staffAvailability,
  });
  t("different-clinician suggestions: excludes the original clinician", !results.some((r) => r.employeeId === 1));
  t("different-clinician suggestions: never crosses location", results.every((r) => r.employeeId !== 3));
  t("different-clinician suggestions: keeps the exact same day/time", results.every((r) => r.dateStr === thu && r.hour === 10 && r.minute === 0));
  t("different-clinician suggestions: includes the same-location clinician", results.some((r) => r.employeeId === 2));
}

console.log("hasClientSessionConflict (dual-schedule mini-calendar)");

{
  const existingSessions = [{ id: 1, employee_id: 9, client_id: 5, session_date: thu, hour: 10, minute: 0, durationMinutes: 60, status: "scheduled" }];
  t("hasClientSessionConflict: exact overlap on the client side", hasClientSessionConflict(5, thu, 600, 60, existingSessions));
  t("hasClientSessionConflict: no overlap after the existing session ends", !hasClientSessionConflict(5, thu, 660, 60, existingSessions));
  t("hasClientSessionConflict: different client, no conflict", !hasClientSessionConflict(6, thu, 600, 60, existingSessions));
  t("hasClientSessionConflict: cancelled sessions never conflict", !hasClientSessionConflict(5, thu, 600, 60, [{ ...existingSessions[0], status: "cancelled" }]));
  t("hasClientSessionConflict: excludeSessionId skips itself", !hasClientSessionConflict(5, thu, 600, 60, existingSessions, 1));
  t("hasClientSessionConflict: a row with no client_id (client-optional type) never conflicts", !hasClientSessionConflict(5, thu, 600, 60, [{ ...existingSessions[0], client_id: null }]));
}

console.log("buildBusyBlocks (dual-schedule mini-calendar)");

{
  const sessions = [
    { id: 1, employee_id: 9, client_id: 5, session_date: thu, hour: 14, minute: 0, durationMinutes: 45, status: "scheduled" },
    { id: 2, employee_id: 9, client_id: 6, session_date: thu, hour: 9, minute: 0, durationMinutes: 60, status: "scheduled" },
    { id: 3, employee_id: 9, client_id: 7, session_date: thu, hour: 11, minute: 0, durationMinutes: 30, status: "cancelled" },
    { id: 4, employee_id: 9, client_id: 8, session_date: "2026-08-21", hour: 9, minute: 0, durationMinutes: 60, status: "scheduled" },
  ];
  const blocks = buildBusyBlocks(thu, sessions, 1);
  t("buildBusyBlocks: excludes cancelled and other-day sessions", blocks.length === 2, `got ${blocks.length}`);
  t("buildBusyBlocks: sorted by start time", blocks[0].id === 2 && blocks[1].id === 1);
  t("buildBusyBlocks: computes start/end in minutes", blocks[0].startMinutes === 540 && blocks[0].endMinutes === 600);
  t("buildBusyBlocks: flags the viewed session", blocks[1].id === 1 && blocks[1].isViewedSession === true);
  t("buildBusyBlocks: every other block is NOT flagged as viewed - this is the PHI boundary the panel renders opaque", blocks[0].isViewedSession === false);
  // The function is never even handed a client name or session type to
  // leak - only ids and minute offsets, confirming the PHI masking has to
  // happen this way (there's nothing identifying to accidentally render).
  t("buildBusyBlocks: block shape carries no identifying fields", Object.keys(blocks[0]).sort().join(",") === "endMinutes,id,isViewedSession,startMinutes");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
