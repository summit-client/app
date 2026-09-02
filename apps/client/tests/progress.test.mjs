/**
 * Progress shaping — the SHIPPED lib/progress.ts.
 *
 * These functions decide what a parent is told about their child's progress.
 * The rule the brief sets and this suite enforces: nothing is claimed that the
 * data does not support, and Clinical and Journey never disagree because they
 * read the same row.
 *
 * Run: node tests/progress.test.mjs
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

const out = join("tests", ".tmp-progress.mjs");
await esbuild.build({
  entryPoints: ["lib/progress.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const P = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const row = (over = {}) => ({
  program_id: "p1", client_id: 7, goal_name: "Ask for help", domain: "Communication",
  status: "active", target_pct: 80, mastery_criteria: "80% across 3 sessions",
  family_rationale: null, family_home_strategy: null,
  current_value: 72, recent_average: 70, prior_average: 60,
  sessions_with_data: 8, approaching_mastery: false, trend: "improving",
  ...over,
});

console.log("Shaping");
const goals = P.goalsFromRows([row(), row({ program_id: "p2", status: "mastered", trend: "steady", domain: "Daily Living" })]);
t("rows become goals", goals.length === 2);
t("numeric strings from Postgres become numbers",
  P.goalsFromRows([row({ current_value: "72.5", target_pct: "80" })])[0].currentValue === 72.5);
t("nulls stay null rather than becoming 0",
  P.goalsFromRows([row({ current_value: null })])[0].currentValue === null);

console.log("\nTrend is a sentence, never a bare arrow");
t("improving", P.trendLabel("improving") === "Improving");
t("declining is 'Needs attention', not 'Getting worse'",
  P.trendLabel("declining") === "Needs attention");
t("insufficient data says so", P.trendLabel("not_enough_data") === "Not enough data yet");
t("every trend has a non-colour mark",
  ["improving","steady","declining","establishing","not_enough_data"]
    .every((x) => typeof P.trendMark(x) === "string" && P.trendMark(x).length > 0));

console.log("\nJourney reads the same row as Clinical");
const g = goals[0];
t("journey percent is a share of the goal's own target",
  P.journeyPercent(g) === Math.round((70 / 80) * 100), String(P.journeyPercent(g)));
t("a goal past its target caps at 100, never 118",
  P.journeyPercent(P.goalsFromRows([row({ recent_average: 95, target_pct: 80 })])[0]) === 100);
t("no data gives null, so Journey can say 'not started' instead of drawing a 0% bar",
  P.journeyPercent(P.goalsFromRows([row({ trend: "not_enough_data" })])[0]) === null);
t("a goal with no target still yields a percent rather than dividing by zero",
  P.journeyPercent(P.goalsFromRows([row({ target_pct: null, recent_average: 40 })])[0]) === 40);
t("neither mode invents a value the other lacks",
  P.goalsFromRows([row()])[0].recentAverage === 70);

console.log("\nDomains");
const grouped = P.byDomain(goals);
t("grouped by domain", grouped.length === 2);
t("domains sort stably", grouped[0].domain === "Communication");
t("a goal with no domain lands in Other",
  P.byDomain(P.goalsFromRows([row({ domain: null })]))[0].domain === "Other");

console.log("\nAt a Glance counts only what is true");
const stats = P.atAGlance(P.goalsFromRows([
  row({ program_id: "a", status: "active", trend: "improving" }),
  row({ program_id: "b", status: "active", trend: "improving", approaching_mastery: true }),
  row({ program_id: "c", status: "mastered", trend: "steady" }),
  row({ program_id: "d", status: "active", trend: "not_enough_data" }),
]));
t("active goals", stats.activeGoals === 3, String(stats.activeGoals));
t("mastered", stats.masteredGoals === 1);
t("approaching mastery comes from the database, not a guess here",
  stats.approachingMastery === 1);
t("improving", stats.improving === 2);
t("goals awaiting data are counted, not hidden", stats.awaitingData === 1);

console.log("\nThe glance sentence never overclaims");
t("says what is true",
  P.glanceSentence(stats, "Maya") === "2 goals are trending upward, 1 is approaching mastery and 1 mastered so far.",
  P.glanceSentence(stats, "Maya"));
t("one improving goal is singular",
  P.glanceSentence({ activeGoals: 1, masteredGoals: 0, approachingMastery: 0, improving: 1, awaitingData: 0 }, "Maya")
    === "1 goal is trending upward.");
t("nothing to say, but data is coming: says that",
  P.glanceSentence({ activeGoals: 2, masteredGoals: 0, approachingMastery: 0, improving: 0, awaitingData: 2 }, "Maya")
    === "Progress will appear here once Maya has a few sessions of data.");
t("no goals at all: says that, rather than inventing encouragement",
  P.glanceSentence({ activeGoals: 0, masteredGoals: 0, approachingMastery: 0, improving: 0, awaitingData: 0 }, "Noah")
    === "No goals are being tracked for Noah yet.");
t("a declining goal is never spun as progress",
  !P.glanceSentence({ activeGoals: 1, masteredGoals: 0, approachingMastery: 0, improving: 0, awaitingData: 0 }, "Maya")
    .includes("upward"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
