/**
 * Tests the SHIPPED validator in value-types.ts, not a copy of its rules.
 *
 * setSetting() is the only write path for every setting in every portal and
 * has no CI cover; value-types.ts is deliberately dependency-free so this can
 * compile and exercise the real export with the workspace's own TypeScript.
 *
 * Run: node tests/value-types.test.mjs   (from packages/settings)
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

// TypeScript is not a dependency of this package and is not being made one.
// It arrives through the apps and lives in the workspace store, so it is
// located by glob rather than a pinned path - the same approach the esbuild
// suites in apps/employee and apps/scheduler use for esbuild.
function findTypeScript() {
  try { return require_("typescript"); } catch { /* not hoisted here */ }
  for (const root of ["../../node_modules/.pnpm", "../../../node_modules/.pnpm"]) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => /^typescript@/.test(d)).sort();
    for (const dir of dirs.reverse()) {
      const candidate = resolve(root, dir, "node_modules/typescript/lib/typescript.js");
      if (existsSync(candidate)) return require_(candidate);
    }
  }
  return null;
}

const ts = findTypeScript();
if (!ts) {
  console.error("FAIL: typescript not found in the workspace - run pnpm install at the repo root");
  process.exit(1);
}

const SUBJECT = resolve("value-types.ts");
if (!existsSync(SUBJECT)) {
  console.error(`FAIL: subject not found at ${SUBJECT} - run this from packages/settings`);
  process.exit(1);
}

const outDir = mkdtempSync(resolve("tests", ".build-"));
process.on("exit", () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { /* gone */ } });

const program = ts.createProgram([SUBJECT], {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, outDir, strict: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program).concat(program.emit().diagnostics);
if (diagnostics.length > 0) {
  for (const d of diagnostics) console.error("FAIL: " + ts.flattenDiagnosticMessageText(d.messageText, " "));
  process.exit(1);
}

const { settingValueProblem } = require_(join(outDir, "value-types.js"));

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};
const okFor = (def, v) => settingValueProblem(def, v) === null;
const rejects = (def, v) => typeof settingValueProblem(def, v) === "string";

console.log("clearing an override is always allowed");
{
  for (const type of ["toggle", "select", "text", "number", "color", "time"]) {
    t(`${type}: null clears`, okFor({ type }, null));
    t(`${type}: undefined clears`, okFor({ type }, undefined));
  }
}

console.log("toggle");
{
  const def = { type: "toggle" };
  t("true is fine", okFor(def, true));
  t("false is fine - not treated as absent", okFor(def, false));
  t('the string "true" is not a boolean', rejects(def, "true"));
  t("1 is not a boolean", rejects(def, 1));
}

console.log("number");
{
  const def = { type: "number", label: "Grid increment" };
  t("an integer is fine", okFor(def, 30));
  t("zero is fine", okFor(def, 0));
  t("a negative is fine - range is the setting's business, not the type's", okFor(def, -5));
  t("NaN is refused - what an empty number input used to send", rejects(def, NaN));
  t("Infinity is refused", rejects(def, Infinity));
  t('the string "30" is refused', rejects(def, "30"));
  t("the message names the setting", settingValueProblem(def, NaN).includes("Grid increment"));
}

console.log("select");
{
  const def = { type: "select", options: [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }] };
  t("a declared option is fine", okFor(def, "compact"));
  t("an off-menu value is refused", rejects(def, "spacious"));
  t("a value that only looks close is refused", rejects(def, "Compact"));
  t("with no options declared there is nothing to check against", okFor({ type: "select" }, "anything"));
}

console.log("color");
{
  const def = { type: "color", label: "Primary colour" };
  t("#rrggbb is fine", okFor(def, "#1b5a6e"));
  t("uppercase is fine", okFor(def, "#1B5A6E"));
  t("a partial value is refused - the per-keystroke case", rejects(def, "#1b5"));
  t("a bare # is refused", rejects(def, "#"));
  t("a named colour is refused - it would reach a CSS custom property as-is", rejects(def, "rebeccapurple"));
  t("a url() is refused", rejects(def, "url(https://example.test/x.png)"));
  t("a declaration breakout attempt is refused", rejects(def, "#fff; background: url(x)"));
  t("a number is refused", rejects(def, 0x1b5a6e));
}

console.log("time");
{
  const def = { type: "time" };
  t("HH:MM is fine", okFor(def, "09:30"));
  t("23:59 is fine", okFor(def, "23:59"));
  t('"" is fine - clearing a time input is a real state', okFor(def, ""));
  t("24:00 is refused", rejects(def, "24:00"));
  t("9:30 without the leading zero is refused", rejects(def, "9:30"));
  t("a sentence is refused", rejects(def, "half nine"));
}

console.log("text");
{
  const def = { type: "text" };
  t("a string is fine", okFor(def, "Learner"));
  t("an empty string is fine", okFor(def, ""));
  t("a number is refused", rejects(def, 7));
}

// Read out of the shipped index.ts: a validator nothing calls is no guard.
console.log("setSetting actually calls it");
{
  const src = readFileSync("index.ts", "utf8");
  t("index.ts imports the validator", /import \{ settingValueProblem \} from "\.\/value-types"/.test(src));
  const at = src.indexOf("settingValueProblem(def, value)");
  t("it is called inside setSetting", at > src.indexOf("export async function setSetting("));
  t("a problem throws rather than being logged",
    /const problem = settingValueProblem\(def, value\);\s*\n\s*if \(problem\) throw new Error\(problem\);/.test(src));
  t("it runs before the preview write", at < src.indexOf("if (IS_PREVIEW) {", at - 2000 > 0 ? src.indexOf("export async function setSetting(") : 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
