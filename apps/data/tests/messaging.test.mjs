/**
 * Staff messaging queue — the SHIPPED lib/messaging.ts.
 *
 * The ordering is the whole point of a queue, and it is the part that is
 * silently wrong if nobody checks: a queue sorted the obvious way (newest
 * first) buries the message that has been waiting since Tuesday.
 *
 * Run: node tests/messaging.test.mjs
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

const out = join("tests", ".tmp-messaging.mjs");
await esbuild.build({
  entryPoints: ["lib/messaging.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral", external: ["@supabase/ssr"],
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const M = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const th = (over = {}) => ({
  id: "t", clientId: 1, clientName: "Maya", householdId: "h", householdName: "Yankov",
  subject: "s", category: "scheduling", status: "open", priority: "normal",
  assignedTo: null, lastMessageAt: "2026-08-30T09:00:00.000Z",
  createdAt: "2026-08-30T09:00:00.000Z", ...over,
});

console.log("Queue order");
const q = M.sortQueue([
  th({ id: "resolved", status: "resolved", lastMessageAt: "2026-08-01T00:00:00.000Z" }),
  th({ id: "answered-old", status: "awaiting_family", lastMessageAt: "2026-08-02T00:00:00.000Z" }),
  th({ id: "new-unanswered", status: "open", lastMessageAt: "2026-08-31T00:00:00.000Z" }),
  th({ id: "old-unanswered", status: "open", lastMessageAt: "2026-08-03T00:00:00.000Z" }),
  th({ id: "urgent-newer", status: "open", priority: "high", lastMessageAt: "2026-08-20T00:00:00.000Z" }),
]);
t("unanswered comes before anything already replied to",
  ["urgent-newer", "old-unanswered", "new-unanswered"].includes(q[0].id));
t("urgent leads the unanswered", q[0].id === "urgent-newer", q.map((x) => x.id).join(","));
t("then the longest waiting, not the most recent",
  q[1].id === "old-unanswered" && q[2].id === "new-unanswered");
t("waiting-on-family sits below unanswered", q[3].id === "answered-old");
t("resolved sits last", q[4].id === "resolved");
t("sorting does not mutate the input", (() => {
  const input = [th({ id: "a", status: "resolved" }), th({ id: "b", status: "open" })];
  M.sortQueue(input);
  return input[0].id === "a";
})());

console.log("\nHow long something has waited");
const now = new Date("2026-08-31T12:00:00.000Z");
t("under an hour says so",
  M.waitingFor(th({ lastMessageAt: "2026-08-31T11:30:00.000Z" }), now) === "under an hour");
t("hours are singular at one",
  M.waitingFor(th({ lastMessageAt: "2026-08-31T11:00:00.000Z" }), now) === "1 hour");
t("hours", M.waitingFor(th({ lastMessageAt: "2026-08-31T09:00:00.000Z" }), now) === "3 hours");
t("days", M.waitingFor(th({ lastMessageAt: "2026-08-28T12:00:00.000Z" }), now) === "3 days");
t("an unparseable date yields nothing rather than 'NaN days'",
  M.waitingFor(th({ lastMessageAt: "nonsense" }), now) === "");

console.log("\nWhat is overdue");
const late = M.overdue([
  th({ id: "late", status: "open", lastMessageAt: "2026-08-29T00:00:00.000Z" }),
  th({ id: "recent", status: "open", lastMessageAt: "2026-08-31T11:00:00.000Z" }),
  // Already answered: the clinic is not the one holding this up.
  th({ id: "answered", status: "awaiting_family", lastMessageAt: "2026-08-01T00:00:00.000Z" }),
  th({ id: "done", status: "resolved", lastMessageAt: "2026-08-01T00:00:00.000Z" }),
], now);
t("counts only what the clinic has not answered", late.length === 1 && late[0].id === "late",
  late.map((x) => x.id).join(","));
t("a thread waiting on the family is never overdue for the clinic",
  !late.some((x) => x.id === "answered"));

console.log("\nStatus reads from the clinic's side");
t("open means someone has to reply", M.statusLabel("open") === "Needs a reply");
t("awaiting_family reads as waiting on them, not 'clinic replied'",
  M.statusLabel("awaiting_family") === "Waiting on family");
t("resolved", M.statusLabel("resolved") === "Resolved");
t("clinical is 'Clinical' here, unlike the family's 'About care'",
  M.categoryLabel("clinical") === "Clinical");

console.log("\nReplies");
t("empty is refused", M.replyProblem("   ") === "Write a reply before sending.");
t("a normal reply passes", M.replyProblem("Thursday at 4pm works.") === null);
t("an over-long reply says by how much",
  /12 characters over/.test(M.replyProblem("x".repeat(M.MAX_MESSAGE_LENGTH + 12))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
