/**
 * Behavioural tests for the workforce layer, run against a real Postgres.
 *
 * Migrations applying is not the same as rules working. This exercises the
 * things that would actually cost money or leak data if they were wrong:
 * permission resolution, the HR boundary, the ESA overtime split, the
 * append-only event stream, timesheet transitions, and budget arithmetic.
 *
 * The overtime cases are deliberately the SAME cases as
 * packages/workforce/esa.test.ts. That library and these views implement one
 * rule twice, and the only way that is safe is if both are checked against
 * the same specification.
 *
 * NOT tested here: RLS enforcement. Everything in this file runs as the
 * superuser, who bypasses row security, so what it proves about permissions is
 * about the FUNCTIONS the policies call rather than the policies themselves.
 * That is deliberate — it keeps these tests about the rules — and rls.mjs
 * covers the other half by running as `authenticated` with a JWT claim set.
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

for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(DIR, f), "utf8");
  await db.exec(sql);
}

// --------------------------------------------------------------------------
let pass = 0, fail = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); pass++; results.push(`ok    ${name}`); }
  catch (e) { fail++; results.push(`FAIL  ${name}\n        ${String(e.message || e).split("\n")[0]}`); }
}
function eq(actual, expected, what = "") {
  const a = typeof actual === "string" ? Number(actual) : actual;
  const b = typeof expected === "string" ? Number(expected) : expected;
  if (a !== b && String(actual) !== String(expected))
    throw new Error(`${what} expected ${expected}, got ${actual}`);
}
async function throws(sql, pattern, what) {
  try { await db.exec(sql); }
  catch (e) { if (!pattern.test(e.message)) throw new Error(`${what}: wrong error "${e.message.split("\n")[0]}"`); return; }
  throw new Error(`${what}: expected a refusal, got none`);
}
const be = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const one = async (sql) => (await db.query(sql)).rows[0];

// --------------------------------------------------------------------------
// Fixture: one clinic, five people, one client.
// --------------------------------------------------------------------------
const clinic = (await one(`insert into clinics (name, slug) values ('Test Clinic','test') returning id`)).id;

const people = {};
for (const [key, role] of Object.entries({
  admin: "admin", supervisor: "supervisor", clinician: "clinician",
  hr: "hr_admin", payroll: "payroll_admin",
})) {
  const u = (await one(`insert into auth.users (email) values ('${key}@t.test') returning id`)).id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id)
                 values ('${u}', '${key}', '${role}', '${clinic}')`);
  people[key] = u;
}
// The clinician reports to the supervisor; the admin does not.
await db.exec(`update profiles set supervisor_id='${people.supervisor}' where id='${people.clinician}'`);

const client = (await one(
  `insert into clients (name, status, clinic_id) values ('Test Child','active','${clinic}') returning id`)).id;

// --------------------------------------------------------------------------
// 0024 · permission resolution
// --------------------------------------------------------------------------
await check("auth_can grants what the role's seed grants", async () => {
  await be(people.clinician);
  eq((await one(`select public.auth_can('clinical.session.run') g`)).g, true, "clinician runs sessions");
  eq((await one(`select public.auth_can('finance.payroll.run') g`)).g, false, "clinician runs payroll");
});

await check("a clinical role holds no HR record action", async () => {
  await be(people.clinician);
  eq((await one(`select public.auth_can('hr.record.read') g`)).g, false, "clinician reads HR");
  await be(people.supervisor);
  eq((await one(`select public.auth_can('hr.record.read') g`)).g, false, "supervisor reads HR records");
});

await check("an HR role holds no clinical action, and no pay rates", async () => {
  await be(people.hr);
  eq((await one(`select public.auth_can('clinical.client.read') g`)).g, false, "hr reads clients");
  eq((await one(`select public.auth_can('clinical.note.write') g`)).g, false, "hr writes notes");
  eq((await one(`select public.auth_can('finance.payroll.read') g`)).g, false, "hr reads pay");
  eq((await one(`select public.auth_can('hr.record.read') g`)).g, true, "hr reads HR");
});

await check("a payroll role reads pay and nothing clinical", async () => {
  await be(people.payroll);
  eq((await one(`select public.auth_can('finance.payroll.read') g`)).g, true, "payroll reads pay");
  eq((await one(`select public.auth_can('clinical.client.read') g`)).g, false, "payroll reads clients");
  eq((await one(`select public.auth_can('hr.performance.read') g`)).g, false, "payroll reads performance");
});

await check("a per-user grant overrides the role, and expiry ends it", async () => {
  await db.exec(`insert into user_permission_grants (clinic_id, user_id, action, granted, reason)
                 values ('${clinic}','${people.clinician}','finance.rate.write', true, 'covering while payroll is away')`);
  await be(people.clinician);
  eq((await one(`select public.auth_can('finance.rate.write') g`)).g, true, "granted personally");

  await db.exec(`update user_permission_grants set expires_at = now() - interval '1 day'
                  where user_id='${people.clinician}'`);
  eq((await one(`select public.auth_can('finance.rate.write') g`)).g, false, "expired grant still live");
});

await check("a per-user grant can revoke what the role gives", async () => {
  await db.exec(`insert into user_permission_grants (clinic_id, user_id, action, granted, reason)
                 values ('${clinic}','${people.clinician}','clinical.report.generate', false, 'under review')`);
  await be(people.clinician);
  eq((await one(`select public.auth_can('clinical.report.generate') g`)).g, false, "revocation ignored");
});

await check("an action cannot expose PHI and HR confidences at once", async () => {
  await throws(
    `insert into permission_actions (action, domain, label, description, exposes_phi, exposes_hr_confidential)
     values ('bad.everything','admin','Bad','Both at once', true, true)`,
    /no_dual_exposure/, "dual exposure");
});

// --------------------------------------------------------------------------
// 0024 · the HR boundary, via hub_can_manage
// --------------------------------------------------------------------------
await check("hub_can_manage: behaviour preserved for the pre-existing roles", async () => {
  await be(people.admin);
  eq((await one(`select public.hub_can_manage('${people.clinician}') g`)).g, true, "admin manages");
  await be(people.supervisor);
  eq((await one(`select public.hub_can_manage('${people.clinician}') g`)).g, true, "supervisor manages own supervisee");
  eq((await one(`select public.hub_can_manage('${people.admin}') g`)).g, false, "supervisor manages a non-supervisee");
  await be(people.clinician);
  eq((await one(`select public.hub_can_manage('${people.supervisor}') g`)).g, false, "clinician manages anyone");
});

await check("hub_can_manage: 0022's grant to scheduler survives the rewrite", async () => {
  // Migration 0022 (on main) widened hub_can_manage to admit scheduler so the
  // Employee Hub's Admin console has something to show. 0024 redefines the same
  // function in terms of actions, and would silently take that back if the
  // scheduler seed did not carry hr.hub.manage. This is the test that says so.
  const u = (await one(`insert into auth.users (email) values ('sched@t.test') returning id`)).id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id)
                 values ('${u}','sched','scheduler','${clinic}')`);
  await be(u);
  eq((await one(`select public.hub_can_manage('${people.clinician}') g`)).g, true, "scheduler manages");
  // And it is scoped to the hub, not widened into employment or pay records.
  eq((await one(`select public.auth_can('hr.record.read') g`)).g, false, "scheduler reads HR records");
  eq((await one(`select public.auth_can('finance.payroll.read') g`)).g, false, "scheduler reads pay");
  eq((await one(`select public.auth_can('clinical.client.read') g`)).g, false, "scheduler reads clients");
});

await check("hub_can_manage: a clinician who supervises someone keeps their access", async () => {
  // 0006's version was `admin or supervises subject`, so a CLINICIAN with
  // someone reporting to them has always had this. The action rewrite must not
  // quietly narrow it to the 'supervisor' role.
  const u = (await one(`insert into auth.users (email) values ('leadclin@t.test') returning id`)).id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id)
                 values ('${u}','lead','clinician','${clinic}')`);
  const rep = (await one(`insert into auth.users (email) values ('reports@t.test') returning id`)).id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id, supervisor_id)
                 values ('${rep}','reports','clinician','${clinic}','${u}')`);
  await be(u);
  eq((await one(`select public.hub_can_manage('${rep}') g`)).g, true, "own supervisee");
  eq((await one(`select public.hub_can_manage('${people.admin}') g`)).g, false, "a non-supervisee");
});

await check("hub_can_manage: the new HR role now works, which is the point", async () => {
  await be(people.hr);
  eq((await one(`select public.hub_can_manage('${people.clinician}') g`)).g, true, "hr_admin manages");
  await be(people.payroll);
  eq((await one(`select public.hub_can_manage('${people.clinician}') g`)).g, false, "payroll manages HR");
});

await check("auth_may_read_hr_of always allows your own file", async () => {
  await be(people.clinician);
  eq((await one(`select public.auth_may_read_hr_of('${people.clinician}') g`)).g, true, "own file");
  eq((await one(`select public.auth_may_read_hr_of('${people.admin}') g`)).g, false, "someone else's file");
});

// --------------------------------------------------------------------------
// 0025 · the event stream
// --------------------------------------------------------------------------
await check("organization_events is append-only", async () => {
  await db.exec(`insert into organization_events
    (clinic_id, event_type, occurred_at, actor_id, subject_type, subject_employee)
    values ('${clinic}','employment.hired', now(), '${people.admin}','employee','${people.clinician}')`);
  await throws(`update organization_events set occurred_at = now()`, /append-only/, "update");
  await throws(`delete from organization_events`, /append-only/, "delete");
});

await check("an event's subject must match its catalogue entry", async () => {
  await throws(
    `insert into organization_events (clinic_id, event_type, occurred_at, subject_type)
     values ('${clinic}','employment.hired', now(), 'client')`,
    /is about a employee, not a client/, "wrong subject type");
  await throws(
    `insert into organization_events (clinic_id, event_type, occurred_at, subject_type)
     values ('${clinic}','employment.hired', now(), 'employee')`,
    /must name the employee/, "missing subject employee");
});

await check("an unknown event type is refused", async () => {
  await throws(
    `insert into organization_events (clinic_id, event_type, occurred_at, subject_type)
     values ('${clinic}','surveillance.keystrokes', now(), 'employee')`,
    /violates foreign key|Unknown event type/, "unknown type");
});

// --------------------------------------------------------------------------
// 0026 · employment
// --------------------------------------------------------------------------
const staffId = (await one(
  `insert into staff (name, clinic_id) values ('Test Clinician','${clinic}') returning id`)).id;
const employment = (await one(
  `insert into employment_records (clinic_id, user_id, staff_id, start_date)
   values ('${clinic}','${people.clinician}',${staffId},'2026-01-05') returning id`)).id;
await db.exec(`insert into employment_positions
  (clinic_id, employment_id, effective_from, position_title, employment_type, standard_weekly_hours, fte)
  values ('${clinic}','${employment}','2026-01-05','Behaviour Therapist','full_time',37.5,1.0)`);

await check("one open engagement per person", async () => {
  await throws(
    `insert into employment_records (clinic_id, user_id, start_date)
     values ('${clinic}','${people.clinician}','2026-06-01')`,
    /employment_records_one_open|duplicate key/, "second open engagement");
});

await check("a position cannot start before the employment does", async () => {
  await throws(
    `insert into employment_positions (clinic_id, employment_id, effective_from, position_title, employment_type)
     values ('${clinic}','${employment}','2025-12-01','Earlier','full_time')`,
    /before employment began/, "position before hire");
});

await check("an overtime exemption must state its basis", async () => {
  await throws(
    `insert into employment_positions (clinic_id, employment_id, effective_from, position_title, employment_type, overtime_exempt)
     values ('${clinic}','${employment}','2027-01-01','Director','full_time', true)`,
    /exempt_basis/, "unexplained exemption");
});

await check("an ended employment needs a reason", async () => {
  await throws(
    `update employment_records set end_date='2026-12-31' where id='${employment}'`,
    /end_reason/, "ended without a reason");
});

await check("current_employment derives scheduled weekly hours", async () => {
  const r = await one(`select * from current_employment where employment_id='${employment}'`);
  eq(r.scheduled_weekly_hours, 37.5, "scheduled hours");
  eq(r.on_leave, false, "on leave");
  eq(r.position_title, "Behaviour Therapist", "title");
});

// --------------------------------------------------------------------------
// 0028 · the ESA overtime split — the same cases as esa.test.ts
// --------------------------------------------------------------------------
const codeId = async (code) =>
  (await one(`select id from activity_codes where code='${code}' and clinic_id is null`)).id;
const DIRECT = await codeId("DIRECT");
const NOTES = await codeId("NOTES");
const HOLIDAY = await codeId("HOLIDAY");

const addTime = (date, hours, code = DIRECT, clientCol = null) =>
  db.exec(`insert into time_entries
    (clinic_id, employment_id, work_date, work_week_start, activity_code_id, minutes, client_id)
    values ('${clinic}','${employment}','${date}','1970-01-01','${code}',${Math.round(hours * 60)},
            ${clientCol ?? "null"})`);

await check("work_week_start is stamped by the database, not accepted from the caller", async () => {
  // Passed 1970-01-01 above; the trigger must overwrite it. 2026-03-11 is a
  // Wednesday, and the default declared week starts Sunday.
  await addTime("2026-03-11", 1, NOTES);
  // Compared as text on the SQL side. A Postgres `date` handed to JS becomes a
  // Date at UTC midnight, which renders as the PREVIOUS day anywhere west of
  // UTC — the same trap workWeekStart() in esa.ts exists to avoid, and it
  // caught this harness first.
  const r = await one(
    `select to_char(work_week_start,'YYYY-MM-DD') w from time_entries where work_date='2026-03-11'`);
  eq(r.w, "2026-03-08", "stamped week");
  await db.exec(`delete from time_entries`);
});

await check("no overtime at or below 44 hours", async () => {
  await db.exec(`delete from time_entries`);
  for (const d of ["09", "10", "11", "12", "13"]) await addTime(`2026-03-${d}`, 8, DIRECT, client);
  const r = await one(`select * from employee_work_weeks where employment_id='${employment}'`);
  eq(r.worked_hours, 40, "worked"); eq(r.overtime_hours, 0, "overtime"); eq(r.regular_hours, 40, "regular");
});

await check("overtime is the excess over 44 in a work week", async () => {
  await db.exec(`delete from time_entries`);
  for (const d of ["09", "10", "11", "12", "13"]) await addTime(`2026-03-${d}`, 10, DIRECT, client);
  const r = await one(`select * from employee_work_weeks where employment_id='${employment}'`);
  eq(r.worked_hours, 50, "worked"); eq(r.regular_hours, 44, "regular"); eq(r.overtime_hours, 6, "overtime");
});

await check("the work week decides overtime, not the pay period", async () => {
  await db.exec(`delete from time_entries`);
  for (const d of ["09", "10", "11", "12", "13", "14"]) await addTime(`2026-03-${d}`, 10, DIRECT, client);
  await addTime("2026-03-16", 10, DIRECT, client);
  await addTime("2026-03-17", 10, DIRECT, client);
  const rows = (await db.query(
    `select work_week_start, worked_hours, overtime_hours from employee_work_weeks
      where employment_id='${employment}' order by work_week_start`)).rows;
  eq(rows.length, 2, "week count");
  eq(rows[0].worked_hours, 60, "week 1 hours"); eq(rows[0].overtime_hours, 16, "week 1 overtime");
  eq(rows[1].worked_hours, 20, "week 2 hours"); eq(rows[1].overtime_hours, 0, "week 2 overtime");
});

await check("paid-but-not-worked time is excluded from the threshold", async () => {
  await db.exec(`delete from time_entries`);
  for (const d of ["09", "10", "11", "12", "13"]) await addTime(`2026-03-${d}`, 8, DIRECT, client);
  await addTime("2026-03-13", 8, HOLIDAY);
  const r = await one(`select * from employee_work_weeks where employment_id='${employment}'`);
  eq(r.worked_hours, 40, "worked"); eq(r.non_worked_hours, 8, "non-worked"); eq(r.overtime_hours, 0, "overtime");
});

await check("productive and billable hours are narrower than worked hours", async () => {
  await db.exec(`delete from time_entries`);
  await addTime("2026-03-09", 6, DIRECT, client);
  await addTime("2026-03-09", 2, NOTES);
  const r = await one(`select * from employee_work_weeks where employment_id='${employment}'`);
  eq(r.worked_hours, 8, "worked"); eq(r.productive_hours, 6, "productive"); eq(r.billable_hours, 6, "billable");
});

await check("a billable activity must name a client, and a non-client one must not", async () => {
  await throws(
    `insert into time_entries (clinic_id, employment_id, work_date, work_week_start, activity_code_id, minutes)
     values ('${clinic}','${employment}','2026-03-09','1970-01-01','${DIRECT}',60)`,
    /has to name a client/, "billable without client");
  await throws(
    `insert into time_entries (clinic_id, employment_id, work_date, work_week_start, activity_code_id, minutes, client_id)
     values ('${clinic}','${employment}','2026-03-09','1970-01-01','${NOTES}',60,${client})`,
    /not recorded against a client/, "non-client with client");
});

await check("time cannot be recorded outside the employment", async () => {
  await throws(
    `insert into time_entries (clinic_id, employment_id, work_date, work_week_start, activity_code_id, minutes)
     values ('${clinic}','${employment}','2025-11-01','1970-01-01','${NOTES}',60)`,
    /before employment began/, "time before hire");
});

// --------------------------------------------------------------------------
// 0028 · timesheets
// --------------------------------------------------------------------------
const period = (await one(
  `insert into pay_periods (clinic_id, starts_on, ends_on) values ('${clinic}','2026-03-08','2026-03-21') returning id`)).id;
const sheet = (await one(
  `insert into timesheets (clinic_id, employment_id, pay_period_id) values ('${clinic}','${employment}','${period}') returning id`)).id;

await check("timesheet transitions are the declared ones only", async () => {
  await throws(`update timesheets set status='APPROVED' where id='${sheet}'`,
    /cannot go from DRAFT to APPROVED/, "draft straight to approved");
  await db.exec(`update timesheets set status='SUBMITTED' where id='${sheet}'`);
  await throws(`update timesheets set status='DRAFT' where id='${sheet}'`,
    /cannot go from SUBMITTED to DRAFT/, "submitted back to draft");
});

await check("nobody approves their own timesheet", async () => {
  await be(people.clinician);
  await throws(`update timesheets set status='APPROVED' where id='${sheet}'`,
    /cannot be approved by the person it belongs to/, "self approval");
});

await check("a supervisor can approve, and a return needs a reason", async () => {
  await be(people.supervisor);
  await throws(`update timesheets set status='RETURNED' where id='${sheet}'`,
    /return_reason/, "return without a reason");
  await db.exec(`update timesheets set status='APPROVED', approved_by='${people.supervisor}', approved_at=now()
                  where id='${sheet}'`);
  eq((await one(`select status from timesheets where id='${sheet}'`)).status, "APPROVED", "approved");
});

await check("an entry on an approved timesheet cannot be edited or deleted", async () => {
  await db.exec(`delete from time_entries`);
  await db.exec(`insert into time_entries
    (clinic_id, employment_id, timesheet_id, work_date, work_week_start, activity_code_id, minutes)
    values ('${clinic}','${employment}','${sheet}','2026-03-09','1970-01-01','${NOTES}',60)`);
  await throws(`update time_entries set minutes=120 where timesheet_id='${sheet}'`,
    /on a APPROVED timesheet/, "editing approved time");
  await throws(`delete from time_entries where timesheet_id='${sheet}'`,
    /on a APPROVED timesheet/, "deleting approved time");
});

// --------------------------------------------------------------------------
// 0029 · rates
// --------------------------------------------------------------------------
await check("a pay rate resolves, and a salary reduces over 52 weeks", async () => {
  await db.exec(`insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
                 values ('${clinic}','${employment}','hourly',40.00,'2026-01-05','initial')`);
  eq((await one(`select public.pay_rate_for('${employment}','2026-03-09') r`)).r, 40, "hourly");

  const emp2 = (await one(`insert into employment_records (clinic_id, user_id, start_date)
    values ('${clinic}','${people.supervisor}','2026-01-05') returning id`)).id;
  await db.exec(`insert into employment_positions
    (clinic_id, employment_id, effective_from, position_title, employment_type, standard_weekly_hours, fte)
    values ('${clinic}','${emp2}','2026-01-05','Supervisor','full_time',37.5,1.0)`);
  await db.exec(`insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
                 values ('${clinic}','${emp2}','annual_salary',78000,'2026-01-05','initial')`);
  // The same figure packages/workforce/esa.ts hourlyFromSalary produces.
  eq((await one(`select public.pay_rate_for('${emp2}','2026-03-09') r`)).r,
     Math.round((78000 / (37.5 * 52)) * 100) / 100, "salary reduced");
});

await check("a rate below the statutory minimum multiplier is refused", async () => {
  await throws(
    `insert into pay_codes (clinic_id, code, label, kind, multiplier, statutory_minimum_multiplier)
     values ('${clinic}','OT_CHEAP','Cheap overtime','overtime', 1.20, 1.50)`,
    /meets_statutory_minimum/, "sub-minimum overtime");
});

await check("cost loading defaults to 1 and sums the components", async () => {
  eq((await one(`select public.cost_multiplier_for('${clinic}','2026-03-09') m`)).m, 1, "no loading recorded");
  await db.exec(`insert into employer_cost_loading
    (clinic_id, cpp_percent, ei_percent, wsib_percent, vacation_percent, effective_from)
    values ('${clinic}', 5.95, 2.28, 1.20, 4.000, '2026-01-01')`);
  eq((await one(`select public.cost_multiplier_for('${clinic}','2026-03-09') m`)).m, 1.1343, "loaded");
});

await check("minimum wage compliance reports rather than blocks", async () => {
  const emp3 = (await one(`insert into employment_records (clinic_id, user_id, start_date)
    values ('${clinic}','${people.admin}','2026-01-05') returning id`)).id;
  await db.exec(`insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
                 values ('${clinic}','${emp3}','hourly', 15.00, '2026-02-01','initial')`);
  const r = await one(`select status from pay_rate_compliance where employment_id='${emp3}'`);
  eq(r.status, "below_minimum", "compliance status");
});

// --------------------------------------------------------------------------
// 0023 · budgets
// --------------------------------------------------------------------------
await check("budget position is derived from entries", async () => {
  const b = (await one(`insert into client_budgets
    (clinic_id, client_id, name, funding_source, allocated_amount, period_start)
    values ('${clinic}',${client},'2026 Allocation','Test Funder', 10000, '2026-01-01') returning id`)).id;
  await db.exec(`insert into budget_entries (clinic_id, budget_id, entry_date, kind, description, amount)
                 values ('${clinic}','${b}','2026-02-01','CHARGE','Session', 1500),
                        ('${clinic}','${b}','2026-02-15','CHARGE','Session', 500),
                        ('${clinic}','${b}','2026-02-20','CREDIT','Refund', -200)`);
  const p = await one(`select * from client_budget_positions where budget_id='${b}'`);
  eq(p.spent_to_date, 1800, "spent"); eq(p.remaining, 8200, "remaining"); eq(p.percent_used, 18, "percent");
  return b;
});

await check("a reconciled entry cannot have its money edited", async () => {
  const b = (await one(`select id from client_budgets limit 1`)).id;
  await db.exec(`update budget_entries set reconciled=true where budget_id='${b}' and amount=1500`);
  await throws(`update budget_entries set amount=1600 where budget_id='${b}' and reconciled=true`,
    /reconciled; add an adjustment/, "editing a reconciled entry");
  // A non-money field is still editable, which is what makes reconciliation
  // usable rather than a wall.
  await db.exec(`update budget_entries set description='Session (clarified)'
                  where budget_id='${b}' and reconciled=true`);
});

// --------------------------------------------------------------------------
// 0031 · delivered session -> time entry -> budget charge
// --------------------------------------------------------------------------
const stype = (await one(
  `insert into session_types (name, duration, price, clinic_id)
   values ('Direct Therapy', 120, 0, '${clinic}') returning id`)).id;

const mkSession = async (date, status = "completed", staff = staffId) => (await one(
  `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
   values (${client}, ${staff}, '${date}', 9, 0, 'Direct Therapy', '${status}', '${clinic}')
   returning id`)).id;

await check("a session that is not completed derives nothing", async () => {
  const sid = await mkSession("2026-04-06", "scheduled");
  const r = await one(`select * from public.record_session_delivery(${sid})`);
  eq(r.time_entry_id, null, "time entry"); 
  if (!/not completed/.test(r.skipped_reason)) throw new Error(`reason: ${r.skipped_reason}`);
});

await check("an unlinked staff member is reported, not guessed at", async () => {
  const loner = (await one(
    `insert into staff (name, clinic_id) values ('Unlinked','${clinic}') returning id`)).id;
  const sid = await mkSession("2026-04-07", "completed", loner);
  const r = await one(`select * from public.record_session_delivery(${sid})`);
  eq(r.time_entry_id, null, "time entry");
  if (!/no employment record/.test(r.skipped_reason)) throw new Error(`reason: ${r.skipped_reason}`);
});

await check("time is recorded even when no rate is configured, and no charge is invented", async () => {
  const sid = await mkSession("2026-04-08");
  const r = await one(`select * from public.record_session_delivery(${sid})`);
  if (!r.time_entry_id) throw new Error("no time entry written");
  eq(r.minutes, 120, "minutes from the session type");
  eq(r.budget_entry_id, null, "charge without a rate");
  if (!/no billing rate/.test(r.skipped_reason)) throw new Error(`reason: ${r.skipped_reason}`);
});

await check("with a rate set, the charge is written at hours x rate", async () => {
  await db.exec(`insert into billing_rates (clinic_id, hourly_rate, effective_from)
                 values ('${clinic}', 55.00, '2026-01-01')`);
  const sid = await mkSession("2026-04-09");
  const r = await one(`select * from public.record_session_delivery(${sid})`);
  if (!r.budget_entry_id) throw new Error(`no charge: ${r.skipped_reason}`);
  eq(r.charged, 110, "2 hours at 55");
  const e = await one(`select quantity, unit_rate, kind from budget_entries where session_id=${sid}`);
  eq(e.quantity, 2, "quantity"); eq(e.unit_rate, 55, "unit rate"); eq(e.kind, "CHARGE", "kind");
});

await check("calling it twice produces one entry and one charge", async () => {
  const sid = await mkSession("2026-04-10");
  await db.exec(`select public.record_session_delivery(${sid})`);
  await db.exec(`select public.record_session_delivery(${sid})`);
  eq((await one(`select count(*)::int n from time_entries where session_id=${sid}`)).n, 1, "time entries");
  eq((await one(`select count(*)::int n from budget_entries where session_id=${sid}`)).n, 1, "charges");
});

await check("the derived charge moves the family's spent-to-date", async () => {
  const b = await one(`select spent_to_date, remaining from client_budget_positions
                        where client_id=${client} limit 1`);
  // Two derived charges of 110 landed above (2026-04-09 and 2026-04-10), on top
  // of the 1800 posted by the budget test.
  eq(b.spent_to_date, 2020, "spent to date");
  eq(b.remaining, 7980, "remaining");
});

// --------------------------------------------------------------------------
// 0045 · sessions double-booking guard (BLOCKED-scheduler.md item 1)
//
// Nothing exercised this trigger/index anywhere in the suite before now -
// apply.mjs only proved 0045's DDL parses and attaches, not that it actually
// refuses a conflicting write. Own staff/session-type fixtures (not staffId/
// stype above) and a date range nothing else in this file touches, so this
// section can't collide with an unrelated test's session regardless of
// ordering.
// --------------------------------------------------------------------------
const dbStaff = (await one(
  `insert into staff (name, clinic_id) values ('Double-Book Test Clinician','${clinic}') returning id`)).id;
const dbOtherStaff = (await one(
  `insert into staff (name, clinic_id) values ('Other Clinician','${clinic}') returning id`)).id;
// duration 60 (the app's own fallback for a null/unrecognized type, and
// distinct from the 0031 section's 120-minute 'Direct Therapy' above) so the
// exact-slot and overlap cases below stay easy to reason about in minutes.
const dbType = (await one(
  `insert into session_types (name, duration, price, clinic_id)
   values ('DB Test Type', 60, 0, '${clinic}') returning id`)).id;
const mkDbSession = async (date, hour, minute, staff = dbStaff, status = "scheduled") => (await one(
  `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
   values (${client}, ${staff}, '${date}', ${hour}, ${minute}, 'DB Test Type', '${status}', '${clinic}')
   returning id`)).id;

await check("exact-slot double-booking is refused (layer 1/2 - the overlap trigger fires first)", async () => {
  await mkDbSession("2026-07-01", 9, 0);
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbStaff}, '2026-07-01', 9, 0, 'DB Test Type', 'scheduled', '${clinic}')`,
    /already has an overlapping session|sessions_no_exact_double_book/,
    "exact duplicate slot",
  );
});

await check("a later session starting inside an earlier one's duration overlaps", async () => {
  // 9:00 + 60min duration ends 10:00; 9:30 starts inside that window.
  await mkDbSession("2026-07-02", 9, 0);
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbStaff}, '2026-07-02', 9, 30, 'DB Test Type', 'scheduled', '${clinic}')`,
    /already has an overlapping session/,
    "9:30 start overlapping a 9:00-10:00 session",
  );
});

await check("back-to-back sessions that only touch at the boundary are allowed", async () => {
  await mkDbSession("2026-07-03", 9, 0);
  // 9:00-10:00 then 10:00-11:00: tsrange '[)' makes 10:00 the free instant.
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbStaff}, '2026-07-03', 10, 0, 'DB Test Type', 'scheduled', '${clinic}')`);
  eq((await one(`select count(*)::int n from sessions where employee_id=${dbStaff} and session_date='2026-07-03'`)).n,
    2, "both back-to-back sessions present");
});

await check("a cancelled session frees its slot for a real re-book", async () => {
  const sid = await mkDbSession("2026-07-04", 9, 0);
  await db.exec(`update sessions set status='cancelled' where id=${sid}`);
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbStaff}, '2026-07-04', 9, 0, 'DB Test Type', 'scheduled', '${clinic}')`);
  eq((await one(`select count(*)::int n from sessions
                  where employee_id=${dbStaff} and session_date='2026-07-04' and status<>'cancelled'`)).n,
    1, "one live session after the cancelled slot was reused");
});

await check("two different clinicians at the identical slot never conflict", async () => {
  await mkDbSession("2026-07-05", 9, 0, dbStaff);
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbOtherStaff}, '2026-07-05', 9, 0, 'DB Test Type', 'scheduled', '${clinic}')`);
  eq((await one(`select count(*)::int n from sessions where session_date='2026-07-05' and hour=9 and minute=0`)).n,
    2, "one session per clinician, same slot, no conflict");
});

await check("a null/unrecognized type falls back to the app's own 60-minute default", async () => {
  await mkDbSession("2026-07-06", 9, 0, dbStaff);
  // type doesn't match any session_types row for this clinic -> the
  // trigger's `coalesce(v_duration, 60)` path, same fallback
  // `quickType.duration_minutes ?? quickType.duration ?? 60` uses app-side.
  await throws(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, ${dbStaff}, '2026-07-06', 9, 30, 'Nonexistent Type', 'scheduled', '${clinic}')`,
    /already has an overlapping session/,
    "unrecognized type still overlaps under the 60-minute fallback",
  );
});

await check("an unassigned session (employee_id null) never conflicts with anything", async () => {
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, null, '2026-07-07', 9, 0, 'DB Test Type', 'scheduled', '${clinic}')`);
  await db.exec(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${client}, null, '2026-07-07', 9, 0, 'DB Test Type', 'scheduled', '${clinic}')`);
  eq((await one(`select count(*)::int n from sessions where session_date='2026-07-07' and employee_id is null`)).n,
    2, "unassigned sessions never collide with each other");
});

await check("the catch-up view names why each stuck session is stuck", async () => {
  const rows = (await db.query(
    `select blocked_by, count(*)::int n from underived_sessions
      where clinic_id='${clinic}' group by blocked_by order by blocked_by`)).rows;
  const byReason = Object.fromEntries(rows.map(r => [r.blocked_by, r.n]));
  if (!byReason["staff member is not linked to an employment record"])
    throw new Error(`expected an unlinked-staff row, got ${JSON.stringify(byReason)}`);
});

await check("the bulk derivation skips what is already derived", async () => {
  const before = (await one(`select count(*)::int n from time_entries where source='session'`)).n;
  await mkSession("2026-04-13");
  const rows = (await db.query(
    `select * from public.derive_pending_session_deliveries('${clinic}')`)).rows;
  const after = (await one(`select count(*)::int n from time_entries where source='session'`)).n;
  eq(after, before + 1, "exactly one new entry");
  // The unlinked-staff session is reported every run rather than silently passed.
  if (!rows.some(r => /no employment record/.test(r.skipped_reason || "")))
    throw new Error("the blocked session was not reported");
});

await check("derivation writes correlated events, and they cannot be edited", async () => {
  const rows = (await db.query(
    `select event_type, correlation_id from organization_events
      where source='system' and event_type in ('scheduling.session_delivered','finance.budget_charged')`)).rows;
  if (rows.length < 2) throw new Error(`expected derived events, got ${rows.length}`);
  const paired = rows.filter(r => r.correlation_id === rows[0].correlation_id);
  eq(paired.length, 2, "the delivery and its charge share a correlation id");
});

// --------------------------------------------------------------------------
// 0033 · provisional data refuses to be priced
// --------------------------------------------------------------------------
await check("a backfilled position is marked provisional, an entered one is not", async () => {
  // The employment used throughout this file was created with created_by null,
  // the same shape the 0026 backfill produces, so it is marked provisional.
  const r = await one(`select provisional from employment_positions
                        where employment_id='${employment}' order by effective_from limit 1`);
  eq(r.provisional, true, "backfilled position");

  await db.exec(`update employment_positions set provisional = false, created_by = '${people.admin}'
                  where employment_id='${employment}'`);
  const after = await one(`select provisional from employment_positions
                            where employment_id='${employment}' limit 1`);
  eq(after.provisional, false, "confirmed position");
});

await check("hours are reported for provisional terms; cost is not", async () => {
  // An earlier test left one entry on an APPROVED timesheet, and the approval
  // guard rightly refuses to delete it. Only the loose entries are cleared.
  await db.exec(`delete from time_entries where timesheet_id is null`);
  await db.exec(`update employment_positions set provisional = true where employment_id='${employment}'`);
  // A week of its own. The entry left on the approved timesheet above sits in
  // the week of 8 March and would otherwise be counted here too.
  for (const d of ["23", "24", "25", "26", "27"]) await addTime(`2026-03-${d}`, 10, DIRECT, client);

  const w = await one(`select * from employee_work_weeks
                        where employment_id='${employment}' and work_week_start = '2026-03-22'`);
  eq(w.worked_hours, 50, "hours still reported");
  eq(w.overtime_hours, 6, "overtime still reported");
  eq(w.terms_provisional, true, "flagged provisional");

  const e = await one(`select cost, revenue from employee_week_economics
                        where employment_id='${employment}' and work_week_start = '2026-03-22'`);
  if (e.cost !== null) throw new Error(`cost should be null for provisional terms, got ${e.cost}`);
  // Revenue does not depend on the employee's terms, so it is still produced.
  if (e.revenue === null) throw new Error("revenue should still be reported");
});

await check("confirming the terms makes cost computable again", async () => {
  await db.exec(`update employment_positions set provisional = false where employment_id='${employment}'`);
  const e = await one(`select cost from employee_week_economics
                        where employment_id='${employment}' and work_week_start = '2026-03-22'`);
  if (e.cost === null) throw new Error("cost still null after confirming the terms");
});

await check("utilization refuses a made-up denominator", async () => {
  await db.exec(`update employment_positions set provisional = true where employment_id='${employment}'`);
  const u = await one(`select utilization_percent from employee_utilization
                        where employment_id='${employment}' and work_week_start = '2026-03-22'`);
  if (u.utilization_percent !== null) throw new Error("utilization computed against assumed FTE");
  await db.exec(`update employment_positions set provisional = false where employment_id='${employment}'`);
});

await check("payroll_readiness names the first reason someone cannot be paid", async () => {
  const rows = (await db.query(
    `select employment_id, blocker from payroll_readiness where clinic_id='${clinic}'`)).rows;
  if (!rows.length) throw new Error("no readiness rows");
  const mine = rows.find((r) => r.employment_id === employment);
  if (!mine) throw new Error("the test employment is missing from readiness");
  if (mine.blocker !== "ready") throw new Error(`expected ready, got: ${mine.blocker}`);

  // The fixture's third employment was created with a rate but no position,
  // and that is the first thing the view should name for it.
  const noPosition = rows.find((r) => /No current position/.test(r.blocker));
  if (!noPosition) throw new Error("an employment without a position was not flagged");
});

await check("deployment_readiness reports the checks that are outstanding", async () => {
  // Read as an admin: 0040 gated the readiness and coverage views on
  // admin.settings.write, because they were readable by any signed-in parent
  // and they describe how the deployment is configured.
  await be(people.admin);
  const rows = (await db.query(`select check_name, outstanding, passing, why from deployment_readiness`)).rows;
  if (rows.length < 6) throw new Error(`expected the full checklist, got ${rows.length} rows`);
  const rls = rows.find((r) => r.check_name === "Row security active");
  eq(rls.outstanding, 0, "inert policies after 0032");
  eq(rls.passing, true, "row security check");
  // Every row explains itself; a checklist of bare booleans is not a checklist.
  if (rows.some((r) => !r.why || r.why.length < 20)) throw new Error("a check has no explanation");
});

await check("a diagnostic view is empty for someone without admin.settings.write", async () => {
  await be(people.clinician);
  const n = (await db.query(`select count(*)::int n from deployment_readiness`)).rows[0].n;
  eq(n, 0, "deployment_readiness for a clinician");
  await be(people.admin);
});

// --------------------------------------------------------------------------
// 0034 · receipt identity
// --------------------------------------------------------------------------
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

await check("a signature must actually be an image", async () => {
  // As the owner: the ownership trigger runs BEFORE the check constraint, so
  // signing as anyone else would be rejected for the wrong reason and this
  // test would pass without ever exercising the image check.
  await be(people.clinician);
  await throws(
    `insert into employee_signatures (clinic_id, user_id, image_data_uri, signed_name, created_by)
     values ('${clinic}','${people.clinician}','javascript:alert(1)','A Clinician','${people.clinician}')`,
    /employee_signatures_is_image/, "non-image signature");
});

await check("nobody signs for anybody else", async () => {
  await be(people.admin);
  await throws(
    `insert into employee_signatures (clinic_id, user_id, image_data_uri, signed_name, created_by)
     values ('${clinic}','${people.clinician}','${PNG}','A Clinician','${people.admin}')`,
    /only be created by the person it belongs to/, "admin signing for a clinician");
});

await check("a person can record their own signature, and only one is current", async () => {
  await be(people.clinician);
  await db.exec(`insert into employee_signatures
    (clinic_id, user_id, image_data_uri, signed_name, effective_from, created_by)
    values ('${clinic}','${people.clinician}','${PNG}','A Clinician','2026-01-01','${people.clinician}')`);
  await throws(
    `insert into employee_signatures
      (clinic_id, user_id, image_data_uri, signed_name, effective_from, created_by)
      values ('${clinic}','${people.clinician}','${PNG}','A Clinician','2026-06-01','${people.clinician}')`,
    /employee_signatures_one_current|duplicate key/, "a second current signature");

  // Superseding the old one is what makes room for the new.
  await db.exec(`update employee_signatures set superseded_at = now()
                  where user_id = '${people.clinician}' and superseded_at is null`);
  await db.exec(`insert into employee_signatures
    (clinic_id, user_id, image_data_uri, signed_name, effective_from, created_by)
    values ('${clinic}','${people.clinician}','${PNG}','A. Clinician','2026-06-01','${people.clinician}')`);
  eq((await one(`select count(*)::int n from employee_signatures where user_id='${people.clinician}'`)).n,
     2, "both signatures kept");
});

await check("exactly one site can be the receipt default", async () => {
  await db.exec(`insert into locations (name, address_line1, city, province, postal_code, clinic_id, is_default_for_receipts)
                 values ('Durham Clinic','1 Main St','Oshawa','ON','L1H 1A1','${clinic}', true)`);
  await throws(
    `insert into locations (name, address_line1, clinic_id, is_default_for_receipts)
     values ('Toronto Clinic','2 King St','${clinic}', true)`,
    /locations_one_receipt_default|duplicate key/, "a second default site");
  // A second NON-default site is fine — that is the multi-site case.
  await db.exec(`insert into locations (name, address_line1, city, province, clinic_id)
                 values ('Toronto Clinic','2 King St','Toronto','ON','${clinic}')`);
  eq((await one(`select count(*)::int n from locations where clinic_id='${clinic}'`)).n, 2, "two sites");
});

await check("a receipt line carries the client, clinician, credential number and signature", async () => {
  await db.exec(`update clinics set legal_name='Test Clinic Inc.', address_line1='1 Main St',
                  city='Oshawa', province='ON', postal_code='L1H 1A1', business_number='12345 6789 RT0001'
                  where id='${clinic}'`);
  await db.exec(`insert into employee_credentials
    (clinic_id, user_id, credential, credential_number, cycle_start, cycle_end, status)
    values ('${clinic}','${people.clinician}','BCBA','1-23-45678','2026-01-01','2028-12-31','GOOD_STANDING')`);

  const line = await one(`select * from receipt_lines
    where clinic_id='${clinic}' and clinician_user_id='${people.clinician}' limit 1`);
  if (!line) throw new Error("no receipt line resolved for the derived charge");

  eq(line.client_name, "Test Child", "client name");
  eq(line.clinician_name, "clinician", "clinician name");
  eq(line.clinician_credential, "BCBA", "credential");
  eq(line.clinician_credential_number, "1-23-45678", "credential number");
  eq(line.organization_name, "Test Clinic Inc.", "legal name preferred over trading name");
  eq(line.business_number, "12345 6789 RT0001", "business number");
  if (!line.clinician_signature) throw new Error("signature did not resolve");
  // The charge is dated 2026-04-09, so the signature effective 2026-01-01 is
  // the one that applies — not the later one superseding it.
  eq(line.clinician_signed_name, "A Clinician", "the signature current on the charge date");
});

await check("a lapsed credential never reaches a receipt", async () => {
  await db.exec(`update employee_credentials set status='LAPSED' where user_id='${people.clinician}'`);
  const line = await one(`select clinician_credential_number from receipt_lines
    where clinic_id='${clinic}' and clinician_user_id='${people.clinician}' limit 1`);
  if (line.clinician_credential_number !== null)
    throw new Error(`lapsed number leaked: ${line.clinician_credential_number}`);
  await db.exec(`update employee_credentials set status='GOOD_STANDING' where user_id='${people.clinician}'`);
});

await check("a credit is not a receipt line", async () => {
  const b = (await one(`select id from client_budgets limit 1`)).id;
  await db.exec(`insert into budget_entries (clinic_id, budget_id, entry_date, kind, description, amount)
                 values ('${clinic}','${b}','2026-05-01','CREDIT','Refund', -50)`);
  eq((await one(`select count(*)::int n from receipt_lines where service='Refund'`)).n,
     0, "credit appearing as a receipt line");
});

await check("receipt_readiness names what is missing", async () => {
  await be(people.admin);
  const r = await one(`select * from receipt_readiness where clinic_id='${clinic}'`);
  eq(r.blocker, "ready", `blocker: ${r.blocker}`);
  eq(r.missing_org_address, false, "org address");
  eq(r.missing_default_site, false, "default site");
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
