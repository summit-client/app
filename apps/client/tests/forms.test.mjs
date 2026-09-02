/**
 * Forms and consents shaping — the SHIPPED lib/forms.ts.
 *
 * Two things here are load-bearing beyond presentation: fieldsFrom() decides
 * what a family is asked, from JSON a clinic wrote, and pruneAnswers() decides
 * what reaches a jsonb column staff later read as clinical record.
 *
 * Run: node tests/forms.test.mjs
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

const out = join("tests", ".tmp-forms.mjs");
await esbuild.build({
  entryPoints: ["lib/forms.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const F = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

console.log("Fields come from JSON a clinic wrote, so they are checked");
t("a well-formed field survives", (() => {
  const f = F.fieldsFrom([{ id: "a", label: "Allergies?", type: "text", required: true }]);
  return f.length === 1 && f[0].required === true;
})());
t("a field with no id is dropped: there is no key to store its answer under",
  F.fieldsFrom([{ label: "Nameless", type: "text" }]).length === 0);
t("a field with no label is dropped: an unlabelled box collects an answer to no question",
  F.fieldsFrom([{ id: "x", type: "text" }]).length === 0);
t("a duplicate id is dropped, not silently overwritten", (() => {
  const f = F.fieldsFrom([{ id: "a", label: "First" }, { id: "a", label: "Second" }]);
  return f.length === 1 && f[0].label === "First";
})());
t("an unknown type falls back to text rather than leaving a gap",
  F.fieldsFrom([{ id: "a", label: "Sign", type: "signature" }])[0].type === "text");
t("required defaults to false rather than true",
  F.fieldsFrom([{ id: "a", label: "A" }])[0].required === false);
t("options only exist on a choice field",
  F.fieldsFrom([{ id: "a", label: "A", type: "text", options: ["x"] }])[0].options.length === 0);
t("non-string options are discarded", (() => {
  const f = F.fieldsFrom([{ id: "a", label: "A", type: "choice", options: ["x", 4, "", "y"] }]);
  return f[0].options.join(",") === "x,y";
})());
t("a template whose fields are not an array yields none, rather than throwing",
  F.fieldsFrom({ id: "a" }).length === 0 && F.fieldsFrom(null).length === 0);

const fields = F.fieldsFrom([
  { id: "allergies", label: "Allergies", type: "text", required: true },
  { id: "dose", label: "Dose", type: "number" },
  { id: "start", label: "Start date", type: "date" },
  { id: "pref", label: "Preference", type: "choice", options: ["Morning", "Afternoon"] },
  { id: "agree", label: "I agree", type: "checkbox", required: true },
]);

console.log("\nValidation, per field");
t("a required field says so, beside itself",
  F.answerProblems(fields, {}).allergies === "This one is needed.");
t("whitespace is not an answer",
  F.answerProblems(fields, { allergies: "   " }).allergies !== undefined);
t("a required checkbox has to be ticked",
  F.answerProblems(fields, { agree: false }).agree === "This needs to be ticked.");
t("an unticked optional checkbox is a real answer, not a gap", (() => {
  const optional = F.fieldsFrom([{ id: "x", label: "X", type: "checkbox" }]);
  return F.answerProblems(optional, { x: false }).x === undefined;
})());
t("a non-number in a number field is caught",
  F.answerProblems(fields, { dose: "twice" }).dose === "Enter a number.");
t("a valid number passes", F.answerProblems(fields, { dose: "5" }).dose === undefined);
t("a malformed date is caught",
  F.answerProblems(fields, { start: "3rd Sept" }).start !== undefined);
t("an ISO date passes", F.answerProblems(fields, { start: "2026-09-03" }).start === undefined);
t("a choice outside the options is refused",
  F.answerProblems(fields, { pref: "Midnight" }).pref === "Choose one of the listed options.");
t("a listed choice passes", F.answerProblems(fields, { pref: "Morning" }).pref === undefined);
t("a complete set of answers has no problems", (() => {
  const p = F.answerProblems(fields, {
    allergies: "None", dose: "5", start: "2026-09-03", pref: "Morning", agree: true });
  return Object.keys(p).length === 0;
})());
t("optional fields left blank are not problems",
  Object.keys(F.answerProblems(fields, { allergies: "None", agree: true })).length === 0);

console.log("\nOnly the template's own fields reach the database");
t("an answer to a field the template does not define is dropped", (() => {
  const pruned = F.pruneAnswers(fields, { allergies: "None", injected: "staff note" });
  return pruned.allergies === "None" && !("injected" in pruned);
})());
t("pruning keeps falsy answers, which are still answers", (() => {
  const pruned = F.pruneAnswers(fields, { agree: false, dose: 0 });
  return pruned.agree === false && pruned.dose === 0;
})());
t("pruning an empty template yields nothing",
  Object.keys(F.pruneAnswers([], { a: 1 })).length === 0);

console.log("\nOrdering");
const form = (over = {}) => ({
  assignment_id: "a1", client_id: 7, template_id: "t1", key: "k", version: 1,
  title: "Intake", description: null, kind: "form", fields: [],
  consent_statement: null, due_on: null, is_required: true,
  assigned_at: "2026-08-01T00:00:00.000Z", completed_at: null, signed_name: null, ...over,
});
const today = "2026-09-01";
const sorted = F.sortForms(F.formsFromRows([
  form({ assignment_id: "done", completed_at: "2026-08-10T00:00:00.000Z" }),
  form({ assignment_id: "optional", is_required: false }),
  form({ assignment_id: "overdue", due_on: "2026-08-20" }),
  form({ assignment_id: "needed" }),
]), today);
t("overdue leads", sorted[0].assignmentId === "overdue");
t("then required, then optional",
  sorted[1].assignmentId === "needed" && sorted[2].assignmentId === "optional",
  sorted.map((s) => s.assignmentId).join(","));
t("completed forms stay in the list, because 'did I already send that' is the question",
  sorted[3].assignmentId === "done");
t("sorting does not mutate the input", (() => {
  const input = F.formsFromRows([form({ assignment_id: "a", due_on: "2026-12-01" }),
                                 form({ assignment_id: "b", due_on: "2026-01-01" })]);
  F.sortForms(input, today);
  return input[0].assignmentId === "a";
})());

console.log("\nStatus reads in the family's terms");
t("completed", F.formStatus(F.formsFromRows([form({ completed_at: "x" })])[0], today) === "Completed");
t("overdue", F.formStatus(F.formsFromRows([form({ due_on: "2026-08-01" })])[0], today) === "Overdue");
t("a future due date is shown, not just 'due'",
  F.formStatus(F.formsFromRows([form({ due_on: "2026-12-01" })])[0], today) === "Due 2026-12-01");
t("no due date and required reads as Needed",
  F.formStatus(F.formsFromRows([form()])[0], today) === "Needed");
t("no due date and not required reads as Optional",
  F.formStatus(F.formsFromRows([form({ is_required: false })])[0], today) === "Optional");

console.log("\nConsents");
const consents = F.consentsFromRows([
  { consent_id: "c1", client_id: 7, title: "Photography", consent_statement: "...",
    key: "photo", granted_at: "2026-03-01T00:00:00.000Z", signed_name: "Adina",
    withdrawn_at: null, withdrawal_reason: null, is_active: true },
  { consent_id: "c2", client_id: 7, title: "Photography", consent_statement: "...",
    key: "photo", granted_at: "2026-01-01T00:00:00.000Z", signed_name: "Adina",
    withdrawn_at: "2026-02-01T00:00:00.000Z", withdrawal_reason: "Changed our minds",
    is_active: false },
]);
t("both windows survive, not just the live one", consents.length === 2);
t("a withdrawn consent keeps the date it was granted",
  consents[1].grantedAt === "2026-01-01T00:00:00.000Z");
t("and the date it ended", consents[1].withdrawnAt === "2026-02-01T00:00:00.000Z");
t("active is a boolean, from the database", consents[0].isActive === true);

console.log("\nSigning");
t("an empty signature is refused", F.signatureProblem("  ") === "Type your name to sign.");
t("a name passes", F.signatureProblem("Adina Yankov") === null);
t("an absurd name is refused",
  F.signatureProblem("x".repeat(F.MAX_SIGNED_NAME + 1)) !== null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
