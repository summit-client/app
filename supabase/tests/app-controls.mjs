/**
 * Application-layer controls.
 *
 * Phase 1 (`controls.mjs`) checks the schema. Nothing there can see an API
 * route that forgets an auth check, an Edge Function that skips preflight, a
 * portal that sends no security headers, or a `console.log` that writes a
 * child's name into a server log.
 *
 * These are static checks over source. That is a real limitation and it cuts
 * both ways: a control here can be satisfied by code that does the wrong thing
 * in a way the pattern does not see, and it can flag code that is actually
 * fine. Both happened while writing this file - `verifyCaller` looked absent
 * from all three Edge Functions because the first pattern searched for call
 * sites and they import it by name, and six `apps/data` routes looked
 * unauthenticated because they use a shared helper rather than calling
 * `getUser()` inline. Neither was a real defect. Every control below was then
 * checked against what the code actually does, not just what it matches.
 *
 * Run:
 *   node supabase/tests/app-controls.mjs            # verdict, exit 1 on fail
 *   node supabase/tests/app-controls.mjs --matrix   # markdown
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const EMIT_MATRIX = process.argv.includes("--matrix");
const APPS = ["web", "client", "data", "employee", "scheduler"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const sourceFiles = APPS
  .flatMap((a) => walk(join(REPO, "apps", a)))
  .concat(walk(join(REPO, "packages")))
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !/\.d\.ts$/.test(f));

const apiRoutes = sourceFiles.filter(
  (f) => /[\\/]api[\\/]/.test(f) && /\.(ts|js)$/.test(f) && !/\.test\./.test(f));

const edgeFunctions = existsSync(join(REPO, "supabase", "functions"))
  ? readdirSync(join(REPO, "supabase", "functions"))
      .filter((d) => d !== "_shared" && existsSync(join(REPO, "supabase", "functions", d, "index.ts")))
      .map((d) => join(REPO, "supabase", "functions", d, "index.ts"))
  : [];

const read = (f) => readFileSync(f, "utf8");
const rel = (f) => relative(REPO, f);

/**
 * Routes that are unauthenticated BY DESIGN, each with the reason and what
 * stands in for authentication.
 *
 * An allowlist is the honest way to express this: the alternative is a control
 * that either fails permanently or is written so loosely it catches nothing.
 * Adding an entry here is a security decision and should be reviewed as one.
 */
const PUBLIC_ROUTES = {
  "apps/client/pages/api/calendar/feed/[token].ics.ts":
    "Token-gated, not cookie-gated: a calendar app's background re-fetch of a webcal:// URL carries no session. 256-bit token (crypto.randomBytes(32)), revocable, uniform response for missing vs revoked.",
  "apps/client/pages/api/admin/stop-view-as.ts":
    "Clears the caller's own view-as cookie. There is nothing to authorize - clearing your own cookie cannot affect anyone else.",
  "apps/web/pages/api/auth/confirm.js": "Auth callback; the Supabase token in the URL is the credential.",
  "apps/web/pages/api/auth/signout.js": "Ends a session. Refusing an unauthenticated sign-out would be a bug.",
  "apps/web/pages/api/auth/refresh.js": "The single refresh point; the cookie is the credential.",
  "apps/web/pages/api/auth/update-password.js": "Password reset; the recovery token is the credential.",
  "apps/web/pages/api/leads/create.js": "Public marketing lead form. Rate-limited per IP with a global backstop.",
  "apps/employee/app/api/course-link/[key]/route.ts":
    "Resolves a training course key to a URL. No PHI, no HR data, no per-user state.",
};

/** Files permitted to construct a service-role client, with the reason. */
const SERVICE_ROLE_ALLOWED = {
  "supabase/functions/_shared/auth.ts": "Edge Functions run privileged operations after verifyCaller().",
  "apps/client/lib/calendar-feed-tokens.ts": "The feed route has no session to act as; every query is hand-scoped by token then client_id.",
  "apps/web/pages/api/leads/create.js": "Writes a public lead into a table no anon policy permits.",
};

