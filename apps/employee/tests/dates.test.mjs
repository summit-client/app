/**
 * Calendar-date handling in lib/hub.ts — the SHIPPED functions, not copies.
 *
 * These three functions decide an ESA vacation entitlement, whether a
 * certificate reads as lapsed, and when an onboarding task is overdue. All
 * three took a `YYYY-MM-DD` string and handed it to `new Date()`, which parses
 * it as UTC midnight, and then read it back with local-time getters. West of
 * UTC those disagree by a day.
 *
 * Every test here runs under an explicit TZ so the failure is reproducible
 * rather than dependent on where the machine happens to be. America/Toronto is
 * the anchor client's timezone and is west of UTC; Australia/Sydney is east,
 * which catches the mirror-image mistake of "fixing" it by subtracting.
 *
 * Run: node tests/dates.test.mjs
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
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: out, format: "esm", platform: "neutral",
    define: { "process.env.NEXT_PUBLIC_DEV_PREVIEW": '"1"' },
    external: ["@supabase/ssr", "react"],
  });
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

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
globalThis.window = globalThis;
process.env.NEXT_PUBLIC_DEV_PREVIEW = "1";

const hub = await import(await bundleOf("lib/hub.ts", ".tmp-hub-dates.mjs"));

/**
 * Run a block under a fixed timezone.
 *
 * Node reads TZ lazily per Date operation on every platform this runs on, but
 * only after the ICU cache is reset — which `Intl.DateTimeFormat` does not
 * expose. Setting process.env.TZ and constructing a fresh Date is enough on
 * Linux and macOS, which is where this suite runs.
 */
function inTz(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
}

console.log("Calendar dates: parsing");

for (const tz of ["America/Toronto", "Australia/Sydney", "UTC"]) {
  inTz(tz, () => {
    const d = hub.parseCalendarDate("2026-01-05");
    t(`${tz}: a calendar date keeps its own day number`,
      d.getFullYear() === 2026 && d.getMonth() === 0 && d.getDate() === 5,
      `got ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    t(`${tz}: round trips back to the same string`,
      hub.toCalendarDate(hub.parseCalendarDate("2026-06-30")) === "2026-06-30",
      hub.toCalendarDate(hub.parseCalendarDate("2026-06-30")));
  });
}

console.log("\nEntitlements: the anniversary is the hire date, not the day before");

inTz("America/Toronto", () => {
  // Hired 5 January. On 4 January 2031 they are still in their fifth year;
  // on the 5th they cross the ESA seniority threshold and the vacation
  // entitlement steps from 10 days to 15. Getting the anniversary a day early
  // hands out the higher entitlement a day early, every year, for everyone.
  const dayBefore = hub.computeEntitlements("2026-01-05", [], new Date(2031, 0, 4, 9));
  const onTheDay = hub.computeEntitlements("2026-01-05", [], new Date(2031, 0, 5, 9));

  t("four years and 364 days is still 4 service years",
    dayBefore.serviceYears === 4, `got ${dayBefore.serviceYears}`);
  t("the fifth anniversary is 5 service years",
    onTheDay.serviceYears === 5, `got ${onTheDay.serviceYears}`);
  t("the day before the threshold gives the base entitlement",
    dayBefore.vacation.entitled === 10, `got ${dayBefore.vacation.entitled}`);
  t("crossing the threshold gives the senior entitlement",
    onTheDay.vacation.entitled === 15, `got ${onTheDay.vacation.entitled}`);
  t("the entitlement year resets on the anniversary, not the day before",
    onTheDay.nextReset === "2032-01-05", onTheDay.nextReset);
});

inTz("Australia/Sydney", () => {
  // East of UTC the old code happened to be right; the fix must not break it.
  const e = hub.computeEntitlements("2026-01-05", [], new Date(2031, 0, 5, 9));
  t("east of UTC: the anniversary is still the hire date",
    e.serviceYears === 5 && e.nextReset === "2032-01-05",
    `${e.serviceYears} / ${e.nextReset}`);
});

console.log("\nEntitlements: a request lands in the right entitlement year");

inTz("America/Toronto", () => {
  const requests = [
    // Exactly on the anniversary: the first day of the NEW year, so it must
    // not be counted against the year that just ended.
    { type: "VACATION", startDate: "2031-01-05", endDate: "2031-01-05", days: 1, status: "APPROVED" },
    // The day before: the last day of the old year.
    { type: "VACATION", startDate: "2031-01-04", endDate: "2031-01-04", days: 1, status: "APPROVED" },
  ];
  const newYear = hub.computeEntitlements("2026-01-05", requests, new Date(2031, 0, 6, 9));
  t("a request on the anniversary counts in the new year",
    newYear.vacation.used === 1, `used ${newYear.vacation.used}`);

  const oldYear = hub.computeEntitlements("2026-01-05", requests, new Date(2031, 0, 4, 9));
  t("a request the day before counts in the old year",
    oldYear.vacation.used === 1, `used ${oldYear.vacation.used}`);
});

console.log("\nCertificates: valid through the expiry date, not up to it");

inTz("America/Toronto", () => {
  // In EDT (UTC-4), `new Date("2026-06-30")` is 20:00 on the 29th local. From
  // that instant the old comparison reported EXPIRED — a full 28 hours before
  // the certificate actually stopped being valid. 21:00 is inside that window;
  // 19:00 is not, which is why the hour here is chosen rather than incidental.
  t("the evening before expiry, past the UTC boundary, is not expired",
    hub.certLifecycle("2026-06-30", new Date(2026, 5, 29, 21, 0)) === "EXPIRING_SOON",
    hub.certLifecycle("2026-06-30", new Date(2026, 5, 29, 21, 0)));
  t("the expiry day itself is not expired",
    hub.certLifecycle("2026-06-30", new Date(2026, 5, 30, 23, 0)) === "EXPIRING_SOON",
    hub.certLifecycle("2026-06-30", new Date(2026, 5, 30, 23, 0)));
  t("the day after is expired",
    hub.certLifecycle("2026-06-30", new Date(2026, 6, 1, 0, 30)) === "EXPIRED",
    hub.certLifecycle("2026-06-30", new Date(2026, 6, 1, 0, 30)));
  t("far out is active",
    hub.certLifecycle("2027-06-30", new Date(2026, 5, 30, 9, 0)) === "ACTIVE");
  t("no expiry date is always active",
    hub.certLifecycle(null, new Date(2026, 5, 30, 9, 0)) === "ACTIVE");
});

console.log("\nDeadlines: day arithmetic survives a DST boundary");

// These passed before the change too — the old implementation did its
// arithmetic in UTC, which has no DST. They are here as a regression guard on
// the rewrite, not as evidence of a bug that was fixed.
inTz("America/Toronto", () => {
  // 2026-03-08 is spring-forward in Toronto; this 14-day deadline crosses it.
  t("a 14-day deadline across spring-forward is 14 calendar days",
    hub.dueDate("2026-03-01", "WEEK_1") === "2026-03-15",
    hub.dueDate("2026-03-01", "WEEK_1"));
  // 2026-11-01 is fall-back.
  t("a 30-day deadline across fall-back is 30 calendar days",
    hub.dueDate("2026-10-20", "WITHIN_30_DAYS") === "2026-11-19",
    hub.dueDate("2026-10-20", "WITHIN_30_DAYS"));
  t("a bucket with no offset has no due date",
    hub.dueDate("2026-03-01", "CUSTOM") === null);
  t("no start date means no due date",
    hub.dueDate(null, "WEEK_1") === null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
