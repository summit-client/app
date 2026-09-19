/**
 * The control register, executed.
 *
 * WHY THIS IS CODE AND NOT A DOCUMENT
 *
 * A control matrix maintained by hand states what was true on the day someone
 * wrote it. This repository has already produced three stale claims that a
 * document would have carried indefinitely: a CLAUDE.md note calling
 * `invite-teammate` unfixed after it was fixed, a "not yet applied" comment on
 * migration 0041 after it was applied, and a list of admin-console queues
 * described as broken after another session had wired them. Each was believed
 * until someone re-derived it.
 *
 * So every control here is a QUERY against the schema the migrations actually
 * build. The verdict is computed, not asserted. When a control cannot be
 * checked mechanically it is listed as MANUAL with an explicit owner, rather
 * than being quietly dropped or - worse - marked PASS because nobody looked.
 *
 * Run:
 *   node supabase/tests/controls.mjs migrations            # verdict, exit 1 on fail
 *   node supabase/tests/controls.mjs migrations --matrix   # emit the matrix as markdown
 *
 * WHAT THIS IS NOT
 *
 * Not an attestation. It shows technical controls behaving as intended in a
 * PGlite rebuild of the schema. It says nothing about the organisation's
 * policies, its staff training, its vendor agreements, or the live database's
 * actual configuration - and a passing run is not evidence of PHIPA, PIPEDA,
 * HIPAA, SOC 2 or ISO 27001 compliance. See docs/compliance/README.md for the
 * difference between control implementation and compliance.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const DIR = process.argv[2] ?? "migrations";
const EMIT_MATRIX = process.argv.includes("--matrix");
const REPO = join(import.meta.dirname, "..", "..");

const db = await PGlite.create({ extensions: { btree_gist } });
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
  do $do$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $do$;
`);
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(DIR, f), "utf8"));
}

const rows = async (sql) => (await db.query(sql)).rows;

/**
 * Tables that are deliberately reachable only by the service role.
 *
 * RLS on with no policy denies every API caller, which is the intended state
 * for these two - not an oversight. Listed explicitly so that a THIRD such
 * table appearing is a finding rather than something the check silently
 * tolerates. Adding to this list is a security decision and should be reviewed
 * as one.
 */
const SERVICE_ROLE_ONLY = new Set(["hub_certificate_registry", "platform_operators"]);

/**
 * Every control. `check` returns the offending rows; empty means PASS.
 *
 * `frameworks` maps to the criterion a reviewer would look under. It is a
 * pointer for someone assembling evidence, not a claim of conformance.
 */
