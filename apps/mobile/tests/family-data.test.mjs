/**
 * The phone's family reads, checked against the rules they exist for.
 *
 * Nothing in CI builds or runs apps/mobile, so these read the rules out of
 * src/lib/family-data.ts itself rather than restating them — a test that
 * asserted "we use my_care_team" while the source had gone back to a staff
 * join would pass against a stale copy and tell us nothing.
 *
 * Each rule below is here because breaking it fails SILENTLY: RLS answers a
 * refused read with an empty set, so a wrong query looks exactly like a child
 * with nothing scheduled.
 */
import { build } from "esbuild";
import { readFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(APP, "src", "lib", "family-data.ts"), "utf8");
/** Comments explain these rules; only code may satisfy them. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => (ok ? passed++ : failures.push(`${name}${detail ? `\n    ${detail}` : ""}`));

/* 1. No embedded joins a guardian cannot read.
      `staff` admits no guardian under any policy; `locations` and
      `session_types` need auth_role() in (scheduler|client|clinician), which a
      parent with no profiles row does not have. An embedded join returns null,
      not an error, so the screen would just say a session has no clinician. */
for (const table of ["staff", "locations", "session_types"]) {
  check(
    `no embedded ${table}(...) join`,
    !new RegExp(`${table}\\s*\\(`).test(code),
    `found "${table}(" in family-data.ts`,
  );
}

/* 2. Clinician names come from the function written for families. */
check('care team reads rpc("my_care_team")', /rpc\(\s*["']my_care_team["']\s*\)/.test(code));

/* 3. "Today" is the clinic's calendar day, not the phone's. A parent in
      another timezone must see the same day boundary the clinic uses. */
check(
  "upcoming is filtered by clinicTodayDateStr()",
  /gte\(\s*["']session_date["']\s*,\s*clinicTodayDateStr\(\)\s*\)/.test(code),
);
check(
  "clinicTodayDateStr comes from the shared package",
  /from\s+["']@summit\/family["']/.test(code) && /clinicTodayDateStr/.test(code),
);

/* 4. Cancelled sessions are not something a parent plans around. */
check("cancelled sessions are excluded", /neq\(\s*["']status["']\s*,\s*["']cancelled["']\s*\)/.test(code));

/* 5. A Supabase error carries details/hint that can quote the row it failed
      on — here, a child's record. Only the message may surface. */
check(
  "errors surface error.message, never the object",
  /reason:\s*error\.message/.test(code) && !/reason:\s*error\b(?!\.)/.test(code),
);

/* 6. The behaviour that turns an empty set into a sentence. */
const out = join(mkdtempSync(join(tmpdir(), "summit-family-data-")), "m.mjs");
await build({
  entryPoints: [join(APP, "src", "lib", "family-data.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
  // The Supabase client drags in React Native and the keychain; the behaviour
  // under test never calls it, so it is stubbed rather than pulled into Node.
  plugins: [
    {
      name: "stub-supabase",
      setup(b) {
        b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: "supabase", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const supabase = {};", loader: "js" }));
      },
    },
  ],
});
const { explainEmpty } = await import(pathToFileURL(out).href);

const child = (perms) => ({
  clientId: 1, name: "Sam Rivera", preferredName: null, status: "active",
  dateOfBirth: null, permissions: perms, clinicId: null,
});

check(
  "a parent without view_appointments is told so, not shown an empty list",
  /does not include appointments/.test(explainEmpty(child([]), "view_appointments", "appointments")),
  explainEmpty(child([]), "view_appointments", "appointments"),
);
check(
  "the message names the child",
  explainEmpty(child([]), "view_appointments", "appointments").includes("Sam Rivera"),
);
check(
  "a parent who DOES hold it is told the schedule is empty",
  /Nothing scheduled/.test(explainEmpty(child(["view_appointments"]), "view_appointments", "appointments")),
);
check(
  "no child linked reads as a setup problem, not an empty schedule",
  /No child is linked/.test(explainEmpty(null, "view_appointments", "appointments")),
);

for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