const CONTROLS = [
  {
    id: "HDR-01",
    name: "Every portal sends security headers",
    risk: "None of the five sent any. Without frame-ancestors a PHI portal can be clickjacked - an invisible overlay over 'Withdraw consent' is a real attack here. Without Referrer-Policy a URL containing /clients/4192 leaks to any third-party origin the page reaches.",
    frameworks: "OWASP ASVS V14.4 · HIPAA §164.312(e)(1) · SOC 2 CC6.6 · ISO 27001 A.8.9",
    check: () => APPS.filter((a) => {
      const cfg = ["next.config.ts", "next.config.mjs", "next.config.js"]
        .map((n) => join(REPO, "apps", a, n)).find(existsSync);
      // Must be WIRED, not merely imported. The first version of this check
      // used .includes("securityHeadersConfig"), which the import line
      // satisfies on its own - so deleting `headers: securityHeadersConfig`
      // left the control passing. Mutation testing caught it; reading it did
      // not.
      return !cfg || !/headers:\s*securityHeadersConfig/.test(read(cfg));
    }).map((a) => ({ detail: `apps/${a} does not import securityHeadersConfig` })),
  },
  {
    id: "API-01",
    name: "Every API route authenticates, or is a declared public route",
    risk: "An unauthenticated route touching PHI is a direct disclosure. The allowlist makes each exception a reviewed decision rather than an oversight.",
    frameworks: "OWASP API2 · HIPAA §164.312(d) · SOC 2 CC6.1 · ISO 27001 A.8.5",
    check: () => apiRoutes.filter((f) => {
      const r = rel(f).replace(/\\/g, "/");
      if (PUBLIC_ROUTES[r]) return false;
      const s = read(f);
      // Either an inline getUser(), or a shared helper that performs one.
      // apps/data's six AI routes use requireStaff() from lib/server/authz.ts;
      // treating those as unauthenticated would be wrong.
      return !/getUser\s*\(|requireStaff|requireUser|verifyCaller|resolveViewedClient|routeServerClient/.test(s);
    }).map((f) => ({ detail: rel(f) })),
  },
  {
    id: "API-02",
    name: "getSession() is never used as an auth gate",
    risk: "getSession() trusts the cookie without verifying the JWT against the auth server. A forged or stale cookie passes. getUser() verifies.",
    frameworks: "OWASP ASVS V3.5 · HIPAA §164.312(d) · SOC 2 CC6.1",
    // Narrowed after the first run flagged five files, none of them defects:
    // a clinical getSession(sessionId) in apps/data, two apps' own
    // app-level getSession() helpers, a documented recovery-session pickup in
    // apps/web, and a client-side initial read in apps/scheduler.
    //
    // The rule is about SERVER-SIDE AUTH GATES - proxy.ts, API routes,
    // lib/server - where getSession() would trust a cookie the auth server has
    // never seen. A browser reading its own session is not that. Matching the
    // bare name caught five things that were fine, and a control with five
    // standing false positives is one people switch off.
    check: () => sourceFiles.filter((f) => {
      const r = rel(f).replace(/\\/g, "/");
      const isServerGate = /proxy\.ts$/.test(r) || /[\\/]api[\\/]/.test(r) || /[\\/]lib[\\/]server[\\/]/.test(r);
      if (!isServerGate) return false;
      return read(f).split("\n").some((l) =>
        /auth\.getSession\s*\(/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    }).map((f) => ({ detail: rel(f) })),
  },
  {
    id: "SEC-01",
    name: "The service-role key is constructed only in declared files",
    risk: "The service role bypasses RLS entirely. Every use is a place where tenant isolation is enforced by hand or not at all, so the set of such places must be small, known and justified.",
    frameworks: "HIPAA §164.312(a)(1) · SOC 2 CC6.1 · ISO 27001 A.8.2 · OWASP ASVS V2.10",
    check: () => sourceFiles
      .filter((f) => /SERVICE_ROLE/.test(read(f)))
      .map((f) => rel(f).replace(/\\/g, "/"))
      .filter((r) => !SERVICE_ROLE_ALLOWED[r] && !/\.md$/.test(r))
      .map((detail) => ({ detail })),
  },
  {
    id: "SEC-02",
    name: "No service-role key is readable by a browser",
    risk: "Behind a NEXT_PUBLIC_ prefix the key is compiled into client JavaScript. Total, silent compromise of every clinic's PHI by anyone who opens devtools.",
    frameworks: "HIPAA §164.312(a)(2)(i) · SOC 2 CC6.1 · OWASP ASVS V2.10",
    check: () => sourceFiles
      .filter((f) => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(read(f)))
      .map((f) => ({ detail: rel(f) })),
  },
  {
    id: "EF-01",
    name: "Every Edge Function verifies its caller and handles CORS preflight",
    risk: "These functions hold the service role. One that skips verifyCaller() is an unauthenticated privileged operation. One that skips handlePreflight() is blocked by the browser before the real request, surfacing as a generic FunctionsFetchError that looks like a deploy problem.",
    frameworks: "OWASP API2 · API8 · HIPAA §164.312(d) · SOC 2 CC6.1",
    check: () => edgeFunctions.flatMap((f) => {
      const s = read(f), name = rel(f), out = [];
      // Require a CALL, not an import. Matching the bare name meant a function
      // that imported verifyCaller and never invoked it passed - the same
      // blind spot mutation testing exposed in HDR-01. An import proves
      // nothing about what runs.
      if (!/verifyCaller\s*\(/.test(s)) out.push({ detail: `${name}: imports but never calls verifyCaller()` });
      if (!/handlePreflight\s*\(/.test(s)) out.push({ detail: `${name}: imports but never calls handlePreflight()` });
      return out;
    }),
  },
  {
    id: "LOG-01",
    name: "No request or response body is logged whole",
    risk: "console.log(req.body) on a route handling a session note writes clinical content into a server log, which is retained, shipped to a monitoring vendor, and outside every access control the database enforces.",
    frameworks: "PHIPA s.12 · HIPAA §164.312(b) · SOC 2 CC6.7 · ISO 27001 A.8.11",
    check: () => sourceFiles.filter((f) => {
      const s = read(f);
      return /console\.(log|info|warn|error)\s*\([^)]*\b(req|request)\.(body|query)\b/.test(s)
          || /console\.(log|info|warn|error)\s*\(\s*(body|payload|record|note|rows|data)\s*\)/.test(s);
    }).map((f) => ({ detail: rel(f) })),
  },
  {
    id: "LOG-02",
    name: "Supabase error objects are logged by message, not whole",
    risk: "A PostgREST error object can carry `details` and `hint` containing the offending row - so logging the object writes the record it failed on. Logging error.message does not.",
    frameworks: "HIPAA §164.312(b) · SOC 2 CC6.7 · ISO 27001 A.8.11",
    check: () => sourceFiles.filter((f) => {
      const s = read(f);
      // console.error(..., error) where `error` is the bare object, not .message
      return /console\.(error|log|warn)\s*\([^)]*,\s*(error|err)\s*\)/.test(s);
    }).map((f) => ({ detail: rel(f) })),
  },
  {
    id: "RED-01",
    name: "No redirect is built from unvalidated request input",
    risk: "An open redirect on an auth flow turns a trusted domain into a phishing hop, and can leak a token in the referrer.",
    frameworks: "OWASP ASVS V5.1 · A01:2021 · SOC 2 CC6.6",
    check: () => sourceFiles.filter((f) => {
      const s = read(f);
      return /redirect\s*\(\s*(req|request)\.(query|body|nextUrl\.searchParams)/.test(s)
          || /Location["']?\s*[,:]\s*(req|request)\.(query|body)/.test(s);
    }).map((f) => ({ detail: rel(f) })),
  },
];

const results = [];
for (const c of CONTROLS) {
  let offenders, error = null;
  try { offenders = await c.check(); }
  catch (e) { offenders = []; error = e instanceof Error ? e.message : String(e); }
  results.push({ ...c, offenders, error });
}
const failed = results.filter((r) => r.error || r.offenders.length > 0);

if (EMIT_MATRIX) {
  console.log(`<!-- Generated by supabase/tests/app-controls.mjs. Do not edit by hand. -->`);
  console.log(`# Application-layer control matrix\n`);
  console.log(`${apiRoutes.length} API routes, ${edgeFunctions.length} Edge Functions, ${sourceFiles.length} source files.\n`);
  console.log(`These are STATIC checks over source. A control can be satisfied by code`);
  console.log(`that does the wrong thing in a way the pattern does not see. They`);
  console.log(`complement the schema controls and the RLS suite; they do not replace`);
  console.log(`either. See \`docs/compliance/README.md\`.\n`);
  console.log(`| ID | Control | Status | Evidence | Framework pointer |`);
  console.log(`|---|---|---|---|---|`);
  for (const r of results) {
    const status = r.error ? "ERROR" : r.offenders.length ? `**FAIL (${r.offenders.length})**` : "PASS";
    const ev = r.error ? r.error
      : r.offenders.length ? r.offenders.map((o) => `\`${o.detail}\``).join("<br>")
      : "no matches";
    console.log(`| ${r.id} | ${r.name} | ${status} | ${ev} | ${r.frameworks} |`);
  }
  console.log(`\n## Routes unauthenticated by design\n`);
  console.log(`| Route | Why, and what stands in for authentication |`);
  console.log(`|---|---|`);
  for (const [k, v] of Object.entries(PUBLIC_ROUTES)) console.log(`| \`${k}\` | ${v} |`);
  console.log(`\n## Files permitted to use the service role\n`);
  console.log(`| File | Why |`);
  console.log(`|---|---|`);
  for (const [k, v] of Object.entries(SERVICE_ROLE_ALLOWED)) console.log(`| \`${k}\` | ${v} |`);
  process.exit(0);
}

console.log(`Application controls — ${results.length} checks over ${apiRoutes.length} API routes, ` +
            `${edgeFunctions.length} Edge Functions, ${sourceFiles.length} source files\n`);
for (const r of results) {
  if (r.error) { console.log(`ERROR ${r.id}  ${r.name}\n        ${r.error}`); }
  else if (r.offenders.length) {
    console.log(`FAIL  ${r.id}  ${r.name}`);
    r.offenders.slice(0, 15).forEach((o) => console.log(`        ${o.detail}`));
    if (r.offenders.length > 15) console.log(`        ...and ${r.offenders.length - 15} more`);
    console.log(`        risk: ${r.risk}`);
  } else console.log(`ok    ${r.id}  ${r.name}`);
}
console.log(`\n${results.length - failed.length}/${results.length} application controls pass`);
if (failed.length) {
  console.log(`\n${failed.length} FAILED. A security control regression, not a test flake.`);
  process.exit(1);
}
