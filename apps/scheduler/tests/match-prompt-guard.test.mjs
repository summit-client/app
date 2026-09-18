/**
 * /api/match's identifier guard, driven by the real prompt the Create wizard
 * builds and by the one it used to build.
 *
 * The rules are read out of pages/api/match.ts rather than restated, so a
 * change there shows up here instead of leaving a test that passes against a
 * copy. This route has no other automated cover: it is an API route, so the
 * calendar suite does not touch it and a build only proves it compiles.
 *
 * Run: node apps/scheduler/tests/match-prompt-guard.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "pages", "api", "match.ts"), "utf8");

// Lift the guard out of the route source: the array literal, the date rule,
// and the function body all come from the shipped file.
const arr = src.match(/const FORBIDDEN_IN_PROMPT[^=]*=\s*(\[[\s\S]*?\n\];)/);
const iso = src.match(/const ISO_DATE\s*=\s*(\/.*\/g);/);
const fn = src.match(/(function forbiddenIdentifier\([\s\S]*?\n\})/);
if (!arr || !iso || !fn) throw new Error("could not lift the guard out of match.ts");
const FORBIDDEN_IN_PROMPT = eval(arr[1].replace(/;$/, ""));
const ISO_DATE = eval(iso[1]);
// Only the type annotations stand between the shipped function and plain node;
// strip those two and the body is the body that runs in production.
const plain = fn[1]
  .replace("(prompt: string): string | null", "(prompt)")
  .replace(/: string \| null/g, "");
const forbiddenIdentifier = eval(`(${plain})`);

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = want === null ? got === null : got !== null;
  if (ok) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "-> got", JSON.stringify(got)); }
};

// The prompt the wizard builds today, values shaped like real ones.
const current = `You are an ABA scheduling assistant. Find the best staff match for a client.
CALENDAR: Fall 2026 (2026-09-01 to 2026-12-19)
SESSION: Direct Therapy 1:1 (120min)
SESSIONS/WEEK: 3 | SCHEDULE: Recurring — until 2026-12-19
ELIGIBLE STAFF: Priya Raghunathan (12/20), Tom O'Neill (3/25), Anne-Marie Dubois (0/15)
Respond ONLY with valid JSON — no extra text:
{"matches":[{"staffName":"...","overlappingSlots":["Mon 9:00"]}],"recommendation":"..."}`;

console.log("The real prompt is not refused");
t("current prompt passes", forbiddenIdentifier(current), null);
t("one-time variant passes",
  forbiddenIdentifier(current.replace("Recurring — until 2026-12-19", "One-time")), null);
t("count-based end condition passes",
  forbiddenIdentifier(current.replace("until 2026-12-19", "24 sessions total")), null);
t("no eligible staff passes", forbiddenIdentifier(current.replace(/ELIGIBLE STAFF: .*/, "ELIGIBLE STAFF: none")), null);
t("staff names with apostrophes, hyphens and capacities do not trip the number rule",
  forbiddenIdentifier("ELIGIBLE STAFF: Tom O'Neill (3/25), Anne-Marie Dubois (0/15)"), null);

console.log("The leak it exists to stop");
t("the prompt as it shipped, carrying a client name",
  forbiddenIdentifier(current.replace("SESSION:", "CLIENT: Ezra Whitfield | SESSION:")), "REFUSE");
t("a CLIENT: line on its own", forbiddenIdentifier("CLIENT: Ezra Whitfield"), "REFUSE");
t("lowercase and indented", forbiddenIdentifier("  client: Ezra Whitfield"), "REFUSE");
t("PATIENT:", forbiddenIdentifier("PATIENT: Ezra Whitfield"), "REFUSE");
t("GUARDIAN:", forbiddenIdentifier("GUARDIAN: Dana Whitfield"), "REFUSE");

console.log("Other direct identifiers");
t("an email address", forbiddenIdentifier(current + "\ncontact dana.whitfield@example.com"), "REFUSE");
t("a phone number", forbiddenIdentifier(current + "\ncall 416-555-0134"), "REFUSE");
t("a phone number with spaces and brackets", forbiddenIdentifier(current + "\ncall (416) 555 0134"), "REFUSE");
t("a health-card number", forbiddenIdentifier(current + "\nOHIP 1234567890AB"), "REFUSE");
t("a phone number written 416.555.0134", forbiddenIdentifier(current + "\ncall 416.555.0134"), "REFUSE");
t("a phone number written +1 (416) 555-0134", forbiddenIdentifier(current + "\ncall +1 (416) 555-0134"), "REFUSE");

console.log("The date exemption is exactly that");
t("ISO dates alone do not trip the number rule", forbiddenIdentifier("CALENDAR: x (2026-09-01 to 2026-12-19)"), null);
t("a phone number still caught alongside dates",
  forbiddenIdentifier("CALENDAR: x (2026-09-01 to 2026-12-19) call 4165550134"), "REFUSE");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
