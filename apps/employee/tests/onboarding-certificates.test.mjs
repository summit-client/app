/**
 * Tests the SHIPPED functions, not copies of them.
 *
 * qa.mjs re-implements its subjects ("pure-logic copies of the shipped
 * functions"), so it cannot catch drift between the copy and the real thing.
 * This bundles lib/hub.ts with esbuild and exercises the actual exports.
 *
 * Run: node tests/onboarding-certificates.test.mjs
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// esbuild is not a dependency of this app - it arrives through next and lives
// in the workspace store, so a test can use it without touching package.json.
// Located by glob rather than a pinned version path, which would rot.
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

// Written into the app tree, not a data: URL or /tmp: the bundle still imports
// @supabase/ssr, and only a file inside this package can resolve it.
const temps = [];
const bundleOf = async (entry, name) => {
  const out = join("tests", name);
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: out, format: "esm", platform: "neutral",
    define: { "process.env.NEXT_PUBLIC_DEV_PREVIEW": '"1"' },
    external: ["@supabase/ssr", "react"],
  });
  temps.push(out);
  return pathToFileURL(resolve(out)).href;
};
const cleanup = () => temps.forEach((f) => { try { unlinkSync(f); } catch { /* already gone */ } });
process.on("exit", cleanup);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

// minimal browser surface the module expects
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
globalThis.window = globalThis;
process.env.NEXT_PUBLIC_DEV_PREVIEW = "1";

const { HUB_TASKS } = await import(await bundleOf("lib/content.ts", ".tmp-content.mjs"));
const mod = await import(await bundleOf("lib/hub.ts", ".tmp-hub.mjs"));

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clinicId: "00000000-0000-4000-8000-0000000000c1",
  appRole: "admin", role: "ADMIN", fullName: "Test", supervisorId: null,
  problem: null, isPreview: true,
};

async function fresh() {
  storage.clear();
  await mod.loadHub(session);
}

const required = (week) => HUB_TASKS.filter((x) => x.week === week && x.required !== false);

console.log("Onboarding certificate queue");

await fresh();
t("nothing is earned on a blank slate", mod.pendingOnboardingCertificates().length === 0);

// Complete every required Week 1 task. Course-linked ones must go through
// training, exactly as the UI forces.
await fresh();
for (const task of required(1)) {
  if (task.courseKey) await mod.setCourseStatus(task.courseKey, "COMPLETED");
  else await mod.updateTask(task.key, { status: "COMPLETED" });
}
const afterW1 = mod.pendingOnboardingCertificates().map((c) => c.title);
t("Week 1 complete earns the Phase 1 certificate",
  afterW1.includes("Onboarding Phase 1: Week 1"), JSON.stringify(afterW1));

// This is the regression. weekComplete() read RAW progress, and 12 of Week 1's
// 36 required tasks are course-linked - they derive from training and never
// appear as COMPLETED in raw progress. So Week 1 could never complete.
const rawOnly = mod.getProgress();
t("the raw store really does lack the course-linked rows",
  required(1).filter((x) => x.courseKey)
    .every((x) => !rawOnly.some((r) => r.taskKey === x.key && r.status === "COMPLETED")),
  "if this fails the regression is not what we think");

await fresh();
for (const task of [...required(1), ...required(2)]) {
  if (task.courseKey) await mod.setCourseStatus(task.courseKey, "COMPLETED");
  else await mod.updateTask(task.key, { status: "COMPLETED" });
}
const all = mod.pendingOnboardingCertificates().map((c) => c.title);
t("Week 2 complete earns the Phase 2 certificate", all.includes("Onboarding Phase 2: Week 2"), JSON.stringify(all));
t("full completion earns the Module 00 certificate", all.includes("New Team Member Onboarding"), JSON.stringify(all));

// Issued certificates leave the queue.
const before = mod.pendingOnboardingCertificates().length;
await mod.issueOnboardingCertificate("New Team Member Onboarding", "MODULE # 00");
const after = mod.pendingOnboardingCertificates().length;
t("issuing one removes it from the queue", after === before - 1, `${before} -> ${after}`);
t("issued certificate carries a registry number",
  /SUMMIT-\d{4}-\d{6}/.test(mod.getCertificates()[0]?.certNumber ?? ""),
  mod.getCertificates()[0]?.certNumber);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
