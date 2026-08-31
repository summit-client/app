/**
 * hasLoopGuard()/LOOP_GUARD_COOKIE in index.ts — the SHIPPED functions, not
 * copies. Regression guard for the 2026-08-31 redirect loop: a portal's
 * proxy.ts bouncing to apps/web's refresh endpoint and back, forever,
 * whenever the freshness read stays "stale" across the round trip. See
 * index.ts's own doc comment on LOOP_GUARD_COOKIE for the full story.
 *
 * Run: node tests/loop-guard.test.mjs
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const roots = ["../../../node_modules/.pnpm", "../../node_modules/.pnpm"];
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

const out = join("tests", ".tmp-proxy-auth.mjs");
await esbuild.build({
  entryPoints: ["index.ts"], bundle: true, outfile: out,
  format: "esm", platform: "neutral",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });

const { hasLoopGuard, LOOP_GUARD_COOKIE } = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

console.log("hasLoopGuard()");

t("no cookies at all -> false",
  hasLoopGuard([]) === false);

t("unrelated cookies only -> false",
  hasLoopGuard([{ name: "sb-xbkok-auth-token", value: "base64-abc" }]) === false);

t("the guard cookie present with value '1' -> true",
  hasLoopGuard([{ name: LOOP_GUARD_COOKIE, value: "1" }]) === true);

t("the guard cookie present among other cookies -> true",
  hasLoopGuard([
    { name: "sb-xbkok-auth-token", value: "base64-abc" },
    { name: LOOP_GUARD_COOKIE, value: "1" },
  ]) === true);

// A cookie can exist with an empty/garbage value if a browser is mid-expiry
// or something else wrote to the same name - only the exact expected value
// counts as "we already bounced through refresh", not just the cookie's
// mere presence.
t("the guard cookie present but with an unexpected value -> false",
  hasLoopGuard([{ name: LOOP_GUARD_COOKIE, value: "" }]) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
