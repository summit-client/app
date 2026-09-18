/**
 * The tenancy doctrine, checked.
 *
 * One rule holds this schema together: a row belongs to a clinic, and a policy
 * only hands it over to somebody in that clinic. It is written 435 times. Any
 * one of those that forgets it is a place another clinic's PHI can come back,
 * and nothing was checking.
 *
 * TWO MODES, AND THE DIFFERENCE MATTERS
 *
 *   node tenancy.mjs ../migrations           the migration files, in PGlite
 *   node tenancy.mjs ../migrations --live    the deployed database
 *
 * The file mode needs no credentials and catches anything WE write wrong. It
 * is not sufficient, and the proof is in this repo's history: run against the
 * files on 2026-09-18 it reported `sessions` cleanly scoped, while production
 * carried two pre-history policies with no clinic predicate that appear here
 * only as comments. A check that can only see the migrations is blind to
 * anything applied by hand, applied out of order, or older than the history.
 *
 * So the live mode is the real one. It reads pg_policies over the Supabase
 * Management API with SUPABASE_ACCESS_TOKEN, and it is READ ONLY by
 * construction - every statement below is a SELECT against a catalog.
 *
 * WHAT COUNTS AS SCOPED
 *
 * A policy passes if it does any ONE of:
 *   - names clinic_id (directly, or through a helper that does)
 *   - anchors on the caller - auth.uid(), their household, their guardianship,
 *     their staff row. Narrower than a clinic, so it cannot cross one.
 *   - is on a PLATFORM_DEFAULTS table, where clinic_id IS NULL deliberately
 *     means "every clinic" - those are checked more strictly instead, below.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DIR = process.argv[2];
const LIVE = process.argv.includes("--live");
const REF = process.env.SUPABASE_PROJECT_REF || "xbkokyxegrxutppolgtz";

/**
 * Tables whose NULL clinic_id is the design, not a gap: a row with no clinic
 * is a platform default every clinic inherits. Measured on production
 * 2026-09-18 - and `role_permissions` is the one that makes this non
 * negotiable, because auth_can() falls back to its 187 null-clinic rows for
 * every permission decision in the schema. NOT NULL there would deny
 * everything for everyone.
 *
 * The cost of the pattern is that these tables need a stricter check, not a
 * looser one: read may see the nulls, write may not create them.
 */
const PLATFORM_DEFAULTS = new Set([
  "role_permissions", "public_holidays", "activity_codes", "pay_codes",
  "goal_bank_catalogue", "goal_bank_entries", "permission_actions",
  "credential_rule_versions",
]);

/**
 * Policies known to be unscoped, with the reason they have not been fixed yet.
 * A baseline, not an excuse: the suite still FAILS on anything new, and this
 * list is meant to reach zero. Each entry says what it would take.
 */
const KNOWN = new Map([
  ["sessions/Staff can read own sessions",
   "reaches through staff.user_id. Held today only by staff_user_id_unique - one staff row per person. Drop that index to support a person at two clinics and this returns the other clinic's sessions."],
  ["staff_availability/Staff can read own availability", "same reach, same dependency."],
  ["staff_availability/staff_availability_own_delete", "same reach, same dependency (migration 0076)."],
  ["sessions/Clients can read own sessions",
   "reaches through clients.user_id, and clients has NO unique index on user_id - so nothing prevents the precondition, only the fact that nobody has done it. Worse than the staff pair."],
  ["client_availability/Clients can read own availability", "same reach, same absence of a constraint."],
  ["clients/Clients can read own record", "pre-history own-row read with no clinic predicate."],
]);

