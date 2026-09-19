/**
 * Migration 0088 · a signed session note is what completes a session.
 *
 * These run the SHIPPED migration files, in order, in PGlite - so what is
 * asserted below is the behaviour of the SQL that will be applied, not a
 * restatement of it. Change 0088 and these fail.
 *
 * WHY THIS MATTERS MORE THAN A DASHBOARD STAT. `sessions.status =
 * 'completed'` is the first link of the billing chain: 0031's
 * derive_pending_session_deliveries() processes only completed sessions, and
 * what it writes reaches a time entry, a budget charge, and the receipt that
 * carries a clinician's credential number (0034). Before 0088 nothing ever
 * set that value, so none of it had ever run. These cases are therefore about
 * when money becomes derivable, which is why the refusals matter as much as
 * the happy path.
 *
 * NOT tested here: RLS. Everything runs as the superuser, who bypasses row
 * security. Who is *allowed* to write a note is session_notes' own policies,
 * covered in rls.mjs; this file is about what a note does once written.
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

let pass = 0, fail = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); pass++; results.push(`  PASS ${name}`); }
  catch (e) { fail++; results.push(`  FAIL ${name}\n         ${String(e.message || e).split("\n")[0]}`); }
}
function eq(actual, expected, what = "") {
  if (String(actual) !== String(expected))
    throw new Error(`${what}: expected ${expected}, got ${actual}`);
}
async function throws(sql, pattern, what) {
  try { await db.exec(sql); }
  catch (e) { if (!pattern.test(e.message)) throw new Error(`${what}: wrong error "${e.message.split("\n")[0]}"`); return; }
  throw new Error(`${what}: expected a refusal, got none`);
}
const one = async (sql) => (await db.query(sql)).rows[0];

// --------------------------------------------------------------------------
// Two clinics, so the cross-tenant refusal is tested rather than assumed.
// --------------------------------------------------------------------------
const clinicA = (await one(`insert into clinics (name, slug) values ('Clinic A','a') returning id`)).id;
const clinicB = (await one(`insert into clinics (name, slug) values ('Clinic B','b') returning id`)).id;

const staffA = (await one(
  `insert into staff (name, clinic_id, capacity) values ('Ann','${clinicA}', 20) returning id`)).id;
const clientA = (await one(
  `insert into clients (name, status, clinic_id) values ('Child A','active','${clinicA}') returning id`)).id;
const clientB = (await one(
  `insert into clients (name, status, clinic_id) values ('Child B','active','${clinicB}') returning id`)).id;
const typeA = (await one(
  `insert into session_types (name, duration, clinic_id) values ('Therapy A', 60, '${clinicA}') returning id`)).id;

const clinician = (await one(
  `insert into auth.users (email) values ('clinician@a.test') returning id`)).id;
// NOTE: no `email` column here. 0000's reconstruction of `profiles` omits
// it; production has it NOT NULL. Second measured divergence between that
// file and the deployed schema, after sessions.created_at.
await db.exec(
  `insert into profiles (id, email, full_name, role, clinic_id)
   values ('${clinician}', 'clinician@a.test', 'A Clinician', 'clinician', '${clinicA}')`);

let day = 1;
async function mkSession(status = "scheduled", clinic = clinicA, client = clientA) {
  day += 1;
  return (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute,
                           session_type_id, status, clinic_id)
     values (${client}, ${clinic === clinicA ? staffA : "null"},
             '2026-10-${String(day).padStart(2, "0")}', 9, 0,
             ${clinic === clinicA ? `'${typeA}'` : "null"}, '${status}', '${clinic}')
     returning id`)).id;
}
const noteFor = (session, client, clinic, status) =>
  `insert into session_notes (session_id, client_id, clinician_id, clinic_id, status, body)
   values (${session}, ${client}, '${clinician}', '${clinic}', '${status}', '{}'::jsonb)`;
const statusOf = async (id) => (await one(`select status from sessions where id=${id}`)).status;

console.log("\n0088 — a signed note completes its session\n");

// --------------------------------------------------------------------------
console.log("The happy path, and where billing becomes derivable");

await check("a draft note leaves the session scheduled", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "draft"));
  eq(await statusOf(s), "scheduled", "a draft confirms nothing");
});

await check("signing the note completes the session", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "draft"));
  await db.exec(`update session_notes set status='signed' where session_id=${s}`);
  eq(await statusOf(s), "completed", "signed");
});

await check("a note inserted already signed completes it too", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  eq(await statusOf(s), "completed", "inserted signed");
});

await check("signing is enough — it does not wait for a countersignature", async () => {
  // The account owner's decision, 2026-09-19. Not every note is
  // countersigned; gating on it would leave those sessions never completing.
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  eq(await statusOf(s), "completed", "billable on signature alone");
});

await check("countersigning does not disturb an already-completed session", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  await db.exec(`update session_notes set status='awaiting_countersign' where session_id=${s}`);
  eq(await statusOf(s), "completed", "still completed at awaiting_countersign");
  await db.exec(`update session_notes set status='countersigned' where session_id=${s}`);
  eq(await statusOf(s), "completed", "still completed at countersigned");
});

await check("a completed session is what 0031 will actually pick up", async () => {
  // The point of the whole migration: prove the value written is the value
  // derive_pending_session_deliveries() selects on, rather than trusting that
  // 'completed' is spelled the same in both places.
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  const n = (await one(
    `select count(*)::int n from sessions
      where id=${s} and clinic_id='${clinicA}' and status = 'completed'`)).n;
  eq(n, 1, "selectable by the derivation's own predicate");
});

// --------------------------------------------------------------------------
console.log("\nWithdrawing the note takes the session back");

await check("returning a signed note un-completes the session", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  eq(await statusOf(s), "completed", "completed first");
  await db.exec(`update session_notes set status='returned' where session_id=${s}`);
  eq(await statusOf(s), "scheduled", "a withdrawn note leaves nothing billable");
});

await check("reverting a note to draft un-completes it", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  await db.exec(`update session_notes set status='draft' where session_id=${s}`);
  eq(await statusOf(s), "scheduled", "back to draft");
});

await check("deleting a signed note un-completes it", async () => {
  const s = await mkSession();
  await db.exec(noteFor(s, clientA, clinicA, "signed"));
  await db.exec(`delete from session_notes where session_id=${s}`);
  eq(await statusOf(s), "scheduled", "deleted");
});

await check("returning a note that never completed anything changes nothing", async () => {
  const s = await mkSession("cancelled");
  await db.exec(noteFor(s, clientA, clinicA, "draft"));
  await db.exec(`update session_notes set status='returned' where session_id=${s}`);
  eq(await statusOf(s), "cancelled", "cancelled stays cancelled");
});

// --------------------------------------------------------------------------
console.log("\nWhat it refuses");

await check("a note cannot confirm a cancelled session", async () => {
  const s = await mkSession("cancelled");
  await throws(noteFor(s, clientA, clinicA, "signed"),
    /marked cancelled/, "cancelled is a human statement, not a default");
  eq(await statusOf(s), "cancelled", "left alone");
});

await check("a note cannot confirm a no-show", async () => {
  const s = await mkSession("no_show");
  await throws(noteFor(s, clientA, clinicA, "signed"),
    /marked no_show/, "no_show is a human statement");
  eq(await statusOf(s), "no_show", "left alone");
});

await check("a note cannot confirm another clinic's session", async () => {
  const s = await mkSession("scheduled", clinicB, clientB);
  await throws(noteFor(s, clientB, clinicA, "signed"),
    /another clinic/, "the clinic check is the tenancy boundary");
  eq(await statusOf(s), "scheduled", "clinic B's session untouched");
});

await check("a note pointing at no session at all is refused", async () => {
  // session_notes.session_id has no foreign key, so this is reachable.
  await throws(noteFor(999999, clientA, clinicA, "signed"),
    /does not exist/, "an orphan note confirms nothing");
});

// --------------------------------------------------------------------------
console.log("\nThe assumption this rests on");

await check("session_id is unique, so one note decides one session", async () => {
  // The reversal logic never asks "does another note still confirm this?"
  // because it cannot happen. If this index is dropped, 0088 must change.
  const n = (await one(
    `select count(*)::int n from pg_indexes
      where schemaname='public' and tablename='session_notes'
        and indexdef ilike '%unique%' and indexdef ilike '%(session_id)%'`)).n;
  eq(n, 1, "session_notes_session_id_key");
});

await check("the trigger is security definer and names pg_temp last", async () => {
  const r = await one(
    `select p.prosecdef, array_to_string(p.proconfig, ',') as cfg
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname='public' and p.proname='apply_session_note_completion'`);
  eq(r.prosecdef, true, "definer, so a blocked update cannot silently no-op");
  if (!/search_path=public, pg_temp/.test(r.cfg || ""))
    throw new Error(`search_path not pinned with pg_temp last: ${r.cfg}`);
});

console.log("\n" + results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
