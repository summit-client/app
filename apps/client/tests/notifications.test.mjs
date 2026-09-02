/**
 * Notification centre shaping — the SHIPPED lib/notifications.ts.
 *
 * What a family may see is decided by my_notifications() in migration 0045 and
 * tested in supabase/tests/rls.mjs. These test the ordering decisions, which
 * are the part that makes the list useful or useless.
 *
 * Run: node tests/notifications.test.mjs
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

const out = join("tests", ".tmp-notifications.mjs");
await esbuild.build({
  entryPoints: ["lib/notifications.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const N = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const row = (over = {}) => ({
  source: "task", ref_id: "t1", title: "Confirm appointment",
  detail: "Session on Tuesday 3 September", occurred_at: "2026-09-03T00:00:00.000Z",
  is_urgent: false, href: "/appointments", ...over,
});

console.log("Shaping");
t("rows become notifications", N.notificationsFromRows([row(), row({ ref_id: "t2" })]).length === 2);
t("a source this build does not know is dropped, not rendered blank",
  N.notificationsFromRows([row(), row({ source: "hologram", ref_id: "x" })]).length === 1);
t("urgency is a boolean even when Postgres sends one oddly",
  N.notificationsFromRows([row({ is_urgent: true })])[0].isUrgent === true);
t("a null detail stays null rather than becoming 'null'",
  N.notificationsFromRows([row({ detail: null })])[0].detail === null);

console.log("\nOutstanding work sorts oldest first, not newest");
const sorted = N.sortNotifications(N.notificationsFromRows([
  row({ ref_id: "new", occurred_at: "2026-09-10T00:00:00.000Z" }),
  row({ ref_id: "old", occurred_at: "2026-09-01T00:00:00.000Z" }),
  row({ ref_id: "urgent-new", occurred_at: "2026-09-12T00:00:00.000Z", is_urgent: true }),
]));
t("urgent comes first whatever its date", sorted[0].refId === "urgent-new");
t("then the longest-waiting, because that is what a to-do list is for",
  sorted[1].refId === "old" && sorted[2].refId === "new",
  sorted.map((s) => s.refId).join(","));
t("an undated row sorts last: an unknown date is not evidence of urgency", (() => {
  const s = N.sortNotifications(N.notificationsFromRows([
    row({ ref_id: "undated", occurred_at: null }),
    row({ ref_id: "dated", occurred_at: "2026-09-01T00:00:00.000Z" }),
  ]));
  return s[0].refId === "dated";
})());
t("sorting does not mutate the input", (() => {
  const input = N.notificationsFromRows([
    row({ ref_id: "a", is_urgent: false }), row({ ref_id: "b", is_urgent: true })]);
  N.sortNotifications(input);
  return input[0].refId === "a";
})());

console.log("\nNews sorts the other way, on purpose");
const anns = N.announcementsFromRows([
  { announcement_id: "a", title: "Old", body: "b", category: "general",
    is_urgent: false, publish_at: "2026-08-01T00:00:00.000Z", is_unread: true },
  { announcement_id: "b", title: "New", body: "b", category: "closure",
    is_urgent: false, publish_at: "2026-08-30T00:00:00.000Z", is_unread: false },
  { announcement_id: "c", title: "Urgent old", body: "b", category: "safety",
    is_urgent: true, publish_at: "2026-07-01T00:00:00.000Z", is_unread: true },
]);
const sortedAnns = N.sortAnnouncements(anns);
t("urgent pins to the top", sortedAnns[0].announcementId === "c");
t("then newest first, because this list is news not work",
  sortedAnns[1].announcementId === "b" && sortedAnns[2].announcementId === "a");

console.log("\nLabels");
t("a message says so", N.sourceLabel("message") === "Message");
t("an announcement reads as coming from the clinic",
  N.sourceLabel("announcement") === "From the clinic");
t("a task says it needs you", N.sourceLabel("task") === "Needs you");
t("a known category gets its own word",
  N.announcementCategoryLabel("closure") === "Closure");
t("an unknown category falls back rather than rendering the raw value",
  N.announcementCategoryLabel("whatever") === "Notice");

console.log("\nThe summary counts, and does not congratulate");
t("nothing waiting says so plainly",
  N.summaryLine([]) === "Nothing needs your attention right now.");
t("no exclamation marks anywhere", !N.summaryLine([]).includes("!"));
t("one item is singular",
  N.summaryLine(N.notificationsFromRows([row()])) === "1 item waiting.");
t("several are counted",
  N.summaryLine(N.notificationsFromRows([row(), row({ ref_id: "b" })])) === "2 items waiting.");
t("urgent is called out",
  N.summaryLine(N.notificationsFromRows([row(), row({ ref_id: "b", is_urgent: true })]))
    === "2 items waiting, 1 marked urgent.");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
