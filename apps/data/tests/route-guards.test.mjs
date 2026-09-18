/**
 * Tests the SHIPPED route guards in lib/server/authz.ts, not copies of them.
 *
 * The Clinical Intelligence API routes under app/api/ have no CI cover, and
 * a test that restated their rules would keep passing against a stale copy.
 * So this compiles the real file with the workspace's own TypeScript,
 * exercises the real export against a stub Supabase builder, and then reads
 * the shipped route to confirm the guard is actually wired in ahead of the
 * write rather than merely existing.
 *
 * Run: node tests/route-guards.test.mjs   (from apps/data)
 */

import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
let ts;
try {
  ts = require_("typescript");
} catch {
  console.error("FAIL: typescript not resolvable - run pnpm install at the repo root");
  process.exit(1);
}

const SUBJECT = resolve("lib/server/authz.ts");
if (!existsSync(SUBJECT)) {
  console.error(`FAIL: subject not found at ${SUBJECT} - run this from apps/data`);
  process.exit(1);
}

// Emitted inside the app tree, not /tmp: the compiled file still requires
// @supabase/ssr, and only a location inside this package can resolve it.
// Same reason apps/employee's certificate suite bundles into tests/.
const outDir = mkdtempSync(resolve("tests", ".build-"));
process.on("exit", () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { /* gone */ } });

const program = ts.createProgram([SUBJECT], {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  outDir,
  strict: true,
  skipLibCheck: true,
  // The subject's only value import is @supabase/ssr; NextRequest is a type
  // import and erases. Resolving from the app tree keeps that require working.
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmitOnError: true,
});
const emitted = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics)
  // Ambient DOM/Next lib errors are the app tsconfig's business, not this
  // test's; a real error in the subject file is still fatal below.
  .filter((d) => d.file && resolve(d.file.fileName) === SUBJECT);
if (diagnostics.length > 0) {
  for (const d of diagnostics) console.error("FAIL: " + ts.flattenDiagnosticMessageText(d.messageText, " "));
  process.exit(1);
}

const authz = require_(join(outDir, "authz.js"));

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

// A stub that records the filters it was given and answers with whatever the
// test set up, so the assertions are about the guard's own behaviour.
function stubClient(result) {
  const calls = { table: null, filters: [] };
  const builder = {
    select: () => builder,
    eq: (col, val) => { calls.filters.push([col, val]); return builder; },
    maybeSingle: async () => result,
  };
  return { sb: { from: (table) => { calls.table = table; return builder; } }, calls };
}

console.log("requireClientInClinic");
{
  const { requireClientInClinic } = authz;
  {
    const { sb, calls } = stubClient({ data: { id: 7 }, error: null });
    const r = await requireClientInClinic(sb, 7, "clinic-a");
    t("a client in the caller's own clinic is allowed", r.ok === true);
    t("it looks the client up in `clients`", calls.table === "clients");
    t("it filters on BOTH the id and the caller's clinic",
      JSON.stringify(calls.filters) === JSON.stringify([["id", 7], ["clinic_id", "clinic-a"]]),
      JSON.stringify(calls.filters));
  }
  {
    const { sb } = stubClient({ data: null, error: null });
    const r = await requireClientInClinic(sb, 9999, "clinic-a");
    t("a client from another clinic is refused", r.ok === false);
    t("it is refused as 404, not 403 - no confirming that someone else's id exists",
      r.ok === false && r.status === 404);
    t("the message names the caseload, not a policy",
      r.ok === false && !/rls|policy|clinic_id/i.test(r.error), r.ok === false ? r.error : "");
  }
  {
    const { sb } = stubClient({ data: null, error: { message: "boom" } });
    const r = await requireClientInClinic(sb, 7, "clinic-a");
    t("a failed lookup fails closed, as a 500 rather than an allow",
      r.ok === false && r.status === 500);
  }
}

console.log("the planning route wires the guard in before it writes");
{
  const src = readFileSync("app/api/planning/route.ts", "utf8");
  t("the route calls the guard", src.includes("requireClientInClinic("));
  t("the guard runs before the clinical_decisions insert",
    src.indexOf("requireClientInClinic(") < src.indexOf('from("clinical_decisions")'));
  t("the guard runs before the evidence packet is built",
    src.indexOf("requireClientInClinic(") < src.indexOf("buildEvidencePacket("));
  t("a refused client returns instead of falling through",
    /requireClientInClinic\([\s\S]{0,160}?if \(!owns\.ok\) return/.test(src));
}

// A commit route that discards its insert result answers `committed: true`
// whatever the database did. Read out of the shipped routes so the rule
// cannot pass against a stale copy of it.
console.log("commit routes report what the write actually did");
for (const route of ["app/api/planning/route.ts", "app/api/decision-tree/route.ts"]) {
  const src = readFileSync(route, "utf8");
  t(`${route}: the insert result is captured, not discarded`,
    /const \{ error \} = await sb\.from\("clinical_decisions"\)\.insert\(/.test(src));
  {
    // Every insert in the file, not just the first: a second commit path
    // added later must capture its result too.
    const all = [...src.matchAll(/await sb\.from\("clinical_decisions"\)\.insert\(/g)].length;
    const captured = [...src.matchAll(/const \{ error \} = await sb\.from\("clinical_decisions"\)\.insert\(/g)].length;
    t(`${route}: no bare awaited insert is left`, all > 0 && all === captured, `${captured}/${all} captured`);
  }
  t(`${route}: a failed insert answers ok:false, not committed:true`,
    /if \(error\) \{[\s\S]{0,400}?ok: false[\s\S]{0,200}?status: 500/.test(src));
  t(`${route}: the failure is logged for the operator`,
    /if \(error\) \{[\s\S]{0,200}?console\.error\(/.test(src));
}

// The two callers have to read the answer, or the route's honesty is wasted.
console.log("commit callers check the response before showing success");
for (const [page, marker] of [
  ["app/clients/[id]/planning/page.tsx", "setCommitted("],
  ["app/clients/[id]/supervision/page.tsx", "setCommittedAs("],
]) {
  const src = readFileSync(page, "utf8");
  t(`${page}: the fetch response is read`, /const res = await fetch\("\/api\//.test(src));
  t(`${page}: it bails before marking success`,
    /if \(!res\.ok \|\| !data\?\.ok\) \{[\s\S]{0,240}?return;\n\s*\}[\s\S]{0,120}?/.test(src)
      && src.indexOf("if (!res.ok || !data?.ok)") < src.indexOf(marker));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
