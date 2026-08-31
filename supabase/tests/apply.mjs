/**
 * Run every Summit migration in order against a throwaway Postgres.
 *
 * PGlite is a real Postgres compiled to WASM, so this executes the actual DDL
 * rather than parsing it. What it is NOT is a Supabase instance: there is no
 * auth schema, no anon/authenticated/service_role roles, no RLS enforcement
 * against a JWT. Those are stubbed below so the migrations can run; anything
 * that depends on the stub behaving like Supabase is out of scope here.
 *
 * What this DOES prove: the SQL parses, the tables and constraints are
 * creatable, functions compile, triggers attach, views resolve their columns,
 * and the seeds satisfy their own constraints.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const db = await PGlite.create();

// --- Supabase stubs -------------------------------------------------------
// auth.users, auth.uid(), and the three API roles. The migrations reference
// all of them; none exist in a bare Postgres.
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  -- A settable current user, so policies can be exercised later.
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
  do $do$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $do$;
`);

let failed = 0;
const skippedExclusions = [];
for (const f of files) {
  let sql = readFileSync(join(DIR, f), "utf8");

  // PGlite ships without btree_gist, so the three exclusion constraints that
  // need it (uuid/bigint `with =` alongside a range `with &&`) cannot be
  // created here. They are removed for this run and reported separately —
  // btree_gist IS available on Supabase, so this is an environment limit, not
  // a defect. Everything else in those files is still executed.
  if (/btree_gist/.test(sql)) {
    sql = sql.replace(/create extension if not exists btree_gist;/g, "");
    sql = sql.replace(
      /alter table (\w+)\s+drop constraint if exists (\w+);\s*alter table \1\s+add constraint \2\s+exclude using gist \([^;]*?\);/gs,
      (m, tbl, con) => { skippedExclusions.push(`${tbl}.${con}`); return ""; });
  }
  try {
    await db.exec(sql);
    console.log(`ok    ${f}`);
  } catch (e) {
    failed++;
    const msg = String(e.message || e).split("\n")[0];
    console.log(`FAIL  ${f}\n        ${msg}`);
    if (e.detail) console.log(`        detail: ${e.detail}`);
    if (e.hint) console.log(`        hint: ${e.hint}`);
    if (e.where) console.log(`        where: ${String(e.where).split("\n")[0]}`);
  }
}

console.log(`\n${files.length - failed}/${files.length} migrations applied`);
if (skippedExclusions.length)
  console.log(`exclusion constraints NOT verified here (need btree_gist): ${skippedExclusions.join(", ")}`);

if (!failed) {
  const t = await db.query(
    `select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`);
  const v = await db.query(
    `select count(*)::int n from information_schema.views where table_schema='public'`);
  const fn = await db.query(
    `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`);
  const pol = await db.query(`select count(*)::int n from pg_policies where schemaname='public'`);
  console.log(`tables=${t.rows[0].n} views=${v.rows[0].n} functions=${fn.rows[0].n} policies=${pol.rows[0].n}`);
}

process.exit(failed ? 1 : 0);
