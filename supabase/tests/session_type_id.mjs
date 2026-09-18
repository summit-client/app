/**
 * Migration 0085 · sessions.session_type_id, against a real Postgres.
 *
 * These run the SHIPPED migration files, in order, in PGlite - so what is
 * asserted below is the behaviour of the SQL that will be applied, not a
 * restatement of it. Change 0085 and these fail.
 *
 * What is actually being proved: a session type RENAME no longer detaches the
 * sessions booked under the old name. That is the defect - it is silent in
 * every direction (a LEFT join that misses, a `.find()` that returns
 * undefined, a `coalesce(duration, 60)`), and its expensive form is 0045's
 * double-booking check quietly measuring a 90-minute session as 60 minutes and
 * letting a real clash through.
 *
 * NOT tested here: RLS. Everything runs as the superuser, who bypasses row
 * security, same as behaviour.mjs. The trigger functions 0085 adds are plain
 * plpgsql running under the caller, so what matters about them is the logic,
 * which is what this exercises.
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

// --------------------------------------------------------------------------
// Fixture: two clinics, so cross-tenant claims can be tested rather than
// assumed. 0019 seeds each clinic a default session-type catalogue.
// --------------------------------------------------------------------------
const clinicA = (await one(`insert into clinics (name, slug) values ('Clinic A','a') returning id`)).id;
const clinicB = (await one(`insert into clinics (name, slug) values ('Clinic B','b') returning id`)).id;

const staffA = (await one(
  `insert into staff (name, clinic_id, capacity) values ('Ann','${clinicA}', 20) returning id`)).id;
const clientA = (await one(
  `insert into clients (name, status, clinic_id) values ('Child A','active','${clinicA}') returning id`)).id;

// A 90-minute type, deliberately longer than the 60-minute fallback 0045 uses
// when a lookup misses - that gap is what makes the rename bug cost something.
const longType = (await one(
  `insert into session_types (name, duration, clinic_id) values ('Long Assessment', 90, '${clinicA}') returning id`)).id;
const typeB = (await one(
  `insert into session_types (name, duration, clinic_id) values ('Clinic B Therapy', 60, '${clinicB}') returning id`)).id;

const book = async (hour, minute, extra = "") => (await one(
  `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id ${extra ? ", " + extra.split("=")[0] : ""})
   values ('${clientA}','${staffA}','2026-06-01',${hour},${minute},'Long Assessment','scheduled','${clinicA}'
           ${extra ? ", " + extra.split("=")[1] : ""})
   returning id`)).id;

// --------------------------------------------------------------------------
// The column and the backfill
// --------------------------------------------------------------------------
await check("0085 is the only migration adding sessions.session_type_id", () => {
  const owners = MIGRATIONS.filter((f) =>
    /alter\s+table\s+public\.sessions[\s\S]{0,120}session_type_id/i.test(readFileSync(join(DIR, f), "utf8")));
  eq(owners.length, 1, `files adding the column: ${owners.join(", ") || "none"}`);
  if (!owners[0].startsWith("0085")) throw new Error(`added by ${owners[0]}, not 0085`);
});

await check("a session written the old way, by name only, still writes", async () => {
  const id = await book(9, 0);
  const row = await one(`select type, session_type_id from sessions where id=${id}`);
  eq(row.type, "Long Assessment", "type");
  if (row.session_type_id !== null) throw new Error("a name-only write should not guess a pointer");
});

await check("the backfill resolves on (clinic_id, name), not on name alone", async () => {
  // Same NAME in both clinics. A backfill matching on name alone would attach
  // clinic A's session to clinic B's row.
  await db.exec(`insert into session_types (name, duration, clinic_id)
                 values ('Long Assessment', 45, '${clinicB}')`);
  await db.exec(`update sessions s set session_type_id = st.id
                   from session_types st
                  where st.clinic_id = s.clinic_id and st.name = s.type
                    and s.session_type_id is null`);
  const row = await one(`select s.session_type_id, st.clinic_id, st.duration
                           from sessions s join session_types st on st.id = s.session_type_id
                          where s.hour = 9 limit 1`);
  eq(row.clinic_id, clinicA, "attached to the wrong clinic's type");
  eq(row.duration, 90, "attached to the wrong row");
});

// --------------------------------------------------------------------------
// Write side: the pointer decides the name
// --------------------------------------------------------------------------
await check("setting the pointer writes the name for you", async () => {
  const id = (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-06-02',9,0,'scheduled','${clinicA}',${longType}) returning id`)).id;
  eq((await one(`select type from sessions where id=${id}`)).type, "Long Assessment", "derived name");
});

await check("the pointer wins an argument with a stale name", async () => {
  const id = (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-06-03',9,0,'Whatever The Client Sent','scheduled','${clinicA}',${longType}) returning id`)).id;
  eq((await one(`select type from sessions where id=${id}`)).type, "Long Assessment", "stale name survived");
});

await check("a session may not point at another clinic's session type", async () => {
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-06-04',9,0,'scheduled','${clinicA}',${typeB})`,
    /does not match its session type's clinic/, "cross-clinic pointer");
});

await check("a session with no pointer is left exactly as written", async () => {
  const id = (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values ('${clientA}','${staffA}','2026-06-05',9,0,'Something Not In The Catalogue','scheduled','${clinicA}') returning id`)).id;
  const row = await one(`select type, session_type_id from sessions where id=${id}`);
  eq(row.type, "Something Not In The Catalogue", "unrecognised name rewritten");
  if (row.session_type_id !== null) throw new Error("invented a pointer");
});

// --------------------------------------------------------------------------
// The rename - this is the whole point of 0085
// --------------------------------------------------------------------------
await check("a rename carries to every session holding the old name", async () => {
  await db.exec(`update session_types set name='Long Assessment (1:1)' where id=${longType}`);
  const stale = await one(
    `select count(*)::int n from sessions where session_type_id=${longType} and type <> 'Long Assessment (1:1)'`);
  eq(stale.n, 0, "sessions left holding the old name");
});

await check("after a rename the name join still resolves - 0029 and 0031 keep working", async () => {
  // This is literally 0031's join: `st.name = ses.type and st.clinic_id = ses.clinic_id`.
  // Before 0085 it returned zero for every renamed type.
  const r = await one(`select count(*)::int n
                         from sessions s
                         join session_types st on st.clinic_id = s.clinic_id and st.name = s.type
                        where s.session_type_id = ${longType}`);
  const total = await one(`select count(*)::int n from sessions where session_type_id = ${longType}`);
  if (total.n === 0) throw new Error("fixture has no pointed sessions to check");
  eq(r.n, total.n, "sessions detached from the catalogue by a rename");
});

await check("a rename does not touch a session pointing elsewhere", async () => {
  // 0019's per-clinic catalogue seed ran before this fixture's clinics
  // existed, so clinic A holds only what this file inserts - make the second
  // type rather than assuming one is there.
  const name = 'Short Therapy';
  const other = (await one(`insert into session_types (name, duration, clinic_id)
                            values ('${name}', 30, '${clinicA}') returning id`)).id;
  const id = (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-06-06',9,0,'scheduled','${clinicA}',${other}) returning id`)).id;
  await db.exec(`update session_types set name='Long Assessment (2:1)' where id=${longType}`);
  eq((await one(`select type from sessions where id=${id}`)).type, name, "unrelated session rewritten");
});

// --------------------------------------------------------------------------
// 0045's double-booking check, which is what the rename actually broke
// --------------------------------------------------------------------------
await check("the overlap check reads the duration through the pointer, after a rename", async () => {
  // 10:00 for 90 minutes, pointed at the (twice-renamed) long type.
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-07-01',10,0,'scheduled','${clinicA}',${longType})`);
  // 11:00 is inside 10:00-11:30 and must be refused. If the duration lookup
  // had missed and fallen back to 60 minutes, 10:00-11:00 would have ended
  // exactly as this one starts and this write would have been ALLOWED - which
  // is the bug, in its expensive form.
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-07-01',11,0,'scheduled','${clinicA}',${longType})`,
    /overlapping session/, "90-minute overlap");
});

await check("a name-only session still gets its duration, so nothing regressed", async () => {
  const name = (await one(`select name from session_types where id=${longType}`)).name;
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values ('${clientA}','${staffA}','2026-07-02',10,0,'${name}','scheduled','${clinicA}')`);
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values ('${clientA}','${staffA}','2026-07-02',11,0,'${name}','scheduled','${clinicA}')`,
    /overlapping session/, "name-only 90-minute overlap");
});

await check("a non-overlapping booking is still allowed", async () => {
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-07-03',14,0,'scheduled','${clinicA}',${longType})`);
  eq((await one(`select count(*)::int n from sessions where session_date='2026-07-03'`)).n, 1, "refused a clear slot");
});

await check("the early return does not let a real move through", async () => {
  // Moving an existing session ONTO an occupied slot changes hour, so the
  // skip cannot apply and the check must still refuse.
  const id = (await one(`select id from sessions where session_date='2026-07-03' limit 1`)).id;
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-07-03',9,0,'scheduled','${clinicA}',${longType})`);
  await throws(
    `update sessions set hour=9, minute=0 where id=${id}`,
    /overlapping session|duplicate key/, "moving onto an occupied slot");
});

await check("cancelling still skips the check", async () => {
  const id = (await one(`select id from sessions where session_date='2026-07-03' and hour=14 limit 1`)).id;
  await db.exec(`update sessions set status='cancelled' where id=${id}`);
  eq((await one(`select status from sessions where id=${id}`)).status, "cancelled", "cancel refused");
});

// --------------------------------------------------------------------------
// The catalogue's own guarantees
// --------------------------------------------------------------------------
await check("a clinic cannot have two session types with the same name", async () => {
  await throws(
    `insert into session_types (name, duration, clinic_id)
     values ((select name from session_types where id=${longType}), 30, '${clinicA}')`,
    /session_types_clinic_name_uniq|duplicate key/, "duplicate name");
});

await check("two clinics may each have a type of the same name", async () => {
  await db.exec(`insert into session_types (name, duration, clinic_id) values ('Shared Name', 30, '${clinicA}')`);
  await db.exec(`insert into session_types (name, duration, clinic_id) values ('Shared Name', 30, '${clinicB}')`);
  eq((await one(`select count(*)::int n from session_types where name='Shared Name'`)).n, 2, "cross-clinic name");
});

await check("deleting a session type clears the pointer and keeps the label", async () => {
  const doomed = (await one(
    `insert into session_types (name, duration, clinic_id) values ('Retiring Type', 30, '${clinicA}') returning id`)).id;
  const id = (await one(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, status, clinic_id, session_type_id)
     values ('${clientA}','${staffA}','2026-08-01',9,0,'scheduled','${clinicA}',${doomed}) returning id`)).id;
  await db.exec(`delete from session_types where id=${doomed}`);
  const row = await one(`select type, session_type_id from sessions where id=${id}`);
  if (row.session_type_id !== null) throw new Error("pointer survived the delete");
  eq(row.type, "Retiring Type", "label lost with the pointer");
});

// --------------------------------------------------------------------------
// sessions_visible() publishes the key
// --------------------------------------------------------------------------
await check("visible_session carries session_type_id", async () => {
  const cols = (await db.query(
    `select a.attname from pg_attribute a
      join pg_type t on t.typrelid = a.attrelid
     where t.typname = 'visible_session' and a.attnum > 0
     order by a.attnum`)).rows.map((r) => r.attname);
  if (!cols.includes("session_type_id")) throw new Error(`published columns: ${cols.join(", ")}`);
  if (cols.includes("created_at")) throw new Error("created_at republished - 0077 measured it as absent from the live table");
});

await check("sessions_visible still masks, and still excludes created_at", async () => {
  const src = readFileSync(join(DIR, "0085_sessions_session_type_id.sql"), "utf8");
  if (!/client_masked/.test(src)) throw new Error("client_masked dropped from the republished type");
  if (!/case when m\.may then s\.client_id end/.test(src)) throw new Error("the client_id mask is gone");
  if (!/case when m\.may then s\.home_address end/.test(src)) throw new Error("the home_address mask is gone");
});

// --------------------------------------------------------------------------
// The file's own safety properties, read out of the shipped SQL
// --------------------------------------------------------------------------
await check("0085 runs as one transaction", () => {
  const src = readFileSync(join(DIR, "0085_sessions_session_type_id.sql"), "utf8");
  if (!/^begin;$/m.test(src)) throw new Error("no begin");
  if (!/^commit;$/m.test(src)) throw new Error("no commit");
  const body = src.slice(src.indexOf("\nbegin;"), src.indexOf("\ncommit;"));
  if (!/drop type if exists public\.visible_session cascade/.test(body))
    throw new Error("the type drop is outside the transaction");
});

await check("0085 refuses to run against duplicate type names", () => {
  const src = readFileSync(join(DIR, "0085_sessions_session_type_id.sql"), "utf8");
  if (!/raise exception[\s\S]{0,200}duplicate \(clinic_id, name\)/.test(src))
    throw new Error("no duplicate guard");
});

await check("0085 re-enables the triggers it turns off", () => {
  const src = readFileSync(join(DIR, "0085_sessions_session_type_id.sql"), "utf8");
  const off = src.indexOf("disable trigger user");
  const on = src.indexOf("enable trigger user");
  if (off === -1) throw new Error("no disable");
  if (on === -1 || on < off) throw new Error("disabled without a re-enable after it");
});

await check("the foreign key is set null, not restrict", () => {
  const src = readFileSync(join(DIR, "0085_sessions_session_type_id.sql"), "utf8");
  if (!/references public\.session_types\(id\) on delete set null/.test(src))
    throw new Error("delete behaviour changed - see 0085's header on why it is set null");
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
