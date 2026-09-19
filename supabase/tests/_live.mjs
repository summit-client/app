/**
 * The two ways this repo reads the live database, and the one way it builds a
 * database from the migration files. Extracted from tenancy.mjs so
 * schema_drift.mjs uses the same transports rather than a second copy that
 * drifts from it - which is the exact failure both of those suites exist to
 * catch, and it would be absurd to reproduce it here.
 *
 * SUPABASE_DB_URL    a Postgres connection string. PREFERRED. Point it at a
 *                    role that can connect and read catalogs and nothing else
 *                    (README has the SQL). Leak it and somebody learns what
 *                    your schema says.
 *
 * SUPABASE_ACCESS_TOKEN   a Supabase personal access token. Works, and is
 *                    ACCOUNT-WIDE with write access. Fine from your own
 *                    machine, a poor thing to store in CI.
 *
 * Read-only either way by construction - every caller issues SELECTs against
 * catalogs - but only the first is read-only by PERMISSION.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const REF = process.env.SUPABASE_PROJECT_REF || "xbkokyxegrxutppolgtz";

/** The Supabase stubs every suite needs before the migrations will apply. */
export const AUTH_STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
  do $do$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $do$;`;

/** A database built from the migration files, in PGlite. */
export async function fromFiles(dir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(AUTH_STUBS);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  return async (sql) => (await db.query(sql)).rows;
}

/** psql, one round trip per query, JSON in and out. */
export function fromConnection(url) {
  return async (sql) => {
    // Wrapped so Postgres does the serialising - parsing psql's own column
    // output would break on any value containing the separator, and type
    // names and policy predicates are full of punctuation.
    const wrapped = `select coalesce(json_agg(row_to_json(x)), '[]'::json)::text from (${sql}) x`;
    const out = execFileSync("psql", [url, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", wrapped],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(out.trim() || "[]");
  };
}

/** The Supabase Management API, with the account-wide token. */
export function fromManagementApi(token) {
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

/**
 * Whichever credential is available, preferring the scoped one. Refuses to
 * fall back to the migration files: a check that reports clean on a database
 * it cannot see is how two unscoped policies went unnoticed for weeks.
 */
export function fromProduction(what = "this check") {
  const url = process.env.SUPABASE_DB_URL;
  if (url) return fromConnection(url);
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      `FAIL: ${what} needs the live database and neither SUPABASE_DB_URL nor\n` +
      "      SUPABASE_ACCESS_TOKEN is set. Refusing to report on a database\n" +
      "      this process cannot see. supabase/tests/README.md has the SQL\n" +
      "      that creates the scoped read-only role.");
    process.exit(1);
  }
  console.log("  (using SUPABASE_ACCESS_TOKEN - account-wide. SUPABASE_DB_URL with a");
  console.log("   read-only role is the safer credential; see README.)");
  return fromManagementApi(token);
}