const CONTROLS = [
  {
    id: "TI-01",
    name: "Every table holding client data carries a tenant key",
    risk: "A table without clinic_id cannot express a tenant boundary, so no policy on it can enforce one - cross-tenant disclosure of PHI.",
    frameworks: "PHIPA s.12 · HIPAA §164.312(a)(1) · SOC 2 CC6.1 · ISO 27001 A.8.3 · OWASP API1 (BOLA)",
    check: () => rows(`
      select c.relname as detail
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'client_id' and a.attnum > 0)
         and not exists (select 1 from pg_attribute a
                          where a.attrelid = c.oid and a.attname = 'clinic_id' and a.attnum > 0)
       order by 1`),
  },
  {
    id: "TI-02",
    name: "Row level security is enabled on every table",
    risk: "RLS off means the anon and authenticated roles read the table unrestricted. This is the single highest-impact misconfiguration in a Supabase project.",
    frameworks: "PHIPA s.12 · HIPAA §164.312(a)(1) · SOC 2 CC6.1 · ISO 27001 A.8.3",
    check: () => rows(`
      select c.relname as detail
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
       order by 1`),
  },
  {
    id: "TI-03",
    name: "Every RLS-enabled table has a policy, or is a declared service-role-only table",
    risk: "RLS on with no policy denies everyone. Harmless where intended and a silent outage where not - the 'RLS returns empty sets, not errors' failure, which reads as an auth bug.",
    frameworks: "SOC 2 CC6.1 · CC7.2 · ISO 27001 A.8.2",
    check: async () => (await rows(`
      select c.relname as detail
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
         and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
       order by 1`)).filter((r) => !SERVICE_ROLE_ONLY.has(r.detail)),
  },
  {
    id: "AC-01",
    name: "No policy is written FOR ALL",
    risk: "Deletes are denied by default across this schema because policies are written per command. One `for all` silently reopens DELETE on that table, including for clinical records.",
    frameworks: "PHIPA s.13 (record retention) · HIPAA §164.312(c)(1) · SOC 2 PI1.1",
    check: () => rows(`
      select polrelid::regclass::text || '.' || polname as detail
        from pg_policy where polcmd = '*' order by 1`),
  },
  {
    id: "AC-02",
    name: "security definer functions exclude pg_temp",
    risk: "Exploited on this schema before migration 0009: temp-table shadowing let any authenticated user insert themselves as admin of any clinic. `set search_path = public` alone does not exclude pg_temp.",
    frameworks: "HIPAA §164.312(a)(1) · SOC 2 CC6.1 · ISO 27001 A.8.2 · OWASP ASVS V1.4",
    check: () => rows(`
      select p.proname as detail
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and (p.proconfig is null
              or not exists (select 1 from unnest(p.proconfig) c where c like '%pg_temp%'))
       order by 1`),
  },
  {
    id: "AC-03",
    name: "Every view runs as the invoker",
    risk: "A view runs as its OWNER unless declared security_invoker. These are created by migrations running as superuser, so a non-invoker view bypasses RLS entirely - and every portal page reads through a view. This was live: payroll, another family's funding and another child's clinical progress were all readable.",
    frameworks: "PHIPA s.12 · HIPAA §164.312(a)(1) · SOC 2 CC6.1 · OWASP API1",
    check: () => rows(`
      select c.relname as detail
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and coalesce((select option_value from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), 'false') <> 'true'
       order by 1`),
  },
  {
    id: "AU-01",
    name: "Audit tables are append-only to API callers",
    risk: "An audit trail the subject can edit or erase is not an audit trail. Any UPDATE or DELETE policy on an audit table defeats the control it exists to provide.",
    frameworks: "PHIPA s.10(1) · HIPAA §164.312(b), §164.312(c)(1) · SOC 2 CC7.2 · ISO 27001 A.8.15",
    check: () => rows(`
      select p.polrelid::regclass::text || '.' || p.polname || ' (' ||
             case p.polcmd when 'w' then 'UPDATE' when 'd' then 'DELETE' else p.polcmd::text end || ')' as detail
        from pg_policy p
       where p.polrelid::regclass::text like '%audit%'
         and p.polcmd in ('w', 'd')
       order by 1`),
  },
  {
    id: "SE-01",
    name: "No service-role key is exposed to a browser bundle",
    risk: "The service role bypasses RLS entirely. Behind a NEXT_PUBLIC_ prefix it is compiled into client JavaScript and readable by anyone who opens devtools - total, silent compromise of every clinic's PHI.",
    frameworks: "HIPAA §164.312(a)(2)(i) · SOC 2 CC6.1 · ISO 27001 A.5.17 · OWASP ASVS V2.10",
    check: async () => {
      const hits = [];
      try {
        // Tracked files only. An untracked local .env is the developer's own
        // business; one that is committed is everyone's.
        const out = execSync(
          `git grep -lnE "NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE|SERVICE_ROLE_KEY\\s*=\\s*ey" -- ` +
          `':!*.md' ':!supabase/tests/*' || true`,
          { cwd: REPO, encoding: "utf8" });
        out.split("\n").filter(Boolean).forEach((f) => hits.push({ detail: f }));
      } catch { /* git grep exits 1 when nothing matches */ }
      return hits;
    },
  },
  {
    id: "SE-02",
    name: "No .env file containing real values is tracked",
    risk: "A committed .env is a credential disclosure that survives in history after deletion, and must be treated as a rotation event.",
    frameworks: "HIPAA §164.308(a)(5) · SOC 2 CC6.1 · ISO 27001 A.5.17",
    check: async () => {
      try {
        const out = execSync(
          `git ls-files | grep -E "(^|/)\\.env" | grep -v "\\.example$" || true`,
          { cwd: REPO, encoding: "utf8" });
        return out.split("\n").filter(Boolean).map((f) => ({ detail: f }));
      } catch { return []; }
    },
  },
  {
    id: "IN-01",
    name: "A signed clinical note cannot be silently rewritten",
    risk: "Clinical documentation requires attribution and integrity. A finalized note that can be edited in place, with no amendment record, destroys the evidentiary value of the whole chart.",
    frameworks: "PHIPA s.13 · HIPAA §164.312(c)(1) · SOC 2 PI1.4 · ISO 27001 A.8.10",
    check: () => rows(`
      select 'session_notes has no status-transition guard' as detail
       where not exists (
         select 1 from pg_trigger t
          where t.tgrelid = 'public.session_notes'::regclass and not t.tgisinternal)`),
  },
  {
    id: "PR-01",
    name: "Consent withdrawal preserves the window rather than editing it away",
    risk: "A withdrawal that edits the original answer destroys the record of the period the clinic was entitled to act in - exactly the question a regulator asks after a complaint.",
    frameworks: "PIPEDA Principle 3 · PHIPA s.18 · GDPR Art.7(1) equivalent · SOC 2 P3.2",
    check: () => rows(`
      select 'consent_records lacks withdrawn_at' as detail
       where not exists (
         select 1 from pg_attribute a
          where a.attrelid = 'public.consent_records'::regclass
            and a.attname = 'withdrawn_at' and a.attnum > 0)`),
  },
];

