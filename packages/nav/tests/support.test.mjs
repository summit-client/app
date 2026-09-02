/**
 * The Troubleshoot / feature-request mailto — the SHIPPED SupportButton.tsx.
 *
 * The one part of this control that has to be exactly right: an address typo
 * or a broken encoding produces a compose window that looks fine and reaches
 * nobody, and the person believes they have reported something.
 *
 * Run: node tests/support.test.mjs
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

const out = join("tests", ".tmp-support.mjs");
await esbuild.build({
  entryPoints: ["src/SupportButton.tsx"], bundle: true, outfile: out,
  format: "esm", platform: "neutral", external: ["react"], jsx: "automatic",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const S = await import(pathToFileURL(resolve(out)).href);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

const base = {
  to: "info@summitclient.io", brand: "Mount Etna HR", kind: "Troubleshoot",
  detail: "The progress page is blank", moduleName: "apps/client",
  pathname: "/progress", when: "2026-09-01T10:00:00.000Z",
};

console.log("The address");
t("the default is a real inbox, not a placeholder",
  S.DEFAULT_SUPPORT_EMAIL === "info@summitclient.io");
t("reports are addressed to the given inbox",
  S.supportMailto(base).startsWith("mailto:info@summitclient.io?"));

console.log("\nThe subject");
t("names the product and the kind", (() => {
  const url = S.supportMailto(base);
  const subject = decodeURIComponent(new URL(url).searchParams.get("subject"));
  return subject === "[Mount Etna HR] Troubleshoot";
})());
t("a feature request says so", (() => {
  const url = S.supportMailto({ ...base, kind: "Feature request" });
  return decodeURIComponent(new URL(url).searchParams.get("subject")).endsWith("Feature request");
})());

console.log("\nThe body carries enough to act on");
const body = decodeURIComponent(new URL(S.supportMailto(base)).searchParams.get("body"));
t("starts with what the person wrote", body.startsWith("The progress page is blank"));
t("names the page", body.includes("Page: /progress"));
t("names the module, so a report lands with the right code",
  body.includes("Module: apps/client"));
t("carries a timestamp", body.includes("When: 2026-09-01T10:00:00.000Z"));
t("an unknown path says so rather than leaving the line blank",
  decodeURIComponent(new URL(S.supportMailto({ ...base, pathname: "" })).searchParams.get("body"))
    .includes("Page: unknown"));

console.log("\nEncoding");
t("an ampersand in the report does not truncate the body", (() => {
  const url = S.supportMailto({ ...base, detail: "Broke on save & reload" });
  const b = decodeURIComponent(new URL(url).searchParams.get("body"));
  return b.startsWith("Broke on save & reload");
})());
t("a hash does not cut the URL short", (() => {
  const url = S.supportMailto({ ...base, detail: "See #4 on the list" });
  return decodeURIComponent(new URL(url).searchParams.get("body")).includes("#4");
})());
t("newlines survive", (() => {
  const b = decodeURIComponent(new URL(S.supportMailto({ ...base, detail: "one\ntwo" })).searchParams.get("body"));
  return b.startsWith("one\ntwo");
})());
t("a quote or accent does not break the subject", (() => {
  const url = S.supportMailto({ ...base, brand: "Château d'Or & Co" });
  return decodeURIComponent(new URL(url).searchParams.get("subject")) === "[Château d'Or & Co] Troubleshoot";
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
