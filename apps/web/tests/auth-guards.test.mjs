/**
 * Tests the SHIPPED guards in lib/auth-guards.ts, not copies of them.
 *
 * The auth endpoints under pages/api/auth/ have no CI cover at all, and a
 * test that restates their rules would keep passing against a stale copy.
 * So this compiles the real file with the workspace's own TypeScript and
 * exercises the real exports.
 *
 * TypeScript is a devDependency of this app, so it is here whenever
 * `pnpm install` has run; if it somehow is not, this exits non-zero rather
 * than printing a pass it did not earn.
 *
 * Run: node tests/auth-guards.test.mjs
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
let ts;
try {
  ts = require_("typescript");
} catch {
  console.error("FAIL: typescript not resolvable - run pnpm install at the repo root");
  process.exit(1);
}

const SUBJECT = resolve("lib/auth-guards.ts");
if (!existsSync(SUBJECT)) {
  console.error(`FAIL: subject not found at ${SUBJECT} - run this from apps/web`);
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), "summit-web-guards-"));
process.on("exit", () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { /* gone */ } });

const program = ts.createProgram([SUBJECT], {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  outDir,
  strict: true,
});
const emitted = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
if (diagnostics.length > 0) {
  for (const d of diagnostics) {
    console.error("FAIL: " + ts.flattenDiagnosticMessageText(d.messageText, " "));
  }
  process.exit(1);
}

const guards = require_(join(outDir, "auth-guards.js"));

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("mergeSetCookie");
{
  const { mergeSetCookie } = guards;
  t("no existing header: the batch is the header",
    same(mergeSetCookie(undefined, ["a=1", "b=2"]), ["a=1", "b=2"]));
  t("a single existing string is kept, not replaced",
    same(mergeSetCookie("old=1", ["new=2"]), ["old=1", "new=2"]));
  t("an existing array is kept in order, new entries appended",
    same(mergeSetCookie(["o1=1", "o2=2"], ["n=3"]), ["o1=1", "o2=2", "n=3"]));
  t("the removal batch survives an earlier refresh batch - the sign-out case",
    same(
      mergeSetCookie(
        ["sb-ref-auth-token.0=aaa", "sb-ref-auth-token.1=bbb"],
        ["sb-ref-auth-token.0=; Max-Age=0", "sb-ref-auth-token.1=; Max-Age=0"]
      ),
      [
        "sb-ref-auth-token.0=aaa",
        "sb-ref-auth-token.1=bbb",
        "sb-ref-auth-token.0=; Max-Age=0",
        "sb-ref-auth-token.1=; Max-Age=0",
      ]
    ));
  t("the later entry for a repeated name comes last, so the browser applies it",
    mergeSetCookie(["x=old"], ["x=new; Max-Age=0"]).at(-1) === "x=new; Max-Age=0");
  t("an empty new batch still preserves what was queued",
    same(mergeSetCookie(["keep=1"], []), ["keep=1"]));
}

console.log("redirectErrorMessage");
{
  const { redirectErrorMessage, GENERIC_REDIRECT_ERROR } = guards;
  t("no value: no alert at all", redirectErrorMessage(undefined) === "" && redirectErrorMessage("") === "");
  t("missing_token keeps its existing copy",
    redirectErrorMessage("missing_token") === "That link is missing required information. Please request a new one.");
  t("link_invalid keeps the copy the callback used to send as a sentence",
    redirectErrorMessage("link_invalid") === "That link is no longer valid. Please request a new one.");
  t("pending_activation keeps the copy the callback used to send as a sentence",
    redirectErrorMessage("pending_activation") === "Your account is pending activation. Contact your administrator.");
  t("an attacker-chosen sentence is never echoed back",
    redirectErrorMessage("Your account was locked. Call 555-0100 to restore it.") === GENERIC_REDIRECT_ERROR);
  t("a raw Supabase message is not echoed back either",
    redirectErrorMessage("Token has expired or is invalid") === GENERIC_REDIRECT_ERROR);
  t("an unknown code is generic, not blank",
    redirectErrorMessage("some_future_code") === GENERIC_REDIRECT_ERROR && GENERIC_REDIRECT_ERROR.length > 0);
}

// Every code this app can redirect with must be one the page has copy for -
// read out of the shipped pages, so adding a producer without adding copy
// fails here rather than showing the generic line in production.
console.log("every shipped ?error= producer sends a known code");
{
  const { redirectErrorMessage, GENERIC_REDIRECT_ERROR } = guards;
  const { readFileSync } = await import("node:fs");
  const sources = ["pages/api/auth/confirm.js", "pages/auth/callback.jsx"];
  const codes = new Set();
  for (const f of sources) {
    for (const m of readFileSync(f, "utf8").matchAll(/['"]\/login\?error=([a-z_]+)['"]/g)) codes.add(m[1]);
  }
  t("found the producers at all", codes.size >= 2, [...codes].join(","));
  for (const code of codes) {
    t(`${code} has copy`, redirectErrorMessage(code) !== GENERIC_REDIRECT_ERROR);
  }
  const concatenated = sources.map((f) => readFileSync(f, "utf8")).join("\n");
  t("no producer still interpolates a message into ?error=",
    !/\/login\?error=['"]\s*\+/.test(concatenated));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