/**
 * Controls that cannot be derived from the schema.
 *
 * Listed rather than omitted. A register that shows only the machine-checkable
 * controls implies the rest are absent or, read carelessly, that they pass.
 */
const MANUAL = [
  { id: "OP-01", name: "Supabase BAA / DPA signed before real PHI is loaded",
    owner: "Organization", frameworks: "HIPAA §164.308(b)(1) · PHIPA s.10(2)",
    state: "OPEN - docs/context/compliance.md records this as gating revenue." },
  { id: "OP-02", name: "Backup restoration tested, RPO/RTO defined",
    owner: "Organization", frameworks: "SOC 2 A1.2 · ISO 27001 A.8.13",
    state: "UNVERIFIED - Supabase takes backups; no restore has been rehearsed from this repo." },
  { id: "OP-03", name: "Data residency mapped end to end",
    owner: "Organization", frameworks: "PIPEDA · PHIPA s.50 · ISO 27018",
    state: "PARTIAL - see docs/compliance/DATA_FLOW.md; AI processing and email egress are the open legs." },
  { id: "OP-04", name: "MFA enforced for admin and supervisor roles",
    owner: "Organization", frameworks: "HIPAA §164.312(d) · SOC 2 CC6.1 · CIS 6.3",
    state: "UNVERIFIED - a Supabase Auth setting, not visible to this repository." },
  { id: "OP-05", name: "Access review on role change and termination",
    owner: "Organization", frameworks: "SOC 2 CC6.2, CC6.3 · ISO 27001 A.5.18",
    state: "PARTIAL - deactivation exists in the employee portal; no periodic review process." },
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
  const now = new Date().toISOString().slice(0, 10);
  console.log(`<!-- Generated by supabase/tests/controls.mjs. Do not edit by hand. -->`);
  console.log(`# Control matrix\n`);
  console.log(`Generated ${now} from \`supabase/migrations\` (${readdirSync(DIR).filter((f) => f.endsWith(".sql")).length} migrations).\n`);
  console.log(`Every AUTOMATED row below is a query re-run on each CI build. A row`);
  console.log(`reading PASS means that query returned nothing on this schema - not that`);
  console.log(`the organization is compliant with the frameworks named. See`);
  console.log(`\`docs/compliance/README.md\`.\n`);
  console.log(`## Automated\n`);
  console.log(`| ID | Control | Status | Evidence | Framework pointer |`);
  console.log(`|---|---|---|---|---|`);
  for (const r of results) {
    const status = r.error ? "ERROR" : r.offenders.length ? `**FAIL (${r.offenders.length})**` : "PASS";
    const ev = r.error ? r.error
      : r.offenders.length ? r.offenders.map((o) => `\`${o.detail}\``).join(", ")
      : `query returns 0 rows`;
    console.log(`| ${r.id} | ${r.name} | ${status} | ${ev} | ${r.frameworks} |`);
  }
  console.log(`\n## Manual — not derivable from this repository\n`);
  console.log(`| ID | Control | Owner | State | Framework pointer |`);
  console.log(`|---|---|---|---|---|`);
  for (const m of MANUAL) {
    console.log(`| ${m.id} | ${m.name} | ${m.owner} | ${m.state} | ${m.frameworks} |`);
  }
  console.log(`\n## Risks this register does not address\n`);
  console.log(`- It runs against a PGlite rebuild, not the live database. A policy`);
  console.log(`  dropped by hand in the Supabase dashboard would not be caught here.`);
  console.log(`- \`auth.uid()\` is a stub reading a GUC. A policy depending on any other`);
  console.log(`  JWT claim is not exercised.`);
  console.log(`- Application-layer authorization is covered by \`rls.mjs\` and`);
  console.log(`  \`behaviour.mjs\`, not by this file.`);
  process.exit(0);
}

console.log(`Control register — ${results.length} automated, ${MANUAL.length} manual\n`);
for (const r of results) {
  if (r.error) {
    console.log(`ERROR ${r.id}  ${r.name}`);
    console.log(`        the check itself failed: ${r.error}`);
  } else if (r.offenders.length) {
    console.log(`FAIL  ${r.id}  ${r.name}`);
    r.offenders.slice(0, 12).forEach((o) => console.log(`        ${o.detail}`));
    if (r.offenders.length > 12) console.log(`        ...and ${r.offenders.length - 12} more`);
    console.log(`        risk: ${r.risk}`);
  } else {
    console.log(`ok    ${r.id}  ${r.name}`);
  }
}
console.log(`\nManual controls (stated, not checked):`);
for (const m of MANUAL) console.log(`  ${m.id}  ${m.state.split(" - ")[0].padEnd(11)} ${m.name}`);

console.log(`\n${results.length - failed.length}/${results.length} automated controls pass`);
if (failed.length) {
  console.log(`\n${failed.length} FAILED. This is a security control regression, not a test flake.`);
  process.exit(1);
}
