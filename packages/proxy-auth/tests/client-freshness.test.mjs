/**
 * clientSessionFreshness() in ../client.ts — the SHIPPED function, not a
 * copy. Verifies it agrees with sessionFreshness() (../index.ts) on
 * identical session data, since the two must reach the same "missing" /
 * "fresh" / "stale" verdict from the same underlying cookie for the
 * cross-portal race this package exists to prevent to actually be closed on
 * both the server (proxy.ts) and client (apps/data/lib/data.ts) sides.
 *
 * This sandbox has no live Supabase project, so this cannot reproduce the
 * actual race end-to-end - what it can and does verify is that the new
 * client-side reader decodes the same cookie shape @supabase/ssr's browser
 * client actually writes (chunked, base64url-encoded, JSON session) into
 * the same three outcomes, on the same 90-second margin, as the already-
 * shipped server-side reader.
 *
 * Run: node tests/client-freshness.test.mjs
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

const outClient = join("tests", ".tmp-proxy-auth-client.mjs");
const outIndex = join("tests", ".tmp-proxy-auth-index.mjs");
await esbuild.build({
  entryPoints: ["client.ts"], bundle: true, outfile: outClient,
  format: "esm", platform: "neutral",
});
await esbuild.build({
  entryPoints: ["index.ts"], bundle: true, outfile: outIndex,
  format: "esm", platform: "node", // index.ts's sessionFreshness() is server-only; bundle for node, not neutral
});
process.on("exit", () => {
  for (const f of [outClient, outIndex]) { try { unlinkSync(f); } catch { /* gone */ } }
});

const { clientSessionFreshness } = await import(pathToFileURL(resolve(outClient)).href);
const { sessionFreshness } = await import(pathToFileURL(resolve(outIndex)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const SUPABASE_URL = "https://xbkokexample.supabase.co";
const COOKIE_NAME = "sb-xbkokexample-auth-token"; // storageKeyFor(SUPABASE_URL)

// Same base64url encoding @supabase/ssr's browser storage writes: the
// `base64-` prefix followed by base64url(JSON.stringify(session)). Built by
// hand here (not by importing stringToBase64URL) so the test is an
// independent check of the shipped decode path, not a round-trip through
// the same encoder.
function toBase64Url(str) {
  return Buffer.from(str, "utf8").toString("base64url");
}
function cookieValueFor(session) {
  return "base64-" + toBase64Url(JSON.stringify(session));
}

function futureSession(secondsFromNow) {
  return { access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + secondsFromNow };
}

console.log("clientSessionFreshness() vs sessionFreshness() - same input, same verdict");

// -- missing: no cookie at all --------------------------------------------
{
  const clientResult = await clientSessionFreshness(SUPABASE_URL, "");
  const serverResult = await sessionFreshness([], SUPABASE_URL);
  t("no cookie -> both 'missing'", clientResult === "missing" && serverResult === "missing",
    `client=${clientResult} server=${serverResult}`);
}

// -- missing: cookie present but not valid session JSON --------------------
{
  const cookieString = `${COOKIE_NAME}=not-a-valid-session`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  const serverResult = await sessionFreshness(
    [{ name: COOKIE_NAME, value: "not-a-valid-session" }], SUPABASE_URL,
  );
  t("garbage cookie value -> both 'missing'", clientResult === "missing" && serverResult === "missing",
    `client=${clientResult} server=${serverResult}`);
}

// -- fresh: well within the 90s margin --------------------------------------
{
  const session = futureSession(3600); // an hour out
  const value = cookieValueFor(session);
  const cookieString = `${COOKIE_NAME}=${encodeURIComponent(value)}`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  const serverResult = await sessionFreshness([{ name: COOKIE_NAME, value }], SUPABASE_URL);
  t("expires in 1h -> both 'fresh'", clientResult === "fresh" && serverResult === "fresh",
    `client=${clientResult} server=${serverResult}`);
}

// -- stale: inside the 90s margin -------------------------------------------
{
  const session = futureSession(30); // 30s out, inside the 90s margin
  const value = cookieValueFor(session);
  const cookieString = `${COOKIE_NAME}=${encodeURIComponent(value)}`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  const serverResult = await sessionFreshness([{ name: COOKIE_NAME, value }], SUPABASE_URL);
  t("expires in 30s -> both 'stale'", clientResult === "stale" && serverResult === "stale",
    `client=${clientResult} server=${serverResult}`);
}

// -- stale: already expired --------------------------------------------------
{
  const session = futureSession(-60); // expired a minute ago
  const value = cookieValueFor(session);
  const cookieString = `${COOKIE_NAME}=${encodeURIComponent(value)}`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  const serverResult = await sessionFreshness([{ name: COOKIE_NAME, value }], SUPABASE_URL);
  t("already expired -> both 'stale'", clientResult === "stale" && serverResult === "stale",
    `client=${clientResult} server=${serverResult}`);
}

// -- chunked cookie (large session split across cookie.0/.1) ----------------
{
  const session = futureSession(3600);
  const value = cookieValueFor(session);
  const mid = Math.ceil(value.length / 2);
  const cookieString =
    `${COOKIE_NAME}.0=${encodeURIComponent(value.slice(0, mid))}; ` +
    `${COOKIE_NAME}.1=${encodeURIComponent(value.slice(mid))}`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  const serverResult = await sessionFreshness(
    [
      { name: `${COOKIE_NAME}.0`, value: value.slice(0, mid) },
      { name: `${COOKIE_NAME}.1`, value: value.slice(mid) },
    ],
    SUPABASE_URL,
  );
  t("chunked cookie reassembles -> both 'fresh'", clientResult === "fresh" && serverResult === "fresh",
    `client=${clientResult} server=${serverResult}`);
}

// -- unrelated cookies alongside the real one are ignored --------------------
{
  const session = futureSession(3600);
  const value = cookieValueFor(session);
  const cookieString = `other=1; ${COOKIE_NAME}=${encodeURIComponent(value)}; sf-refresh-loop-guard=1`;
  const clientResult = await clientSessionFreshness(SUPABASE_URL, cookieString);
  t("unrelated cookies don't interfere -> 'fresh'", clientResult === "fresh", `got ${clientResult}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
