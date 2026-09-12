/**
 * The data inventory, derived from the schema.
 *
 * A hand-written inventory is wrong the day after a migration lands. This one
 * is generated: every table, classified by what it demonstrably holds, with
 * its tenant key and its policy count. A table that appears here with no
 * classification is a table nobody has thought about, which is the finding.
 *
 * Run:
 *   node supabase/tests/data-inventory.mjs migrations           # summary
 *   node supabase/tests/data-inventory.mjs migrations --md      # the register
 *
 * CLASSIFICATION IS INFERRED, AND THAT IS A LIMITATION
 *
 * Sensitivity is derived from column names and table names, so it is a
 * starting point a human corrects, not an authority. It errs toward
 * over-classifying: a table it cannot place is PHI-SUSPECTED rather than
 * UNCLASSIFIED, because the cost of wrongly treating operational data as
 * sensitive is a policy review, and the cost of the reverse is a disclosure.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "migrations";
const AS_MD = process.argv.includes("--md");

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

const { rows: fks } = await db.query(`
  select con.conrelid::regclass::text as child,
         con.confrelid::regclass::text as parent
    from pg_constraint con
    join pg_class p on p.oid = con.confrelid
   where con.contype = 'f'
     and exists (select 1 from pg_attribute a
                  where a.attrelid = con.confrelid and a.attname = 'clinic_id' and a.attnum > 0)`);
const inheritsFrom = new Map();
for (const f of fks) {
  const child = f.child.replace(/^public\./, ""), parent = f.parent.replace(/^public\./, "");
  if (child !== parent && !inheritsFrom.has(child)) inheritsFrom.set(child, parent);
}

const { rows: tables } = await db.query(`
  select c.relname as name,
         c.relrowsecurity as rls,
         (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
         (select string_agg(a.attname, ',' order by a.attnum)
            from pg_attribute a
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 1`);

/**
 * Ordered most-sensitive first: the first rule that matches wins, so a table
 * holding both clinical content and HR data classifies as clinical.
 */
const RULES = [
  // Reference and lookup tables first. They often carry a sensitive-sounding
  // name - guardian_permission_kinds is the list of permission NAMES, not a
  // grant to anybody - and would otherwise classify by that name and read as
  // a tenancy gap on a table that holds no personal data at all.
  { klass: "Operational",
    why: "reference and lookup data: enumerations, not records about a person",
    table: /_kinds$|_types$|_codes$|^permission_actions$/, col: null },
  { klass: "PHI — clinical",
    why: "clinical observation, assessment or treatment content about an identified child",
    table: /note|goal|program|assessment|mastery|milestone|trial|behaviour|incident|supervision|session_record|progress|observation|lesson/,
    col: /soap|body|narrative|diagnosis|mastery|criterion/ },
  { klass: "PHI — identity & care",
    why: "identifies a child as receiving clinical services, which is itself health information",
    table: /^client|household|guardian|relationship|care_team|family|consent|form_response/,
    col: /client_id|household_id|guardian/ },
  { klass: "PHI — scheduling",
    why: "appointment records tie an identified child to a clinician and a time",
    table: /session|calendar|availability|appointment|change_request/, col: null },
  { klass: "PHI — communications",
    why: "family/clinic correspondence, routinely containing clinical detail",
    table: /message|thread|announcement|notification/, col: null },
  { klass: "Financial — client",
    why: "funding and billing tied to an identified child",
    table: /budget|receipt|invoice|statement|funding|payment/, col: null },
  { klass: "HR — confidential",
    why: "employment, pay and performance information about staff",
    table: /employment|payroll|pay_|rate|timesheet|time_off|pd_|scorecard|credential|certificate|training|onboarding|hub_/, col: null },
  { klass: "Identity & access",
    why: "authentication, roles and permission grants",
    table: /profile|role|permission|invit|provision|operator|clinic$|clinics$/, col: null },
  { klass: "Audit",
    why: "security and privacy evidence; integrity-protected, retained",
    table: /audit|event_log|_events$/, col: null },
  { klass: "HR — confidential",
    why: "employment, pay and performance information about staff",
    table: /^staff$|^recognitions$|^bonus_results$|^employee_signatures$|^employer_cost_loading$|^work_week_config$/, col: null },
  { klass: "PHI — clinical",
    why: "clinical observation, assessment or treatment content about an identified child",
    table: /^clinician_tasks$|^treatment_modifications$|^phases$/, col: null },
  { klass: "Operational",
    why: "configuration and reference data with no personal content",
    table: /setting|template|policy_|policies$|type$|types$|code$|codes$|registry|readiness|coverage|^locations$|^public_holidays$|^integrity_checks$|_kinds$/, col: null },
];

