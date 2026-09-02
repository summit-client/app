/**
 * Record visibility - the wording and the states a supervisor reads.
 *
 * The database is what enforces any of this (0069, covered in supabase/tests).
 * What is tested here is the half that has no error state: a supervisor who
 * picks the wrong option sees nothing go wrong, so the labels have to be right.
 */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Same harness as tests/messaging.test.mjs: esbuild is resolved out of the
// pnpm store and the bundle imported by file URL. A bare `import * as esbuild`
// plus a relative import of the output does not resolve here.
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

const bundlePath = join("tests", ".tmp-visibility.mjs");
await esbuild.build({
  entryPoints: ["lib/visibility.ts"], bundle: true, outfile: bundlePath,
  // lib/visibility.ts imports @supabase/ssr, which esbuild cannot resolve under
  // platform:"neutral". The dependency is not what this suite tests.
  format: "esm", platform: "neutral", external: ["@supabase/ssr"],
});
process.on("exit", () => { try { unlinkSync(bundlePath); } catch { /* gone */ } });
const V = await import(pathToFileURL(resolve(bundlePath)).href);

const out = [];
let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; out.push(`ok    ${name}`); }
  else { fail++; out.push(`FAIL  ${name}`); }
};

const rec = (over = {}) => ({
  recordType: "client_document", recordId: "r-1", clientId: 1, clientName: "Maya",
  label: "A document", visibility: "family", setBy: null, setByName: null,
  setAt: null, namedGuardians: 0, ...over,
});

console.log("The three choices");
t("there are exactly three, matching the database's check constraint",
  V.VISIBILITY_OPTIONS.length === 3);
t("every option the constraint allows has a label",
  ["internal", "family", "specific"].every((v) => V.VISIBILITY_OPTIONS.some((o) => o.value === v)));
t("no label names the internal state instead of the consequence",
  // "Internal" says how it is filed. "Clinic only" says who reads it, which is
  // what is being decided.
  V.VISIBILITY_OPTIONS.every((o) => o.label.toLowerCase() !== o.value));

console.log("\nThe summary line");
t("clinic-only says so", V.visibilitySummary(rec({ visibility: "internal" })) === "Clinic only");
t("whole-family says so",
  V.visibilitySummary(rec({ visibility: "family" })) === "Everyone on the family record");
t("named guardians are counted",
  V.visibilitySummary(rec({ visibility: "specific", namedGuardians: 2 })) === "2 named guardians");
t("one guardian is not '1 named guardians'",
  V.visibilitySummary(rec({ visibility: "specific", namedGuardians: 1 })) === "One named guardian");

t("'named nobody' reads as invisible, not as shared", (() => {
  // Reachable in one click - choose "only the people I name", name nobody -
  // and in a list that prints only the label it looks identical to sharing.
  // It is the opposite: no family member can see it.
  const s = V.visibilitySummary(rec({ visibility: "specific", namedGuardians: 0 }));
  return /nobody/i.test(s);
})());

t("and it is flagged as needing attention",
  V.needsAttention(rec({ visibility: "specific", namedGuardians: 0 })) === true);
t("a finished choice is not flagged",
  V.needsAttention(rec({ visibility: "specific", namedGuardians: 1 })) === false
  && V.needsAttention(rec({ visibility: "internal" })) === false
  && V.needsAttention(rec({ visibility: "family" })) === false);

console.log("\nThe permission a record's surface is read through");
t("a document is governed by view_shared_documents",
  V.permissionFor("client_document") === "view_shared_documents");
t("a milestone and a note are governed by view_clinical_progress",
  V.permissionFor("family_milestone") === "view_clinical_progress"
  && V.permissionFor("session_note") === "view_clinical_progress");

console.log(`\n${pass} passed, ${fail} failed`);
console.log(out.join("\n"));
process.exit(fail ? 1 : 0);
