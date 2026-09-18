/**
 * Tests the SHIPPED resolveProvider() in provider.ts, not a copy of its rules.
 *
 * This is the routing decision that keeps identifiable clinical data away from
 * an unapproved processor, and it has no CI cover at all. resolveProvider takes
 * its environment as a parameter, so the real function can be exercised
 * directly once the file is compiled.
 *
 * TypeScript is not a dependency of this package and is not being made one; it
 * is located in the workspace store, the way the esbuild suites locate esbuild.
 *
 * Run: node tests/provider.test.mjs   (from packages/clinical-ai)
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
function findTypeScript() {
  for (const root of ["../../node_modules/.pnpm", "../../../node_modules/.pnpm"]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => /^typescript@/.test(d)).sort().reverse()) {
      const c = resolve(root, dir, "node_modules/typescript/lib/typescript.js");
      if (existsSync(c)) return require_(c);
    }
  }
  try { return require_("typescript"); } catch { return null; }
}
const ts = findTypeScript();
if (!ts) { console.error("FAIL: typescript not found - run pnpm install at the repo root"); process.exit(1); }

const REPO = resolve("../..");
const SUBJECT = resolve("provider.ts");
const outDir = mkdtempSync(resolve("tests", ".build-"));
process.on("exit", () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { /* gone */ } });

const program = ts.createProgram([SUBJECT], {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  outDir, rootDir: REPO, esModuleInterop: true, skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  // @types/node is not installed for this package (it has no build step and
  // no dev dependencies); it is hoisted into the apps, so point typeRoots
  // there rather than adding a dependency.
  types: ["node"],
  typeRoots: [resolve(REPO, "apps/employee/node_modules/@types"), resolve(REPO, "node_modules/@types")],
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
});
const emitted = program.emit();
const fatal = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics)
  .filter((d) => d.category === ts.DiagnosticCategory.Error && d.file);
if (fatal.length) {
  for (const d of fatal.slice(0, 6)) {
    console.error("TSC:", d.file.fileName.replace(REPO + "/", ""), ts.flattenDiagnosticMessageText(d.messageText, " "));
  }
  process.exit(1);
}
const { resolveProvider } = require_(join(outDir, relative(REPO, SUBJECT).replace(/\.ts$/, ".js")));

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};
const nameOf = (req, env) => {
  try { return resolveProvider(req, env).constructor.name; }
  // Matched by name: the error class is re-exported from types.ts, and the
  // point of the assertion is which decision was taken, not which module
  // declared the class.
  catch (e) { return e?.constructor?.name === "ClinicalAIUnavailableError" ? "REFUSED" : `THREW:${e?.constructor?.name}`; }
};

const AZURE = {
  CLINICAL_AI_ENABLED: "true", CLINICAL_AI_PROVIDER: "azure",
  AZURE_OPENAI_ENDPOINT: "https://example.test", AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_DEPLOYMENT: "d",
  CLINICAL_AI_ALLOW_PHI: "true",
};
const ANTHROPIC = { ...AZURE, CLINICAL_AI_PROVIDER: "anthropic", CLINICAL_AI_ANTHROPIC_KEY: "k" };
const PHI = { task: "treatment_planning", containsPhi: true };
const NON_PHI = { task: "treatment_planning", containsPhi: false };

console.log("the preview flag is double-gated");
{
  t("preview + development routes to the mock",
    nameOf(PHI, { ...AZURE, NEXT_PUBLIC_DEV_PREVIEW: "1", NODE_ENV: "development" }) === "MockProvider");
  t("preview flag in PRODUCTION does NOT route to the mock - a stray NEXT_PUBLIC_ flag must not fabricate clinical output",
    nameOf(PHI, { ...AZURE, NEXT_PUBLIC_DEV_PREVIEW: "1", NODE_ENV: "production" }) !== "MockProvider");
  t("with NODE_ENV unset the flag still works, for a plain `node` run",
    nameOf(PHI, { ...AZURE, NEXT_PUBLIC_DEV_PREVIEW: "1" }) === "MockProvider");
  t("a server-side provider=mock is honoured even in production - it is a deliberate configuration, not a browser flag",
    nameOf(PHI, { ...AZURE, CLINICAL_AI_PROVIDER: "mock", NODE_ENV: "production" }) === "MockProvider");
}

console.log("PHI routing");
{
  t("PHI goes to Azure by default", nameOf(PHI, { ...AZURE, NODE_ENV: "production" }) === "AzureOpenAIProvider");
  t("PHI is refused when the environment does not allow identifiable data",
    nameOf(PHI, { ...AZURE, CLINICAL_AI_ALLOW_PHI: "false", NODE_ENV: "production" }) === "REFUSED");
  t("PHI is refused on Anthropic without the explicit approval flag",
    nameOf(PHI, { ...ANTHROPIC, NODE_ENV: "production" }) === "REFUSED");
  t("PHI reaches Anthropic only with AI_ANTHROPIC_PHI_APPROVED=true",
    nameOf(PHI, { ...ANTHROPIC, AI_ANTHROPIC_PHI_APPROVED: "true", NODE_ENV: "production" }) === "AnthropicProvider");
  t("non-PHI may use the configured Anthropic provider",
    nameOf(NON_PHI, { ...ANTHROPIC, NODE_ENV: "production" }) === "AnthropicProvider");
  t("a disabled environment refuses everything",
    nameOf(PHI, { ...AZURE, CLINICAL_AI_ENABLED: "false" }) === "REFUSED");
}

// containsPhi is asserted by the caller and never checked here. The routing
// above is only as good as that assertion, so the callers are read too.
console.log("callers declare containsPhi honestly");
{
  const dataApi = resolve(REPO, "apps/data/app/api");
  const routes = readdirSync(dataApi, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? [d.name] : []))
    .flatMap((n) => (existsSync(join(dataApi, n, "route.ts")) ? [join(dataApi, n, "route.ts")]
      : readdirSync(join(dataApi, n), { withFileTypes: true })
        .flatMap((s) => (s.isDirectory() && existsSync(join(dataApi, n, s.name, "route.ts"))
          ? [join(dataApi, n, s.name, "route.ts")] : []))));
  const callers = routes.filter((r) => readFileSync(r, "utf8").includes("resolveProvider("));
  t("found the clinical routes", callers.length >= 4, String(callers.length));
  for (const route of callers) {
    const src = readFileSync(route, "utf8");
    const rel = relative(REPO, route);
    t(`${rel}: does not hardcode containsPhi:false`, !/containsPhi:\s*false/.test(src),
      /containsPhi:[^,}]*/.exec(src)?.[0] ?? "");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
