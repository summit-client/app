/**
 * The Troubleshoot / feature-request mailto — the SHIPPED SupportButton.tsx.
 *
 * The one part of this control that has to be exactly right: an address typo
 * or a broken encoding produces a compose window that looks fine and reaches
 * nobody, and the person believes they have reported something.
 *
 * Run: node tests/support.test.mjs
 */

import { unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Anchored to this file, not the working directory - see the note below. */
const PKG = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * esbuild is a declared root devDependency, so Node resolves it by walking up
 * from this file. It used to be hunted for down two RELATIVE paths
 * ("../../node_modules/.pnpm"), which resolve against the working directory
 * rather than this file — so running this suite from the repo root, which is
 * where CLAUDE.md's command list puts you, found nothing and printed SKIP.
 * A skip exits 0 and reads as a pass.
 *
 * If this ever throws, esbuild has been dropped from the root package.json.
 * Fix that rather than reaching for an explanation about the environment.
 */
const esbuild = await import("esbuild");

const out = join(PKG, "tests", ".tmp-support.mjs");
await esbuild.build({
  entryPoints: [join(PKG, "src", "SupportButton.tsx")], bundle: true, outfile: out,
  format: "esm", platform: "neutral", external: ["react"], jsx: "automatic",
});
process.on("exit", () => { try { unlinkSync(out); } catch { /* gone */ } });
const S = await import(pathToFileURL(out).href);

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

// The address is the only unencoded part of the URL, and the only part that
// comes from the database (the org-scoped support.devEmail setting, a free
// text value an admin types).
t("a plain configured address is used as given", (() => {
  const url = S.supportMailto({ ...base, to: "help@clinic.test" });
  return url.startsWith("mailto:help@clinic.test?");
})());
t("a bcc header smuggled into the address is refused", (() => {
  const url = S.supportMailto({ ...base, to: "help@clinic.test?bcc=someone@elsewhere.test&" });
  return url.startsWith(`mailto:${S.DEFAULT_SUPPORT_EMAIL}?`) && !url.includes("bcc=");
})());
t("a second recipient smuggled in with a comma is refused", (() => {
  const url = S.supportMailto({ ...base, to: "help@clinic.test,someone@elsewhere.test" });
  return url.startsWith(`mailto:${S.DEFAULT_SUPPORT_EMAIL}?`) && !url.includes("elsewhere");
})());
t("an ampersand in the address cannot start a new field", (() => {
  const url = S.supportMailto({ ...base, to: "a@b.test&cc=c@d.test" });
  return url.startsWith(`mailto:${S.DEFAULT_SUPPORT_EMAIL}?`);
})());
t("a percent-escape in the address is refused rather than decoded by the client", (() => {
  const url = S.supportMailto({ ...base, to: "a@b.test%3Fbcc=c@d.test" });
  return url.startsWith(`mailto:${S.DEFAULT_SUPPORT_EMAIL}?`);
})());
t("an empty or blank setting falls back to the real inbox",
  S.safeSupportAddress("") === S.DEFAULT_SUPPORT_EMAIL
  && S.safeSupportAddress("   ") === S.DEFAULT_SUPPORT_EMAIL
  && S.safeSupportAddress(null) === S.DEFAULT_SUPPORT_EMAIL);
t("a value that is not an address at all falls back",
  S.safeSupportAddress("not an address") === S.DEFAULT_SUPPORT_EMAIL);
t("surrounding whitespace is trimmed, not rejected",
  S.safeSupportAddress("  ops@clinic.test  ") === "ops@clinic.test");
t("the subject and body are still encoded after the address check", (() => {
  const url = S.supportMailto({ ...base, to: "help@clinic.test", detail: "a&b" });
  return decodeURIComponent(new URL(url).searchParams.get("body")).startsWith("a&b");
})());

console.log("a support report names the route, not the record that was open");
{
  // The address is a free-text org setting an admin types. A client id in the
  // body is a client id sent to whatever is in that field.
  t("a numeric id is masked", S.maskRoute("/clients/4192") === "/clients/:id");
  t("every id in a nested route is masked",
    S.maskRoute("/clients/4192/sessions/88") === "/clients/:id/sessions/:id");
  t("a uuid is masked",
    S.maskRoute("/clients/3f2504e0-4f89-11d3-9a0c-0305e82c3301") === "/clients/:id");
  t("a readable slug survives", S.maskRoute("/settings/workforce") === "/settings/workforce");
  t("a Pages Router template is left alone",
    S.maskRoute("/clients/[id]/sessions/[sessionId]") === "/clients/[id]/sessions/[sessionId]");
  t("an empty path stays empty", S.maskRoute("") === "");

  const body = decodeURIComponent(
    S.supportMailto({
      to: "help@clinic.test", brand: "B", kind: "Troubleshoot", detail: "d",
      moduleName: "m", pathname: "/clients/4192/sessions/88", when: "now",
    }),
  );
  t("the mailto body carries the masked route", body.includes("Page: /clients/:id/sessions/:id"));
  t("the mailto body carries no raw id", !/4192|\/88\b/.test(body));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
