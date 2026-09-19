/**
 * The provisioning rate limit refuses when it cannot count.
 *
 * Edge Functions have NO CI cover — they are not built, not typechecked and
 * not deployed by merging — so this compiles the shipped _shared/auth.ts and
 * CALLS isRateLimited with a client whose count query fails. It does not
 * restate the rule; it exercises it, so it cannot pass against a stale copy.
 *
 * The direction is the whole point. Every caller reads it as
 *   if (await isRateLimited(...)) return 429
 * so returning false on a failed count switched the limit off across invite,
 * edit and clinic provisioning at once — a rate limit that disappears exactly
 * when the database is unhappy.
 *
 * Run: node supabase/tests/rate_limit_fails_closed.mjs
 */
import { build } from "esbuild";
import { readFileSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SHARED = join(REPO, "supabase", "functions", "_shared", "auth.ts");

const out = join(mkdtempSync(join(tmpdir(), "summit-edge-")), "auth.mjs");
await build({
  entryPoints: [SHARED],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
  // Deno resolves `npm:` specifiers; Node does not, and the function under
  // test never touches the client's constructor.
  plugins: [{
    name: "stub-deno-specifiers",
    setup(b) {
      b.onResolve({ filter: /^npm:|^jsr:/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const createClient = () => ({});", loader: "js",
      }));
    },
  }],
});
const { isRateLimited } = await import(pathToFileURL(out).href);

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => (ok ? passed++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`));

/** A PostgREST query builder stub: every step chains, awaiting yields `result`. */
const clientReturning = (result) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    then: (resolve) => resolve(result),
  };
  return { from: () => chain };
};

const quiet = console.error;
console.error = () => {};
const refusedOnError = await isRateLimited(
  clientReturning({ count: null, error: { message: "connection reset" } }),
  "actor", "invite", 5,
);
console.error = quiet;

check("a failed count REFUSES rather than letting the caller through", refusedOnError === true,
  `got ${refusedOnError}`);

check("under the limit is allowed",
  (await isRateLimited(clientReturning({ count: 2, error: null }), "actor", "invite", 5)) === false);
check("at the limit is refused",
  (await isRateLimited(clientReturning({ count: 5, error: null }), "actor", "invite", 5)) === true);
check("over the limit is refused",
  (await isRateLimited(clientReturning({ count: 9, error: null }), "actor", "invite", 5)) === true);
check("a null count with no error is treated as zero, not as a failure",
  (await isRateLimited(clientReturning({ count: null, error: null }), "actor", "invite", 5)) === false);

/* The caller side: every function must gate on this helper rather than keep
   its own copy. provision-clinic had one that never read `error` at all. */
for (const fn of ["invite-teammate", "edit-teammate", "provision-clinic"]) {
  const src = readFileSync(join(REPO, "supabase", "functions", fn, "index.ts"), "utf8");
  check(`${fn} gates on the shared helper`, /if \(await isRateLimited\(/.test(src));
  check(`${fn} keeps no private count of provisioning_audit`,
    !/from\(\s*["']provisioning_audit["']\s*\)[\s\S]{0,200}count:\s*["']exact["']/.test(src));
}

for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
