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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