/**
 * Being "anchored to the caller" comes in two shapes and only one of them is
 * safe, which is the distinction that cost this schema two invisible policies.
 *
 * DIRECT - the row itself carries the caller: `user_id = auth.uid()`. The row
 * is yours, so it cannot be another clinic's. Nothing outside the policy has
 * to hold for that to be true.
 *
 * INDIRECT - the policy reaches THROUGH another table to find the caller:
 * `exists (select 1 from staff where staff.id = sessions.employee_id and
 * staff.user_id = auth.uid())`. Whether that can leave the clinic depends on
 * something the policy does not say. On this database it depends on
 * `staff_user_id_unique`, an index allowing one staff row per person - drop
 * that index to let somebody work at two clinics and the policy starts
 * returning the other clinic's sessions, with no warning and no other change.
 *
 * A tenant boundary that lives in an index somewhere else is not a boundary.
 * Indirect anchoring is reported separately and must be listed in KNOWN.
 */
const DIRECT_ANCHOR = /\b(user_id|id)\s*=\s*auth\.uid\(\)/;
const INDIRECT_ANCHOR = /auth\.uid\(\)|auth_staff_id\(\)|auth_household_id\(\)|auth_guardian_can|auth_accessible_client_ids|auth_can_use_thread|auth_can_manage_household|auth_may_see_time_of|auth_may_read_hr_of|hub_can_manage/;

let pass = 0, fail = 0, known = 0;
const t = (name, ok, detail = "") => {
  if (ok) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `\n         ${detail}` : ""); }
};

/* ---------- the two sources ------------------------------------------- */

async function fromFiles() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
    do $do$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $do$;`);
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(DIR, f), "utf8"));
  }
  return async (sql) => (await db.query(sql)).rows;
}

function fromProduction() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "FAIL: --live was asked for and SUPABASE_ACCESS_TOKEN is not set.\n" +
      "      Refusing to fall back to the migration files: that check reports\n" +
      "      clean on a database it cannot see, which is how two unscoped\n" +
      "      policies went unnoticed. Set the token or drop --live.");
    process.exit(1);
  }
  return async (sql) => {
    const out = execFileSync("curl", [
      "-s", "--max-time", "60", "-X", "POST",
      "-H", `Authorization: Bearer ${token}`,
      "-H", "Content-Type: application/json",
      "-d", JSON.stringify({ query: sql }),
      `https://api.supabase.com/v1/projects/${REF}/database/query`,
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const parsed = JSON.parse(out);
    if (!Array.isArray(parsed)) throw new Error(`query failed: ${out.slice(0, 300)}`);
    return parsed;
  };
}

/* ---------- the checks -------------------------------------------------- */

const q = LIVE ? fromProduction() : await fromFiles();
console.log(`\nTenancy doctrine — ${LIVE ? `LIVE (project ${REF})` : "migration files"}\n`);

const clinicTables = (await q(`
  select table_name from information_schema.columns
   where table_schema='public' and column_name='clinic_id'`)).map((r) => r.table_name);

