/**
 * Message shaping — the SHIPPED lib/messages.ts.
 *
 * Nothing here tests the internal-note guarantee: that is enforced by RLS in
 * migration 0038 and tested in supabase/tests/rls.mjs, which is the only place
 * a test of it means anything. What these test is that the portal says true
 * things about what the database handed it.
 *
 * Run: node tests/messages.test.mjs
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

const out = join("tests", ".tmp-messages.mjs");
await esbuild.build({
  entryPoints: ["lib/messages.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const M = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const row = (over = {}) => ({
  thread_id: "t1", client_id: 7, household_id: "h1",
  subject: "Tuesday session", category: "scheduling", status: "awaiting_family",
  last_message_at: "2026-08-31T12:00:00.000Z", created_at: "2026-08-28T09:00:00.000Z",
  unread_count: 2, last_message_preview: "Thursday at 4pm works.", last_message_from: "staff",
  ...over,
});

console.log("Shaping");
const threads = M.threadsFromRows([row(), row({ thread_id: "t2", client_id: null, unread_count: 0 })]);
t("rows become threads", threads.length === 2);
t("bigint-as-string from PostgREST becomes a number",
  M.threadsFromRows([row({ client_id: "7" })])[0].clientId === 7);
t("a household thread keeps a null client rather than becoming 0",
  threads[1].clientId === null);
t("unread count is a number even when Postgres sends a string",
  M.threadsFromRows([row({ unread_count: "3" })])[0].unreadCount === 3);
t("an unrecognized category falls back to Other rather than rendering raw",
  M.threadsFromRows([row({ category: "nonsense" })])[0].category === "other");
t("an unrecognized status falls back to open",
  M.threadsFromRows([row({ status: "nonsense" })])[0].status === "open");
t("an unrecognized author kind becomes null, never rendered as a role",
  M.threadsFromRows([row({ last_message_from: "admin" })])[0].lastMessageFrom === null);

console.log("\nLabels are what a parent would say");
t("clinical reads as 'About care', not 'Clinical'",
  M.categoryLabel("clinical") === "About care");
t("billing names funding too, since that is what most of it is",
  M.categoryLabel("billing") === "Billing and funding");
t("awaiting_family reads from the family's side",
  M.statusLabel("awaiting_family") === "Clinic replied");
t("every category has a label", M.CATEGORY_OPTIONS.every((o) => o.label && o.label.length > 1));
t("Other is offered last, not alphabetically in the middle",
  M.CATEGORY_OPTIONS[M.CATEGORY_OPTIONS.length - 1].value === "other");

console.log("\nRelative time");
const now = new Date("2026-08-31T12:00:00.000Z");
t("under a minute", M.whenLabel("2026-08-31T11:59:40.000Z", now) === "Just now");
t("minutes are singular at one",
  M.whenLabel("2026-08-31T11:59:00.000Z", now) === "1 minute ago");
t("hours", M.whenLabel("2026-08-31T09:00:00.000Z", now) === "3 hours ago");
t("yesterday is a word, not '1 day ago'",
  M.whenLabel("2026-08-30T09:00:00.000Z", now) === "Yesterday");
t("within the week counts days", M.whenLabel("2026-08-28T09:00:00.000Z", now) === "3 days ago");
t("older than a week becomes a date, because '31 days ago' is not useful",
  /2026/.test(M.whenLabel("2026-06-01T09:00:00.000Z", now)));
t("an unparseable timestamp yields an empty string, not 'NaN minutes ago'",
  M.whenLabel("not-a-date", now) === "");

console.log("\nPreviews");
t("a short message is shown whole", M.previewOf("Thanks!") === "Thanks!");
t("no messages says so rather than showing a blank row",
  M.previewOf(null) === "No messages yet");
t("newlines collapse, so a multi-line message does not break the row",
  M.previewOf("one\n\ntwo") === "one two");
t("ordinary prose is cut at a word boundary, never mid-word", (() => {
  const prose = "We wanted to check whether Thursday afternoon would still work for "
    + "Maya's session, since her school schedule changed this term and we would "
    + "rather not move it twice.";
  const p = M.previewOf(prose, 90);
  // The cut lands on a space in the source, so the preview is a run of whole
  // words. A mid-word cut would produce a fragment the source never contains.
  return p.endsWith("…") && prose.startsWith(p.slice(0, -1));
})(), M.previewOf("We wanted to check whether Thursday afternoon would still work for Maya's session, since her school schedule changed this term.", 90));
t("a single very long word still gets cut rather than overflowing", (() => {
  const p = M.previewOf("x".repeat(300), 90);
  return p.length <= 91 && p.endsWith("…");
})());

console.log("\nOrdering");
const sorted = M.sortThreads(M.threadsFromRows([
  row({ thread_id: "old-unread", unread_count: 1, last_message_at: "2026-08-01T00:00:00.000Z" }),
  row({ thread_id: "new-read", unread_count: 0, last_message_at: "2026-08-31T00:00:00.000Z" }),
  row({ thread_id: "new-unread", unread_count: 3, last_message_at: "2026-08-30T00:00:00.000Z" }),
]));
t("unread threads come first, so a three-day-old reply is not buried",
  sorted[0].threadId === "new-unread" && sorted[1].threadId === "old-unread",
  sorted.map((s) => s.threadId).join(","));
t("read threads still sort newest-first below them", sorted[2].threadId === "new-read");
t("sorting does not mutate the input", (() => {
  const input = M.threadsFromRows([row({ thread_id: "a", unread_count: 0 }), row({ thread_id: "b", unread_count: 5 })]);
  M.sortThreads(input);
  return input[0].threadId === "a";
})());
t("unread total adds up", M.unreadTotal(sorted) === 4);

console.log("\nA draft that would arrive empty cannot be sent");
t("empty is refused", M.messageProblem("") !== null);
t("whitespace only is refused", M.messageProblem("   \n  ") !== null);
t("the refusal is a sentence, not a boolean",
  /Write a message/.test(M.messageProblem("")));
t("a normal message passes", M.messageProblem("Can we move Tuesday?") === null);
t("an over-long message says by how much",
  /12 characters over the limit/.test(M.messageProblem("x".repeat(M.MAX_MESSAGE_LENGTH + 12))));
t("a message exactly at the limit is allowed",
  M.messageProblem("x".repeat(M.MAX_MESSAGE_LENGTH)) === null);
t("leading and trailing whitespace does not count against the limit",
  M.messageProblem("  " + "x".repeat(M.MAX_MESSAGE_LENGTH) + "  ") === null);
t("a subject is required", M.subjectProblem("  ") !== null);
t("an over-long subject is refused",
  M.subjectProblem("x".repeat(M.MAX_SUBJECT_LENGTH + 1)) !== null);
t("a normal subject passes", M.subjectProblem("Moving Tuesday") === null);

console.log("\nWho a thread is about");
const names = new Map([[7, "Maya"]]);
t("a thread about a child names the child",
  M.regardingLabel(threads[0], names) === "Maya");
t("a household thread says so", M.regardingLabel(threads[1], names) === "Your family");
t("an unknown child is described, never rendered as a database id",
  M.regardingLabel(M.threadsFromRows([row({ client_id: 999 })])[0], names)
    === "A child on your file");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
