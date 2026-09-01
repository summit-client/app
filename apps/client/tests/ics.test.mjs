/**
 * Calendar export — the SHIPPED lib/ics.ts.
 *
 * Added when the export went family-wide: a file a parent imports once and
 * then trusts is the worst place for a quietly missing sibling, or for a title
 * that does not say whose appointment it is.
 *
 * Run: node tests/ics.test.mjs
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

const out = join("tests", ".tmp-ics.mjs");
await esbuild.build({
  entryPoints: ["lib/ics.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const I = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const s = (over = {}) => ({
  id: 1, session_date: "2026-09-15", hour: 14, minute: 30,
  type: "Therapy Session", ...over,
});

console.log("A single-child export");
const one = I.buildAppointmentsIcs([s()], "Maya");
t("is a valid calendar", one.startsWith("BEGIN:VCALENDAR") && one.trimEnd().endsWith("END:VCALENDAR"));
t("names the child once, in the calendar name", one.includes("Maya - Summit Appointments"));
t("does not repeat the child in every event title",
  !one.split("BEGIN:VEVENT")[1].includes("SUMMARY:Maya"));

console.log("\nA family export");
const many = I.buildAppointmentsIcs(
  [s({ id: 1, childName: "Maya" }), s({ id: 2, childName: "Noah", session_date: "2026-09-16" })],
  "Yankov Family");
t("carries every child's sessions, not just the first",
  (many.match(/BEGIN:VEVENT/g) || []).length === 2);
t("each event says whose it is, because the summary is often all that fits",
  many.includes("SUMMARY:Maya - Therapy Session") && many.includes("SUMMARY:Noah - Therapy Session"));
t("the calendar is named for the household", many.includes("Yankov Family - Summit Appointments"));

console.log("\nIdentity and escaping");
t("UIDs are stable per session, so a re-import updates rather than duplicates",
  many.includes("UID:session-1@summitclient.io") && many.includes("UID:session-2@summitclient.io"));
t("a name with a comma is escaped, not left to break the line", (() => {
  const out = I.buildAppointmentsIcs([s({ childName: "Smith, Jr" })], "F");
  return out.includes("Smith\\, Jr");
})());
t("a session with no time still appears, as an all-day entry", (() => {
  const out = I.buildAppointmentsIcs([s({ hour: null, minute: null, childName: "Maya" })], "F");
  return out.includes("DTSTART;VALUE=DATE:20260915") && out.includes("SUMMARY:Maya - Therapy Session");
})());
t("a null childName behaves exactly like a single-child export", (() => {
  const out = I.buildAppointmentsIcs([s({ childName: null })], "Maya");
  return out.includes("SUMMARY:Therapy Session");
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