function classify(t) {
  const cols = t.cols ?? "";
  for (const r of RULES) {
    if (r.table.test(t.name)) return r;
    if (r.col && r.col.test(cols)) return r;
  }
  return { klass: "PHI-SUSPECTED — unreviewed",
           why: "no rule matched; treated as sensitive until a human classifies it" };
}

const rowsOut = tables.map((t) => {
  const c = classify(t);
  const cols = (t.cols ?? "").split(",");
  return {
    name: t.name, klass: c.klass, why: c.why,
    // A child table need not carry clinic_id itself: a FK to a parent that
    // does is a real tenant boundary, provided its policy joins through it.
    // Reporting those as "none" made four legitimate tables look like gaps,
    // and a check that cries wolf is one people learn to skip.
    tenant: cols.includes("clinic_id") ? "clinic_id"
          : inheritsFrom.has(t.name) ? `via ${inheritsFrom.get(t.name)}`
          : cols.includes("user_id") ? "user_id (no clinic_id)" : "none",
    rls: t.rls, policies: t.policies,
  };
});

const byClass = new Map();
for (const r of rowsOut) byClass.set(r.klass, (byClass.get(r.klass) ?? 0) + 1);
const unreviewed = rowsOut.filter((r) => r.klass.startsWith("PHI-SUSPECTED"));
const noTenant = rowsOut.filter((r) => r.tenant === "none" && r.klass.startsWith("PHI"));

if (AS_MD) {
  console.log(`<!-- Generated by supabase/tests/data-inventory.mjs. Do not edit by hand. -->`);
  console.log(`# Data inventory\n`);
  console.log(`Generated from \`supabase/migrations\` — ${rowsOut.length} tables.\n`);
  console.log(`Classification is INFERRED from table and column names. It is a starting`);
  console.log(`point for review, not an authority: it errs toward over-classifying, because`);
  console.log(`wrongly treating operational data as sensitive costs a policy review and the`);
  console.log(`reverse costs a disclosure.\n`);
  console.log(`Retention, lawful basis and the third parties each class reaches are recorded`);
  console.log(`in \`docs/compliance/DATA_RETENTION.md\` and \`VENDOR_REGISTER.md\` — those are`);
  console.log(`organizational decisions and cannot be derived from a schema.\n`);
  for (const [klass] of [...byClass].sort()) {
    console.log(`## ${klass}\n`);
    console.log(`${rowsOut.find((r) => r.klass === klass).why}\n`);
    console.log(`| Table | Tenant key | RLS | Policies |`);
    console.log(`|---|---|---|---|`);
    for (const r of rowsOut.filter((x) => x.klass === klass)) {
      console.log(`| \`${r.name}\` | ${r.tenant} | ${r.rls ? "on" : "**OFF**"} | ${r.policies || "**none**"} |`);
    }
    console.log("");
  }
  process.exit(0);
}

console.log(`Data inventory — ${rowsOut.length} tables\n`);
for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${k}`);
}
if (unreviewed.length) {
  console.log(`\n${unreviewed.length} table(s) no rule could classify — review and add a rule:`);
  unreviewed.forEach((r) => console.log(`  ${r.name}`));
}
if (noTenant.length) {
  console.log(`\n${noTenant.length} table(s) classified PHI with NO tenant key:`);
  noTenant.forEach((r) => console.log(`  ${r.name}  [${r.klass}]`));
}
// Unclassified tables are a finding: something exists that nobody has placed.
process.exit(unreviewed.length ? 1 : 0);
