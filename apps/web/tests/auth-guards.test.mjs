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

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

console.log("signOutRequestAllowed");
{
  const { signOutRequestAllowed } = guards;
  // Stands in for isKnownOrigin() + the same-origin check the route injects.
  // Compares parsed origins, as the real one does - a prefix match would call
  // summitclient.io.evil.example ours.
  const OURS = ["https://scheduler.summitclient.io", "https://summitclient.io"];
  const ours = (url) => {
    try { return OURS.includes(new URL(url).origin); } catch { return false; }
  };
  t("no Origin and no Referer is allowed - our own top-level <a href> sign-out",
    signOutRequestAllowed({}, ours) === true);
  t("null headers are treated as absent, not as a foreign origin",
    signOutRequestAllowed({ origin: null, referer: null }, ours) === true);
  t("one of our portals is allowed", signOutRequestAllowed({ origin: "https://scheduler.summitclient.io" }, ours) === true);
  t("a Referer from our own page is allowed",
    signOutRequestAllowed({ referer: "https://summitclient.io/dashboard" }, ours) === true);
  t("a foreign Origin is rejected", signOutRequestAllowed({ origin: "https://evil.example" }, ours) === false);
  t("a foreign Referer is rejected - the naive <img src> case",
    signOutRequestAllowed({ referer: "https://evil.example/page" }, ours) === false);
  t("Origin wins over Referer when both are present",
    signOutRequestAllowed({ origin: "https://evil.example", referer: "https://summitclient.io/" }, ours) === false);
  t("a lookalike host is not ours",
    signOutRequestAllowed({ origin: "https://summitclient.io.evil.example" }, ours) === false);
}

// Read out of the shipped route: the guard has to actually run before the
// session is ended, not merely exist.
console.log("the sign-out route wires the guard in before signOut()");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("pages/api/auth/signout.js", "utf8");
  t("the route calls the guard", src.includes("signOutRequestAllowed("));
  t("the guard runs before signOut()",
    src.indexOf("signOutRequestAllowed(") < src.indexOf("await supabase.auth.signOut()"));
  t("a rejected request returns without ending the session",
    /signOutRequestAllowed\([\s\S]{0,200}?\{[\s\S]{0,200}?return\n?\s*\}/.test(src));
}

console.log("sameSiteRequestAllowed");
{
  const { sameSiteRequestAllowed } = guards;
  const OURS = ["https://summitclient.io", "https://scheduler.summitclient.io"];
  const ours = (url) => { try { return OURS.includes(new URL(url).origin); } catch { return false; } };
  t("our own origin is allowed", sameSiteRequestAllowed({ origin: "https://summitclient.io" }, ours) === true);
  t("a foreign origin is rejected", sameSiteRequestAllowed({ origin: "https://evil.example" }, ours) === false);
  t("unlike the sign-out guard, a request with NO headers is rejected - a browser always sends Origin on a POST",
    sameSiteRequestAllowed({}, ours) === false);
  t("a Referer alone is accepted when it is ours",
    sameSiteRequestAllowed({ referer: "https://summitclient.io/update-password" }, ours) === true);
  t("Origin wins over Referer",
    sameSiteRequestAllowed({ origin: "https://evil.example", referer: "https://summitclient.io/" }, ours) === false);
}

console.log("passwordProblem");
{
  const { passwordProblem, MIN_PASSWORD_LENGTH } = guards;
  t("a long enough password is accepted", passwordProblem("correct horse battery") === null);
  t("exactly the minimum is accepted", passwordProblem("a".repeat(MIN_PASSWORD_LENGTH)) === null);
  t("one under the minimum is refused", passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1)) !== null);
  t("a one-character password is refused - what a direct call could set", passwordProblem("x") !== null);
  t("an empty password is refused", passwordProblem("") !== null);
  t("a non-string is refused", passwordProblem(12345678) !== null && passwordProblem(undefined) !== null);
  t("the minimum matches the page's own rule", MIN_PASSWORD_LENGTH === 8);
}

console.log("the password route enforces all three checks before writing");
{
  const src = readFileSync("pages/api/auth/update-password.js", "utf8");
  const write = src.indexOf("auth.updateUser(");
  t("it requires JSON", src.includes("application/json") && src.indexOf("application/json") < write);
  t("it checks the claimed origin", src.includes("sameSiteRequestAllowed(") && src.indexOf("sameSiteRequestAllowed(") < write);
  t("it checks the password server-side", src.includes("passwordProblem(") && src.indexOf("passwordProblem(") < write);
  t("the raw Supabase message is no longer returned to the browser",
    !/error: error\.message/.test(src) && src.includes("console.error("));
  // The page's own rule and the server's must not drift apart.
  const page = readFileSync("pages/update-password.jsx", "utf8");
  t("the page still states the same minimum", /MIN_PASSWORD_LENGTH = 8/.test(page));
}

console.log("safeRedirect keeps a post-authentication redirect on our own ground");
{
  const { safeRedirect } = guards;
  // The confirm route has already set a session cookie by the time this runs,
  // so anything that escapes here is an authenticated browser handed to
  // somebody else.
  const ours = (u) => u.startsWith("https://scheduler.summitclient.io");

  t("an ordinary relative path is kept", safeRedirect("/update-password", ours) === "/update-password");
  t("a relative path with a query is kept", safeRedirect("/login?error=x", ours) === "/login?error=x");
  t("one of our own portals is kept",
    safeRedirect("https://scheduler.summitclient.io/x", ours) === "https://scheduler.summitclient.io/x");

  t("protocol-relative is refused", safeRedirect("//evil.example", ours) === null);
  // The backslash forms: browsers normalise \ to /, so each of these reaches
  // evil.example while passing a naive startsWith("//") check.
  t("a backslash authority is refused", safeRedirect("/\\evil.example", ours) === null);
  t("slash-backslash is refused", safeRedirect("/\\/evil.example", ours) === null);
  t("backslash-slash is refused", safeRedirect("/\\\\evil.example", ours) === null);

  t("an absolute URL elsewhere is refused", safeRedirect("https://evil.example", ours) === null);
  t("a non-string is refused", safeRedirect(undefined, ours) === null);
  t("an empty string is refused", safeRedirect("", ours) === null);

  // The route must use the guard rather than keeping its own copy.
  const confirm = readFileSync("pages/api/auth/confirm.js", "utf8");
  t("confirm.js imports the shared guard", /import\s*\{[^}]*safeRedirect[^}]*\}\s*from\s*["'][^"']*auth-guards["']/.test(confirm));
  t("confirm.js no longer defines its own", !/function\s+safeRedirect/.test(confirm));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