// 1. Row security is on wherever a clinic owns the row.
const rlsOff = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name=c.relname and column_name='clinic_id')`);
t(`row security is on for all ${clinicTables.length} clinic-scoped tables`,
  rlsOff.length === 0, rlsOff.map((r) => r.relname).join(", "));

// 2. Every policy is scoped to a clinic or to the caller.
const policies = await q(`
  select tablename, policyname, cmd,
         coalesce(qual, '') as qual, coalesce(with_check, '') as wc
    from pg_policies where schemaname='public' order by tablename, policyname`);

const unscoped = [], indirect = [], direct = [];
for (const p of policies) {
  if (!clinicTables.includes(p.tablename)) continue;
  if (PLATFORM_DEFAULTS.has(p.tablename)) continue;
  const text = `${p.qual} ${p.wc}`;
  if (/clinic_id/.test(text)) continue;
  // The one shape that can actually cross a clinic: reaching through `staff`
  // or `clients` on user_id. Those are the two tables where the SAME PERSON
  // could hold rows in two clinics, so "this row is mine" stops implying
  // "this row is in my clinic". Every other indirect anchor resolves through
  // something a clinic already owns.
  if (/from (public\.)?(staff|clients)\b/i.test(text) && /user_id = auth\.uid\(\)/.test(text)) {
    indirect.push(p); continue;
  }
  if (DIRECT_ANCHOR.test(text) || INDIRECT_ANCHOR.test(text)) { direct.push(p); continue; }
  unscoped.push(p);
}
const newlyUnscoped = unscoped.filter((p) => !KNOWN.has(`${p.tablename}/${p.policyname}`));
known += unscoped.length - newlyUnscoped.length;
t(`every policy on a clinic-scoped table is scoped (${policies.length} policies checked)`,
  newlyUnscoped.length === 0,
  newlyUnscoped.map((p) => `${p.tablename}.${p.policyname} [${p.cmd}] ${(p.qual || p.wc).replace(/\s+/g, " ").slice(0, 90)}`).join("\n         "));

// 3. Direct anchoring - the row carries the caller - is safe on its own.
//    Reported, never failed: adding a clinic predicate to these changes
//    nothing today, and failing ~60 policies that leak nothing would make the
//    suite something people switch off.
console.log(`  NOTE ${direct.length} policies anchor on the caller without naming clinic_id.`);
console.log("       Safe today: each resolves through something one clinic owns. The doctrine still wants both.");

// 4. The class that can cross a clinic: reaching through staff or clients on
//    user_id. Held up by an index on one of those tables and by nothing at
//    all on the other. Each must be listed in KNOWN saying what holds it; a
//    new one fails the run.
const newIndirect = indirect.filter((p) => !KNOWN.has(`${p.tablename}/${p.policyname}`));
known += indirect.length - newIndirect.length;
t(`no NEW policy identifies the caller through staff or clients without naming a clinic (${indirect.length} existing)`,
  newIndirect.length === 0,
  newIndirect.map((p) => `${p.tablename}.${p.policyname} [${p.cmd}] ${(p.qual || p.wc).replace(/\s+/g, " ").slice(0, 100)}`).join("\n         "));

// 4. Platform-default tables: read may see the nulls, write may never make one.
for (const table of [...PLATFORM_DEFAULTS].filter((x) => clinicTables.includes(x))) {
  const rows = policies.filter((p) => p.tablename === table);
  if (!rows.length) continue;
  const writes = rows.filter((p) => p.cmd !== "SELECT");
  const looseWrite = writes.filter((p) => !/clinic_id = auth_clinic_id\(\)/.test(`${p.qual} ${p.wc}`));
  t(`${table}: a write must name the caller's clinic, so nobody can mint a platform default`,
    looseWrite.length === 0, looseWrite.map((p) => p.policyname).join(", "));
}

// 5. 0052's rule: no view may bypass RLS.
const views = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name='security_invoker'),'false') <> 'true'`);
t("every view runs as the caller (security_invoker)", views.length === 0,
  views.map((r) => r.relname).join(", "));

// 6. 0009's rule: a definer function must pin pg_temp, or a temp table can
//    shadow the tables it reads. `search_path=pg_catalog` does NOT count -
//    pg_temp is searched implicitly when it is not named.
const definers = await q(`
  select p.proname, coalesce(array_to_string(p.proconfig,','),'(none)') as cfg
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and coalesce(array_to_string(p.proconfig,','),'') !~ 'pg_temp'
   order by p.proname`);
t("every security definer function names pg_temp", definers.length === 0,
  definers.map((r) => `${r.proname} (search_path: ${r.cfg})`).join("\n         "));

// 7. CLAUDE.md: policies are per command, never `for all`.
const forAll = policies.filter((p) => p.cmd === "ALL");
t("no policy is written `for all`", forAll.length === 0,
  forAll.map((p) => `${p.tablename}.${p.policyname}`).join(", "));

/* ---------- the baseline ------------------------------------------------ */
if (known) {
  console.log(`\n  ${known} known unscoped ${known === 1 ? "policy" : "policies"}, each with a reason in KNOWN:`);
  for (const [k, why] of KNOWN) {
    if (unscoped.some((p) => `${p.tablename}/${p.policyname}` === k)) console.log(`    - ${k}\n        ${why}`);
  }
  console.log("  These do not fail the run. They are meant to reach zero.");
}

console.log(`\n${pass} passed, ${fail} failed${known ? `, ${known} known` : ""}`);
process.exit(fail ? 1 : 0);
