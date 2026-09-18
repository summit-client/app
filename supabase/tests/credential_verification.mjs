/**
 * Migration 0086 · credential vocabulary and verification, against a real
 * Postgres.
 *
 * Runs the SHIPPED migration files in order in PGlite, so these assert the
 * behaviour of the SQL that will be applied rather than a restatement of it.
 *
 * The one that matters: until 0086, `credentials_own_update` let a person set
 * their own credential to GOOD_STANDING, and 0034's receipt view puts a
 * GOOD_STANDING credential number on a client's receipt. So a self-entered,
 * self-approved number was printing under a clinician's name as the clinic's
 * assertion of who delivered the service. The last group below is that whole
 * path, end to end.
 *
 * NOT tested here: RLS. Everything runs as the superuser, who bypasses row
 * security, same as behaviour.mjs. That is fine for this file, because the
 * rule 0086 turns on is a TRIGGER and triggers run for the superuser too -
 * which is itself worth knowing: it holds for a service-role write, not only
 * for a policy-filtered one.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
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
  end $do$;
`);

const MIGRATIONS = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
for (const f of MIGRATIONS) await db.exec(readFileSync(join(DIR, f), "utf8"));

// --------------------------------------------------------------------------
let pass = 0, fail = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); pass++; results.push(`  PASS ${name}`); }
  catch (e) { fail++; results.push(`  FAIL ${name}\n         ${String(e.message || e).split("\n")[0]}`); }
}
function eq(actual, expected, what = "") {
  const a = typeof actual === "string" ? Number(actual) : actual;
  const b = typeof expected === "string" ? Number(expected) : expected;
  if (a !== b && String(actual) !== String(expected))
    throw new Error(`${what}: expected ${expected}, got ${actual}`);
}
async function throws(sql, pattern, what) {
  try { await db.exec(sql); }
  catch (e) { if (!pattern.test(e.message)) throw new Error(`${what}: wrong error "${e.message.split("\n")[0]}"`); return; }
  throw new Error(`${what}: expected a refusal, got none`);
}
const one = async (sql) => (await db.query(sql)).rows[0];
const be = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);

// --------------------------------------------------------------------------
// Fixture. 0086's catalogue seed runs against the clinics that exist WHEN IT
// APPLIES, and these clinics are created afterwards - so the types are
// inserted here rather than assumed.
// --------------------------------------------------------------------------
const clinicA = (await one(`insert into clinics (name, slug) values ('Clinic A','a') returning id`)).id;
const clinicB = (await one(`insert into clinics (name, slug) values ('Clinic B','b') returning id`)).id;

const people = {};
for (const [key, role, clinic] of [
  ["admin", "admin", clinicA], ["supervisor", "supervisor", clinicA],
  ["clinician", "clinician", clinicA], ["scheduler", "scheduler", clinicA],
]) {
  const u = (await one(`insert into auth.users (email) values ('${key}@t.test') returning id`)).id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id) values ('${u}','${key}','${role}','${clinic}')`);
  people[key] = u;
}
await db.exec(`update profiles set supervisor_id='${people.supervisor}' where id='${people.clinician}'`);

const typeA = (await one(
  `insert into credential_types (clinic_id, code, label, issuer) values ('${clinicA}','BCBA','BCBA / BCBA-D','BACB') returning id`)).id;
const rbtA = (await one(
  `insert into credential_types (clinic_id, code, label, issuer) values ('${clinicA}','RBT','RBT','BACB') returning id`)).id;
const typeB = (await one(
  `insert into credential_types (clinic_id, code, label, issuer) values ('${clinicB}','BCBA','BCBA / BCBA-D','BACB') returning id`)).id;

const addCredential = async (uid, typeId, number, clinic = clinicA) => (await one(
  `insert into employee_credentials (clinic_id, user_id, credential_type_id, credential_number, cycle_start, cycle_end)
   values ('${clinic}','${uid}',${typeId ? `'${typeId}'` : "null"},${number ? `'${number}'` : "null"},'2026-01-01','2027-12-31')
   returning id`)).id;

// --------------------------------------------------------------------------
// The catalogue
// --------------------------------------------------------------------------
await check("0086 is the only migration creating credential_types", () => {
  const owners = MIGRATIONS.filter((f) =>
    /create table if not exists credential_types/i.test(readFileSync(join(DIR, f), "utf8")));
  eq(owners.length, 1, `files creating it: ${owners.join(", ") || "none"}`);
  if (!owners[0].startsWith("0086")) throw new Error(`created by ${owners[0]}`);
});

await check("the seed covers the seven real credential kinds", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  for (const code of ["BCBA", "BCaBA", "RBT", "ONT_RBA", "IBA_PRECERT", "IBA_RECERT", "IBT"]) {
    if (!new RegExp(`'${code}'`).test(src)) throw new Error(`${code} missing from the seed`);
  }
  // "Supervisor" was in apps/scheduler's 4-item list and is NOT a credential.
  if (/\('Supervisor',/.test(src)) throw new Error("'Supervisor' seeded as a credential type");
});

await check("a clinic cannot have the same code twice", async () => {
  await throws(
    `insert into credential_types (clinic_id, code, label) values ('${clinicA}','BCBA','Duplicate')`,
    /credential_types_code_per_clinic|duplicate key/, "duplicate code");
});

await check("two clinics may each have BCBA", async () => {
  eq((await one(`select count(*)::int n from credential_types where code='BCBA'`)).n, 2, "cross-clinic code");
});

await check("setting the pointer writes the code for you", async () => {
  await be(people.admin);
  const id = await addCredential(people.clinician, typeA, "1-24-12345");
  eq((await one(`select credential from employee_credentials where id='${id}'`)).credential, "BCBA", "derived code");
});

await check("a credential may not point at another clinic's type", async () => {
  await be(people.admin);
  await throws(
    `insert into employee_credentials (clinic_id, user_id, credential_type_id, cycle_start, cycle_end)
     values ('${clinicA}','${people.supervisor}','${typeB}','2026-01-01','2027-12-31')`,
    /does not match its credential type's clinic/, "cross-clinic credential type");
});

await check("renaming a catalogue code carries to the credentials holding it", async () => {
  await db.exec(`update credential_types set code='BCBA-D' where id='${rbtA}'`);
  await db.exec(`update credential_types set code='RBT' where id='${rbtA}'`);
  const id = await addCredential(people.scheduler, rbtA, "RBT-9");
  await db.exec(`update credential_types set code='RBT-2' where id='${rbtA}'`);
  eq((await one(`select credential from employee_credentials where id='${id}'`)).credential, "RBT-2", "stale code");
  await db.exec(`update credential_types set code='RBT' where id='${rbtA}'`);
});

// --------------------------------------------------------------------------
// Verification - the rule
// --------------------------------------------------------------------------
await check("a newly entered credential is PENDING, never verified", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-55555");
  const row = await one(`select status, verified_by, verified_at from employee_credentials where id='${id}'`);
  eq(row.status, "PENDING", "status");
  if (row.verified_by !== null || row.verified_at !== null) throw new Error("verified on insert");
});

await check("entering one AS someone else is still PENDING - confirmation is a separate act", async () => {
  await be(people.admin);
  const id = await addCredential(people.supervisor, typeA, "1-24-66666");
  eq((await one(`select status from employee_credentials where id='${id}'`)).status, "PENDING", "admin-entered status");
});

await check("a person cannot verify their own credential", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-77777");
  await throws(
    `update employee_credentials set status='GOOD_STANDING' where id='${id}'`,
    /cannot be verified by the person it belongs to/, "self-verification");
});

await check("an ADMIN cannot verify their own credential either - the rule is not about role", async () => {
  await be(people.admin);
  const id = await addCredential(people.admin, typeA, "1-24-88888");
  await throws(
    `update employee_credentials set status='GOOD_STANDING' where id='${id}'`,
    /cannot be verified by the person it belongs to/, "admin self-verification");
});

await check("somebody else verifying stamps who and when", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-99999");
  await be(people.supervisor);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where id='${id}'`);
  const row = await one(`select status, verified_by, verified_at from employee_credentials where id='${id}'`);
  eq(row.status, "GOOD_STANDING", "status");
  eq(row.verified_by, people.supervisor, "verifier");
  if (!row.verified_at) throw new Error("verified_at not stamped");
});

await check("the verifier cannot be forged on the way through", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-10101");
  await be(people.supervisor);
  // Claim the admin did it.
  await db.exec(`update employee_credentials set status='GOOD_STANDING', verified_by='${people.admin}' where id='${id}'`);
  eq((await one(`select verified_by from employee_credentials where id='${id}'`)).verified_by,
     people.supervisor, "a forged verifier was accepted");
});

await check("changing the number after verification drops it back to PENDING", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-20202");
  await be(people.supervisor);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where id='${id}'`);
  await be(people.clinician);
  await db.exec(`update employee_credentials set credential_number='1-24-30303' where id='${id}'`);
  const row = await one(`select status, verified_by, verified_at from employee_credentials where id='${id}'`);
  eq(row.status, "PENDING", "status after amendment");
  if (row.verified_by !== null || row.verified_at !== null)
    throw new Error("the old verification survived a new number");
});

await check("moving the cycle also invalidates the verification", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-40404");
  await be(people.supervisor);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where id='${id}'`);
  await db.exec(`update employee_credentials set cycle_end='2028-12-31' where id='${id}'`);
  eq((await one(`select status from employee_credentials where id='${id}'`)).status, "PENDING", "status after a new cycle");
});

await check("marking one LAPSED keeps the verification record", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-50505");
  await be(people.supervisor);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where id='${id}'`);
  await db.exec(`update employee_credentials set status='LAPSED' where id='${id}'`);
  const row = await one(`select status, verified_by from employee_credentials where id='${id}'`);
  eq(row.status, "LAPSED", "status");
  eq(row.verified_by, people.supervisor, "verifier lost on lapse");
});

// --------------------------------------------------------------------------
// Who may verify
// --------------------------------------------------------------------------
await check("supervisor, admin and hr_admin hold hr.credential.verify", async () => {
  for (const role of ["admin", "supervisor", "hr_admin"]) {
    const r = await one(`select granted from role_permissions where role='${role}' and action='hr.credential.verify' and clinic_id is null`);
    if (!r || r.granted !== true) throw new Error(`${role}: ${r ? r.granted : "no row"}`);
  }
});

await check("scheduler is explicitly DENIED it, not merely absent", async () => {
  const r = await one(`select granted from role_permissions where role='scheduler' and action='hr.credential.verify' and clinic_id is null`);
  if (!r) throw new Error("no row at all - hub_can_manage() admits schedulers, so absence is not enough");
  eq(r.granted, false, "scheduler granted");
});

await check("a scheduler resolves auth_can('hr.credential.verify') to false", async () => {
  await be(people.scheduler);
  eq((await one(`select public.auth_can('hr.credential.verify') g`)).g, false, "scheduler can verify");
  await be(people.supervisor);
  eq((await one(`select public.auth_can('hr.credential.verify') g`)).g, true, "supervisor cannot verify");
});

await check("the action exposes neither PHI nor HR confidences", async () => {
  const r = await one(`select exposes_phi, exposes_hr_confidential from permission_actions where action='hr.credential.verify'`);
  eq(r.exposes_phi, false, "exposes_phi");
  eq(r.exposes_hr_confidential, false, "exposes_hr_confidential");
});

// --------------------------------------------------------------------------
// The receipt - why any of this matters
// --------------------------------------------------------------------------
await check("0034's receipt join reads status = GOOD_STANDING", () => {
  const src = readFileSync(join(DIR, "0034_receipt_identity.sql"), "utf8");
  if (!/from employee_credentials ec[\s\S]{0,200}status = 'GOOD_STANDING'/.test(src))
    throw new Error("0034 no longer keys the receipt's credential on GOOD_STANDING - this migration's premise has moved");
});

await check("0086 resets every pre-existing GOOD_STANDING to PENDING", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  if (!/update employee_credentials\s*\n\s*set status = 'PENDING'\s*\n\s*where status = 'GOOD_STANDING'/.test(src))
    throw new Error("the reset of self-asserted credentials is gone");
});

await check("an unverified credential reaches no receipt", async () => {
  await be(people.clinician);
  const id = await addCredential(people.clinician, typeA, "1-24-60606");
  eq((await one(`select count(*)::int n from employee_credentials
                  where id='${id}' and status='GOOD_STANDING' and credential_number is not null`)).n,
     0, "a PENDING credential satisfied 0034's receipt predicate");
  await be(people.supervisor);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where id='${id}'`);
  eq((await one(`select count(*)::int n from employee_credentials
                  where id='${id}' and status='GOOD_STANDING' and credential_number is not null`)).n,
     1, "a verified credential did not satisfy it");
});

// --------------------------------------------------------------------------
// staff.role, is_intake, clients.session_type_id
// --------------------------------------------------------------------------
await check("staff.role is gone", async () => {
  eq((await one(`select count(*)::int n from information_schema.columns
                  where table_schema='public' and table_name='staff' and column_name='role'`)).n, 0, "staff.role survived");
});

await check("staff.role's values are reported before the drop", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  const report = src.indexOf("staff.role %");
  const drop = src.indexOf("alter table staff drop column");
  if (report === -1) throw new Error("no report");
  if (drop === -1 || drop < report) throw new Error("dropped before reporting");
});

await check("nothing migrates staff.role into employee_credentials", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*(--|\*)/.test(l)).join("\n");
  if (/insert into employee_credentials[\s\S]{0,400}from\s+(public\.)?staff\b/i.test(code))
    throw new Error("unverified staff.role text was copied into the credential of record");
});

await check("bookability survives the drop - capacity is the other half", async () => {
  const s = (await one(
    `insert into staff (name, clinic_id, capacity) values ('Configured','${clinicA}', 20) returning id, capacity`));
  eq(s.capacity, 20, "capacity");
});

await check("session_types.is_intake exists and is seeded from 'Assessment'", async () => {
  const t = (await one(
    `insert into session_types (name, duration, clinic_id) values ('Initial Assessment', 90, '${clinicA}') returning id, is_intake`));
  // Inserted after the migration ran, so the seed does not touch it - the
  // flag is a column an admin owns from here, defaulting to false.
  eq(t.is_intake, false, "a new type defaulted to intake");
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  if (!/update session_types set is_intake = true[\s\S]{0,120}assessment/i.test(src))
    throw new Error("the seed from the literal 'Assessment' is missing");
});

await check("clients.session_type_id exists alongside the label", async () => {
  const cols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='clients'
        and column_name in ('session_type','session_type_id')`)).rows.map((r) => r.column_name).sort();
  eq(cols.join(","), "session_type,session_type_id", `columns: ${cols.join(",")}`);
});

// --------------------------------------------------------------------------
// The file's own safety properties
// --------------------------------------------------------------------------
await check("0086 runs as one transaction", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  if (!/^begin;$/m.test(src) || !/^commit;$/m.test(src)) throw new Error("not wrapped");
});

await check("credential_types policies are per command, never `for all`", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  const policies = [...src.matchAll(/create policy (\w+) on credential_types for (\w+)/g)];
  if (policies.length < 4) throw new Error(`only ${policies.length} policies`);
  for (const [, name, cmd] of policies) {
    if (cmd === "all") throw new Error(`${name} is 'for all' - CLAUDE.md forbids it on this schema`);
  }
});

await check("every credential_types policy is clinic-scoped", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  const blocks = src.split("create policy ").slice(1).filter((b) => b.startsWith("credential_types_"));
  for (const b of blocks) {
    const body = b.split(";")[0];
    if (!/clinic_id = auth_clinic_id\(\)/.test(body))
      throw new Error(`${body.split(" ")[0]} has no clinic predicate`);
  }
});

// These three are plain plpgsql, not `security definer` - matching 0016,
// 0045 and 0085 on the tables they guard, so they run under the caller. The
// search_path pin still matters: CLAUDE.md's rule exists because temp-table
// shadowing was exploited on this schema (0009), and `set search_path =
// public` alone does not exclude pg_temp.
await check("the trigger functions pin pg_temp last", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  for (const fn of ["apply_credential_type_code", "propagate_credential_type_code", "guard_credential_verification"]) {
    const m = src.match(new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]{0,200}?set search_path = ([^\\n]*)`));
    if (!m) throw new Error(`${fn}: no search_path`);
    const path = m[1].replace(/\s+as\s+\$\$\s*$/, "").trim();
    if (path !== "public, pg_temp") throw new Error(`${fn}: search_path is "${path}"`);
  }
});

await check("none of them is security definer - they run under the caller", () => {
  const src = readFileSync(join(DIR, "0086_credential_vocabulary_and_verification.sql"), "utf8");
  for (const fn of ["apply_credential_type_code", "propagate_credential_type_code", "guard_credential_verification"]) {
    const body = src.slice(src.indexOf(`function public.${fn}()`));
    const head = body.slice(0, body.indexOf("$$"));
    if (/security definer/.test(head)) throw new Error(`${fn} is security definer`);
  }
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
