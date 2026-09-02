/**
 * RLS enforcement tests.
 *
 * The gap these close: `behaviour.mjs` runs as the superuser, who bypasses row
 * security entirely. Everything it proves about permissions is about the
 * FUNCTIONS the policies call, not about the policies themselves. A policy
 * that references the right function and filters on the wrong column would
 * pass every test there and leak in production.
 *
 * Here every query runs as `authenticated` with a JWT claim set, which is what
 * Supabase does, so the policies actually apply. The measure of a passing test
 * is usually a ROW COUNT, not an absence of errors: a SELECT blocked by RLS
 * returns an empty set, and an UPDATE or DELETE blocked by RLS matches zero
 * rows and reports success. Only INSERT raises. Tests that only check for
 * exceptions are worthless against three of the four commands.
 *
 * What this still is not: a Supabase instance. The grants below approximate
 * Supabase's, and `auth.uid()` is a stub reading a GUC rather than a real JWT.
 * If a policy depends on something else in the JWT, this will not catch it.
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
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $do$;
`);

for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(DIR, f), "utf8"));
}

// Supabase grants the API roles table-level privileges and leaves RLS to do the
// filtering. Mirrored here, or every test would fail on a missing GRANT rather
// than on a policy.
await db.exec(`
  grant usage on schema public, auth to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema public, auth to authenticated, anon;
  grant usage, select on all sequences in schema public to authenticated;
`);

// --------------------------------------------------------------------------
let pass = 0, fail = 0;
const out = [];
async function check(name, fn) {
  try { await fn(); pass++; out.push(`ok    ${name}`); }
  catch (e) { fail++; out.push(`FAIL  ${name}\n        ${String(e.message || e).split("\n")[0]}`); }
}
function eq(a, b, what = "") {
  if (Number(a) !== Number(b) && String(a) !== String(b))
    throw new Error(`${what}: expected ${b}, got ${a}`);
}

/** Run as a signed-in user, with RLS applying. Always resets. */
async function as(uid, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
const count = async (sql) => Number((await db.query(sql)).rows[0].n);
const one = async (sql) => (await db.query(sql)).rows[0];
/** Rows visible to this user, which is the only measure that means anything. */
const visible = (table, where = "true") => count(`select count(*)::int n from ${table} where ${where}`);
async function insertRaises(sql, what) {
  try { await db.exec(sql); }
  catch { return; }
  throw new Error(`${what}: the insert was allowed`);
}
/** An UPDATE blocked by RLS does not raise; it matches nothing. */
async function updateAffects(sql, expected, what) {
  const res = await db.query(sql);
  const n = res.affectedRows ?? 0;
  if (Number(n) !== Number(expected)) throw new Error(`${what}: ${n} rows changed, expected ${expected}`);
}

// --------------------------------------------------------------------------
// Fixture: two clinics, so cross-tenant leakage is testable rather than assumed.
// --------------------------------------------------------------------------
const clinicA = (await db.query(`insert into clinics (name, slug) values ('A','a') returning id`)).rows[0].id;
const clinicB = (await db.query(`insert into clinics (name, slug) values ('B','b') returning id`)).rows[0].id;

const mkUser = async (name, role, clinic) => {
  const id = (await db.query(`insert into auth.users (email) values ('${name}@t.test') returning id`)).rows[0].id;
  await db.exec(`insert into profiles (id, full_name, role, clinic_id) values ('${id}','${name}','${role}','${clinic}')`);
  return id;
};

const aAdmin = await mkUser("a_admin", "admin", clinicA);
const aSuper = await mkUser("a_super", "supervisor", clinicA);
const aClin = await mkUser("a_clin", "clinician", clinicA);
const aOtherClin = await mkUser("a_other", "clinician", clinicA);
const aHr = await mkUser("a_hr", "hr_admin", clinicA);
const aPayroll = await mkUser("a_pay", "payroll_admin", clinicA);
const bAdmin = await mkUser("b_admin", "admin", clinicB);
await db.exec(`update profiles set supervisor_id='${aSuper}' where id='${aClin}'`);

const familyUser = (await db.query(`insert into auth.users (email) values ('family@t.test') returning id`)).rows[0].id;
await db.exec(`insert into profiles (id, full_name, role, clinic_id) values ('${familyUser}','Family','client','${clinicA}')`);

const clientA = (await db.query(
  `insert into clients (name, status, clinic_id, user_id) values ('Child A','active','${clinicA}','${familyUser}') returning id`)).rows[0].id;
const clientB = (await db.query(
  `insert into clients (name, status, clinic_id) values ('Child B','active','${clinicB}') returning id`)).rows[0].id;

// Employment + time in clinic A.
const empClin = (await db.query(
  `insert into employment_records (clinic_id, user_id, start_date) values ('${clinicA}','${aClin}','2026-01-05') returning id`)).rows[0].id;
const empOther = (await db.query(
  `insert into employment_records (clinic_id, user_id, start_date) values ('${clinicA}','${aOtherClin}','2026-01-05') returning id`)).rows[0].id;
await db.exec(`insert into employment_positions (clinic_id, employment_id, effective_from, position_title, employment_type)
               values ('${clinicA}','${empClin}','2026-01-05','Therapist','full_time'),
                      ('${clinicA}','${empOther}','2026-01-05','Therapist','full_time')`);
await db.exec(`insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
               values ('${clinicA}','${empClin}','hourly',40,'2026-01-05','initial'),
                      ('${clinicA}','${empOther}','hourly',52,'2026-01-05','initial')`);

const notesCode = (await db.query(`select id from activity_codes where code='NOTES' and clinic_id is null`)).rows[0].id;
await db.exec(`insert into time_entries (clinic_id, employment_id, work_date, work_week_start, activity_code_id, minutes)
               values ('${clinicA}','${empClin}','2026-03-09','1970-01-01','${notesCode}',60),
                      ('${clinicA}','${empOther}','2026-03-09','1970-01-01','${notesCode}',60)`);

const budgetA = (await db.query(
  `insert into client_budgets (clinic_id, client_id, name, funding_source, allocated_amount, period_start)
   values ('${clinicA}',${clientA},'A budget','Funder',5000,'2026-01-01') returning id`)).rows[0].id;
const budgetB = (await db.query(
  `insert into client_budgets (clinic_id, client_id, name, funding_source, allocated_amount, period_start)
   values ('${clinicB}',${clientB},'B budget','Funder',9000,'2026-01-01') returning id`)).rows[0].id;
await db.exec(`insert into budget_entries (clinic_id, budget_id, entry_date, kind, description, amount)
               values ('${clinicA}','${budgetA}','2026-02-01','CHARGE','A charge',100),
                      ('${clinicB}','${budgetB}','2026-02-01','CHARGE','B charge',200)`);

// --------------------------------------------------------------------------
// Tenancy
// --------------------------------------------------------------------------
await check("an admin sees only their own clinic's budgets", async () => {
  await as(aAdmin, async () => {
    eq(await visible("client_budgets"), 1, "clinic A admin");
    eq(await visible("client_budgets", `clinic_id = '${clinicB}'`), 0, "other clinic's budgets");
  });
  await as(bAdmin, async () => eq(await visible("client_budgets"), 1, "clinic B admin"));
});

await check("budget entries do not cross the tenant boundary", async () => {
  await as(aAdmin, async () => eq(await visible("budget_entries"), 1, "clinic A entries"));
  await as(bAdmin, async () => eq(await visible("budget_entries"), 1, "clinic B entries"));
});

await check("an admin cannot write a budget into another clinic", async () => {
  await as(aAdmin, () => insertRaises(
    `insert into client_budgets (clinic_id, client_id, name, funding_source, allocated_amount, period_start)
     values ('${clinicB}',${clientB},'Sneaky','x',1,'2026-01-01')`,
    "cross-clinic budget insert"));
});

await check("signed out, nothing is visible", async () => {
  await as(null, async () => {
    eq(await visible("client_budgets"), 0, "budgets");
    eq(await visible("employment_records"), 0, "employment");
    eq(await visible("time_entries"), 0, "time");
  });
});

// --------------------------------------------------------------------------
// The family
// --------------------------------------------------------------------------
await check("a family reads their own budget and only their own", async () => {
  await as(familyUser, async () => {
    eq(await visible("client_budgets"), 1, "own budget");
    eq(await visible("budget_entries"), 1, "own entries");
    eq(await visible("client_budgets", `client_id <> ${clientA}`), 0, "another child's budget");
  });
});

await check("a family cannot post a charge to their own budget", async () => {
  await as(familyUser, () => insertRaises(
    `insert into budget_entries (clinic_id, budget_id, entry_date, kind, description, amount)
     values ('${clinicA}','${budgetA}','2026-03-01','CREDIT','Refund me', -500)`,
    "family posting an entry"));
});

await check("a family cannot change their own allocation", async () => {
  await as(familyUser, () => updateAffects(
    `update client_budgets set allocated_amount = 99999 where id = '${budgetA}'`,
    0, "family editing the allocation"));
  // And the number is genuinely unchanged, not merely unreported.
  eq((await db.query(`select allocated_amount from client_budgets where id='${budgetA}'`)).rows[0].allocated_amount,
     5000, "allocation after the attempt");
});

// --------------------------------------------------------------------------
// The HR / clinical boundary, enforced rather than merely computed
// --------------------------------------------------------------------------
await check("a clinician sees their own employment record and nobody else's", async () => {
  await as(aClin, async () => {
    eq(await visible("employment_records"), 1, "visible employments");
    eq(await visible("employment_records", `user_id = '${aOtherClin}'`), 0, "a colleague's");
  });
});

await check("a supervisor sees their supervisee's employment, not a peer's", async () => {
  await as(aSuper, async () => {
    eq(await visible("employment_records", `user_id = '${aClin}'`), 1, "supervisee");
    eq(await visible("employment_records", `user_id = '${aOtherClin}'`), 0, "non-supervisee");
  });
});

await check("an HR administrator sees every employment in their clinic", async () => {
  await as(aHr, async () => eq(await visible("employment_records"), 2, "all clinic employments"));
});

await check("pay rates: own rate only, even for HR", async () => {
  await as(aClin, async () => {
    eq(await visible("pay_rates"), 1, "clinician sees own rate");
    eq(await visible("pay_rates", `employment_id = '${empOther}'`), 0, "a colleague's rate");
  });
  await as(aHr, async () => eq(await visible("pay_rates"), 0, "HR admin reading pay rates"));
  await as(aPayroll, async () => eq(await visible("pay_rates"), 2, "payroll reads pay rates"));
});

await check("an HR administrator cannot read clinical data", async () => {
  await as(aHr, async () => {
    eq(await visible("client_budgets"), 0, "budgets");
    eq(await visible("clients"), 0, "clients");
  });
});

await check("time entries: own time, or an approver's", async () => {
  await as(aClin, async () => eq(await visible("time_entries"), 1, "clinician sees own time"));
  await as(aOtherClin, async () => eq(await visible("time_entries"), 1, "other clinician sees own time"));
  await as(aSuper, async () => eq(await visible("time_entries"), 1, "supervisor sees the supervisee's"));
  await as(aPayroll, async () => eq(await visible("time_entries"), 2, "payroll sees all"));
});

// --------------------------------------------------------------------------
// The event stream
// --------------------------------------------------------------------------
await check("a person always sees events about themselves", async () => {
  await db.exec(`insert into organization_events
    (clinic_id, event_type, occurred_at, actor_id, subject_type, subject_employee)
    values ('${clinicA}','employment.hired', now(), '${aAdmin}','employee','${aClin}'),
           ('${clinicA}','employment.hired', now(), '${aAdmin}','employee','${aOtherClin}')`);
  await as(aClin, async () => {
    eq(await visible("organization_events"), 1, "own events");
    eq(await visible("my_organization_timeline"), 1, "own timeline");
  });
});

await check("HR-confidential events do not leak to a clinical peer", async () => {
  await as(aOtherClin, async () =>
    eq(await visible("organization_events", `subject_employee = '${aClin}'`), 0, "a colleague's hire event"));
});

await check("nobody can forge an event in another person's name", async () => {
  await as(aClin, () => insertRaises(
    `insert into organization_events (clinic_id, event_type, occurred_at, actor_id, subject_type, subject_employee)
     values ('${clinicA}','employment.ended', now(), '${aAdmin}','employee','${aOtherClin}')`,
    "forged actor"));
});

// --------------------------------------------------------------------------
// Permissions administration
// --------------------------------------------------------------------------
await check("everyone can read the action catalogue and their own permissions", async () => {
  await as(aClin, async () => {
    if ((await visible("permission_actions")) < 20) throw new Error("catalogue not readable");
    if ((await visible("my_permissions", "granted")) < 1) throw new Error("own permissions not readable");
  });
});

await check("a clinician cannot grant themselves anything", async () => {
  await as(aClin, () => insertRaises(
    `insert into user_permission_grants (clinic_id, user_id, action, granted, reason)
     values ('${clinicA}','${aClin}','finance.payroll.run', true, 'because')`,
    "self-granted permission"));
});

await check("a clinician cannot rewrite the role matrix", async () => {
  await as(aClin, () => updateAffects(
    `update role_permissions set granted = true where role = 'clinician' and action = 'finance.payroll.run'`,
    0, "clinician editing the matrix"));
});

await check("platform defaults cannot be edited by any clinic", async () => {
  await as(aAdmin, () => updateAffects(
    `update role_permissions set granted = false where clinic_id is null and role = 'admin'`,
    0, "admin editing platform defaults"));
});

// --------------------------------------------------------------------------
// The exclusion constraints, now that btree_gist is loaded
// --------------------------------------------------------------------------
await check("two positions on one engagement cannot overlap in time", async () => {
  await insertRaises(
    `insert into employment_positions (clinic_id, employment_id, effective_from, effective_to, position_title, employment_type)
     values ('${clinicA}','${empClin}','2026-06-01','2026-12-31','Senior Therapist','full_time')`,
    "overlapping position");
  // An adjacent one, starting the day after the open one is closed, is fine.
  await db.exec(`update employment_positions set effective_to='2026-05-31'
                  where employment_id='${empClin}' and effective_to is null`);
  await db.exec(`insert into employment_positions (clinic_id, employment_id, effective_from, position_title, employment_type)
                 values ('${clinicA}','${empClin}','2026-06-01','Senior Therapist','full_time')`);
});

await check("pay periods cannot overlap within a clinic", async () => {
  await db.exec(`insert into pay_periods (clinic_id, starts_on, ends_on)
                 values ('${clinicA}','2026-03-08','2026-03-21')`);
  await insertRaises(
    `insert into pay_periods (clinic_id, starts_on, ends_on) values ('${clinicA}','2026-03-15','2026-03-28')`,
    "overlapping pay period");
  // The same dates in another clinic are unrelated and must be allowed.
  await db.exec(`insert into pay_periods (clinic_id, starts_on, ends_on)
                 values ('${clinicB}','2026-03-15','2026-03-28')`);
});

await check("two pay rates cannot be effective at once", async () => {
  await insertRaises(
    `insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
     values ('${clinicA}','${empClin}','hourly', 45, '2026-04-01','annual_review')`,
    "overlapping pay rate");
  await db.exec(`update pay_rates set effective_to='2026-03-31' where employment_id='${empClin}'`);
  await db.exec(`insert into pay_rates (clinic_id, employment_id, basis, amount, effective_from, change_reason)
                 values ('${clinicA}','${empClin}','hourly', 45, '2026-04-01','annual_review')`);
});

// --------------------------------------------------------------------------
// 0032 · profiles, and the privilege-escalation guard
// --------------------------------------------------------------------------
await check("a person reads their own profile and their clinic's, not another clinic's", async () => {
  await as(aClin, async () => {
    if ((await visible("profiles")) < 2) throw new Error("cannot see clinic colleagues");
    eq(await visible("profiles", `clinic_id = '${clinicB}'`), 0, "another clinic's profiles");
  });
});

await check("the policies on profiles do not recurse through auth_clinic_id", async () => {
  // auth_clinic_id() selects from profiles and is called by a policy ON
  // profiles. It is SECURITY DEFINER, so row security does not apply inside
  // it. If that ever stopped being true, this would not return a count — it
  // would error with infinite recursion.
  await as(aClin, async () => {
    if (!((await visible("profiles")) > 0)) throw new Error("own profile not visible");
  });
});

await check("a clinician cannot promote themselves to admin", async () => {
  await as(aClin, async () => {
    let raised = false;
    try { await db.exec(`update profiles set role = 'admin' where id = '${aClin}'`); }
    catch { raised = true; }
    if (!raised) throw new Error("the escalation was allowed");
  });
  eq((await db.query(`select role from profiles where id='${aClin}'`)).rows[0].role,
     "clinician", "role after the attempt");
});

await check("a clinician can still edit their own name", async () => {
  await as(aClin, () => updateAffects(
    `update profiles set full_name = 'A. Clinician' where id = '${aClin}'`, 1, "own name"));
});

await check("a clinician cannot edit a colleague's profile", async () => {
  await as(aClin, () => updateAffects(
    `update profiles set full_name = 'Renamed' where id = '${aOtherClin}'`, 0, "colleague's name"));
});

await check("nobody moves a person between clinics by editing a row", async () => {
  await as(aAdmin, async () => {
    let raised = false;
    try { await db.exec(`update profiles set clinic_id = '${clinicB}' where id = '${aClin}'`); }
    catch { raised = true; }
    if (!raised) throw new Error("the clinic transfer was allowed");
  });
});

await check("an admin can change a colleague's role, which is what the action is for", async () => {
  await as(aAdmin, () => updateAffects(
    `update profiles set role = 'supervisor' where id = '${aOtherClin}'`, 1, "admin promoting"));
  await db.exec(`update profiles set role='clinician' where id='${aOtherClin}'`);
});

await check("nobody deletes a profile through the API", async () => {
  await as(aAdmin, async () => {
    const res = await db.query(`delete from profiles where id = '${aOtherClin}'`);
    eq(res.affectedRows ?? 0, 0, "rows deleted");
  });
});

await check("rls_coverage reports no inert policies anywhere in the schema", async () => {
  const rows = (await db.query(
    `select table_name from rls_coverage where status like 'POLICIES INERT%'`)).rows;
  if (rows.length) throw new Error(`inert policies on: ${rows.map((r) => r.table_name).join(", ")}`);
});

await check("the eight scheduler tables now actually filter", async () => {
  await as(bAdmin, async () => {
    eq(await visible("clients"), 1, "clinic B admin sees only their own client");
    eq(await visible("clients", `clinic_id = '${clinicA}'`), 0, "clinic A's clients");
  });
  await as(aHr, async () => eq(await visible("clients"), 0, "HR admin reading clients"));
});

// --------------------------------------------------------------------------
// 0047 · households, guardians and per-relationship permissions
//
// These are the brief's own acceptance flows, written as assertions:
//   Flow B  one parent, two children, switching between them
//   Flow C  two parents on one household with different permissions
// plus the cross-household isolation the portal rests on.
// --------------------------------------------------------------------------
const parentA = await mkUser("parent_a", "client", clinicA);
const parentB = await mkUser("parent_b", "client", clinicA);
const outsider = await mkUser("outsider", "client", clinicA);

const maya = (await db.query(
  `insert into clients (name, status, clinic_id) values ('Maya','active','${clinicA}') returning id`)).rows[0].id;
const noah = (await db.query(
  `insert into clients (name, status, clinic_id) values ('Noah','active','${clinicA}') returning id`)).rows[0].id;

const household = (await db.query(
  `insert into households (clinic_id, name) values ('${clinicA}','Yankov Family') returning id`)).rows[0].id;

await db.exec(`insert into household_members (clinic_id, household_id, full_name, relationship, client_id)
               values ('${clinicA}','${household}','Maya','self',${maya}),
                      ('${clinicA}','${household}','Noah','self',${noah})`);
await db.exec(`insert into household_members (clinic_id, household_id, full_name, relationship, user_id)
               values ('${clinicA}','${household}','Adina','parent','${parentA}'),
                      ('${clinicA}','${household}','Ian','parent','${parentB}')`);

// Parent A: both children, everything. Parent B: both children, no billing.
for (const [who, child] of [[parentA, maya], [parentA, noah], [parentB, maya], [parentB, noah]]) {
  await db.exec(`insert into guardian_relationships (clinic_id, user_id, client_id, household_id, status)
                 values ('${clinicA}','${who}',${child},'${household}','ACTIVE')`);
}
await db.exec(`update relationship_permissions set granted = true
                where relationship_id in (select id from guardian_relationships where user_id='${parentA}')`);
await db.exec(`update relationship_permissions set granted = true
                where relationship_id in (select id from guardian_relationships where user_id='${parentB}')
                  and permission not in ('view_billing','pay_invoices','manage_payment_methods',
                                         'receive_financial_notifications')`);

await check("one login reaches both children — the thing the old scalar could not do", async () => {
  await as(parentA, async () => {
    const n = await count(`select count(*)::int n from my_family`);
    eq(n, 2, "children visible to one parent");
  });
});

await check("the legacy one-login-one-child link cannot represent this family at all", async () => {
  // Not a style point. clients_user_id_unique physically refuses to link one
  // parent to a second child, which is why families were given a login per
  // child or a fabricated email. And if the link were somehow made, the scalar
  // `select id from clients where user_id = auth.uid()` that every client
  // policy reads would raise rather than pick one.
  await db.exec(`update clients set user_id='${parentA}' where id = ${maya}`);
  let refused = false;
  try { await db.exec(`update clients set user_id='${parentA}' where id = ${noah}`); }
  catch (e) { refused = /clients_user_id_unique|duplicate key/.test(e.message); }
  await db.exec(`update clients set user_id = null where id in (${maya}, ${noah})`);
  if (!refused) throw new Error("expected the unique index to refuse a second child");
});

await check("auth_accessible_client_ids returns a set, not a scalar", async () => {
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from public.auth_accessible_client_ids()`), 2, "accessible ids");
  });
});

await check("a parent cannot reach a child outside their household", async () => {
  await as(outsider, async () => {
    eq(await count(`select count(*)::int n from my_family`), 0, "outsider's family");
    eq(await count(`select count(*)::int n from public.auth_accessible_client_ids()`), 0, "outsider's clients");
  });
});

await check("Flow C: the parent without billing permission is refused it", async () => {
  await as(parentB, async () => {
    eq((await one(`select public.auth_guardian_can(${maya}, 'view_billing') g`)).g, false, "billing");
    eq((await one(`select public.auth_guardian_can(${maya}, 'pay_invoices') g`)).g, false, "payment");
    // and still holds what they were granted
    eq((await one(`select public.auth_guardian_can(${maya}, 'view_appointments') g`)).g, true, "appointments");
    eq((await one(`select public.auth_guardian_can(${maya}, 'view_clinical_progress') g`)).g, true, "progress");
  });
  await as(parentA, async () =>
    eq((await one(`select public.auth_guardian_can(${maya}, 'view_billing') g`)).g, true, "parent A billing"));
});

await check("permissions are per child, not per person", async () => {
  // The custody case: same parent, different access to each sibling.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_clinical_progress'
                    and relationship_id = (select id from guardian_relationships
                                            where user_id='${parentB}' and client_id=${noah})`);
  await as(parentB, async () => {
    eq((await one(`select public.auth_guardian_can(${maya}, 'view_clinical_progress') g`)).g, true, "Maya");
    eq((await one(`select public.auth_guardian_can(${noah}, 'view_clinical_progress') g`)).g, false, "Noah");
  });
});

await check("revoking a relationship removes access immediately", async () => {
  await db.exec(`update guardian_relationships
                    set status='REVOKED', revoked_at=now()
                  where user_id='${parentB}' and client_id=${noah}`);
  await as(parentB, async () => {
    eq(await count(`select count(*)::int n from my_family`), 1, "children after revoke");
    eq((await one(`select public.auth_guardian_can(${noah}, 'view_appointments') g`)).g, false, "revoked child");
  });
});

await check("an expired relationship stops granting access on its own", async () => {
  await db.exec(`update guardian_relationships
                    set status='ACTIVE', revoked_at=null, ends_on = current_date - 1
                  where user_id='${parentB}' and client_id=${noah}`);
  await as(parentB, async () =>
    eq((await one(`select public.auth_guardian_can(${noah}, 'view_appointments') g`)).g, false, "expired"));
});

await check("a guardian cannot grant themselves access or widen permissions", async () => {
  await as(outsider, () => insertRaises(
    `insert into guardian_relationships (clinic_id, user_id, client_id, status)
     values ('${clinicA}','${outsider}',${maya},'ACTIVE')`,
    "self-granted guardianship"));
  await as(parentB, () => updateAffects(
    `update relationship_permissions set granted = true
      where relationship_id in (select id from guardian_relationships where user_id='${parentB}')
        and permission = 'view_billing'`,
    0, "widening own permissions"));
});

await check("a guardian cannot read another guardian's relationship", async () => {
  // restriction_note is frequently the substance of a court order; the other
  // parent must not be able to read it out of the portal.
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from guardian_relationships where user_id='${parentA}'`),
       0, "other parent's relationships"));
});

await check("a household is invisible to anyone outside it", async () => {
  await as(outsider, async () =>
    eq(await count(`select count(*)::int n from households`), 0, "households visible to an outsider"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from households`), 1, "own household"));
});

await check("a child is never in two households", async () => {
  const other = (await db.query(
    `insert into households (clinic_id, name) values ('${clinicA}','Other Family') returning id`)).rows[0].id;
  await insertRaises(
    `insert into household_members (clinic_id, household_id, full_name, relationship, client_id)
     values ('${clinicA}','${other}','Maya','self',${maya})`,
    "same child in two households");
});

// --------------------------------------------------------------------------
// 0048 · family tasks, derived and permission-filtered
// --------------------------------------------------------------------------
await check("a task appears from a real appointment and vanishes when it changes", async () => {
  const staffRow = (await db.query(
    `insert into staff (name, clinic_id) values ('Clinician','${clinicA}') returning id`)).rows[0].id;
  const sess = (await db.query(
    `insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
     values (${maya}, ${staffRow}, current_date + 3, 16, 0, 'Direct Therapy', 'scheduled', '${clinicA}')
     returning id`)).rows[0].id;

  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where kind='appointment'`),
       1, "appointment task"));

  // Nothing marks it done. Confirming the appointment is what removes it.
  await db.exec(`update sessions set status='completed' where id=${sess}`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where kind='appointment'`),
       0, "task after the appointment is no longer scheduled"));
  await db.exec(`delete from sessions where id=${sess}`);
});

await check("a task about a child you cannot see never appears", async () => {
  const outsiderChild = (await db.query(
    `insert into clients (name, status, clinic_id) values ('Someone Else','active','${clinicA}') returning id`)).rows[0].id;
  const st = (await db.query(
    `insert into staff (name, clinic_id) values ('Other','${clinicA}') returning id`)).rows[0].id;
  await db.exec(`insert into sessions (client_id, employee_id, session_date, hour, minute, type, status, clinic_id)
                 values (${outsiderChild}, ${st}, current_date + 2, 9, 0, 'Direct Therapy', 'scheduled', '${clinicA}')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where client_id=${outsiderChild}`),
       0, "another family's task"));
});

await check("a guardian without billing access is never told funding is low", async () => {
  const b = (await db.query(
    `insert into client_budgets (clinic_id, client_id, name, funding_source, allocated_amount, period_start, period_end)
     values ('${clinicA}', ${maya}, '2026 Allocation', 'Program', 1000, current_date - 30, current_date + 200)
     returning id`)).rows[0].id;
  await db.exec(`insert into budget_entries (clinic_id, budget_id, entry_date, kind, description, amount)
                 values ('${clinicA}','${b}', current_date - 1, 'CHARGE', 'Sessions', 920)`);

  // Parent A holds view_billing; parent B was denied it earlier in this file.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where kind='funding'`) > 0,
       true, "parent A sees the funding task"));
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where kind='funding'`),
       0, "parent B sees a funding task"));
});

await check("the raw view still carries the permission a caller would need", async () => {
  // family_tasks itself is unfiltered by design so a staff surface can reason
  // about it; my_family_tasks() is the one the portal reads.
  const r = await one(`select required_permission from family_tasks where kind='funding' limit 1`);
  eq(r.required_permission, "view_billing", "required permission on the raw view");
});

// --------------------------------------------------------------------------
// 0049 · progress, milestones and family observations
// --------------------------------------------------------------------------
const goal = (await db.query(
  `insert into programs (clinic_id, client_id, name, domain, measurement_mode,
                         operational_definition, mastery_pct, created_by, status)
   values ('${clinicA}', ${maya}, 'Ask for help independently', 'Communication', 'dtt',
           'Independently requests assistance', 80, '${aClin}', 'active')
   returning id`)).rows[0].id;

await check("Flow F: a mastered goal does NOT reach the family until it is shared", async () => {
  const m = (await db.query(
    `insert into family_milestones (clinic_id, client_id, program_id, kind, title, occurred_on)
     values ('${clinicA}', ${maya}, '${goal}', 'goal_mastered', 'Independent jacket fastening', current_date)
     returning id`)).rows[0].id;

  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from family_milestones`), 0, "unshared milestone visible"));

  await db.exec(`update family_milestones
                    set shared_with_family = true, shared_at = now(), shared_by = '${aClin}'
                  where id = '${m}'`);

  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from family_milestones`), 1, "shared milestone"));
});

await check("a milestone cannot be marked shared without recording who shared it", async () => {
  await insertRaises(
    `insert into family_milestones (clinic_id, client_id, kind, title, shared_with_family)
     values ('${clinicA}', ${maya}, 'new_skill', 'Untraceable', true)`,
    "shared with no sharer");
});

await check("a guardian without clinical access sees no milestones at all", async () => {
  // Parent B holds view_clinical_progress for Maya but it was revoked for Noah
  // earlier; deny Maya too and confirm the milestone disappears.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_clinical_progress'
                    and relationship_id = (select id from guardian_relationships
                                            where user_id='${parentB}' and client_id=${maya})`);
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from family_milestones`), 0, "milestones without clinical access"));
  await db.exec(`update relationship_permissions set granted = true
                  where permission = 'view_clinical_progress'
                    and relationship_id = (select id from guardian_relationships
                                            where user_id='${parentB}' and client_id=${maya})`);
});

await check("trend says not_enough_data rather than reading a shape into noise", async () => {
  const r = await one(`select trend, sessions_with_data from client_goal_progress where program_id='${goal}'`);
  eq(r.trend, "not_enough_data", "trend with no sessions");
  eq(r.sessions_with_data, 0, "session count");
});

await check("Flow H: a family observation is stored as one, not as clinical data", async () => {
  await as(parentA, async () => {
    await db.exec(`insert into family_observations (clinic_id, client_id, author_user_id, kind, body)
                   values ('${clinicA}', ${maya}, '${parentA}', 'home_win',
                           'She ordered her own food today.')`);
  });

  // It exists as an observation...
  eq(await count(`select count(*)::int n from family_observations where client_id=${maya}`), 1, "observation stored");
  // ...and nowhere near the clinical measurements.
  eq(await count(`select count(*)::int n from session_program_summaries where program_id='${goal}'`),
     0, "observation leaked into clinical data");

  // And it is labelled as a family observation everywhere it surfaces.
  await as(parentA, async () => {
    const r = await one(`select source from my_family_timeline where entry_id like 'observation:%' limit 1`);
    eq(r.source, "family_observation", "timeline provenance");
  });
});

await check("a parent cannot write an observation about someone else's child", async () => {
  await as(outsider, () => insertRaises(
    `insert into family_observations (clinic_id, client_id, author_user_id, kind, body)
     values ('${clinicA}', ${maya}, '${outsider}', 'home_win', 'Not my child')`,
    "observation about another family's child"));
});

await check("a parent cannot post an observation under another parent's name", async () => {
  await as(parentA, () => insertRaises(
    `insert into family_observations (clinic_id, client_id, author_user_id, kind, body)
     values ('${clinicA}', ${maya}, '${parentB}', 'home_win', 'Signed as Ian')`,
    "forged observation author"));
});

await check("an observation cannot be edited after the fact by the family", async () => {
  await as(parentA, () => updateAffects(
    `update family_observations set body = 'rewritten' where client_id = ${maya}`,
    0, "family editing an observation"));
});

await check("the timeline carries both sources and keeps them distinguishable", async () => {
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from my_family_timeline where source='milestone'`), 1, "milestones");
    eq(await count(`select count(*)::int n from my_family_timeline where source='family_observation'`), 1, "observations");
  });
});

await check("my_goal_progress is empty for a guardian without clinical access", async () => {
  await as(outsider, async () =>
    eq(await count(`select count(*)::int n from public.my_goal_progress()`), 0, "outsider's progress"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_goal_progress() where program_id='${goal}'`),
       1, "parent A's progress"));
});

// --------------------------------------------------------------------------
// 0050 · Secure messaging
//
// The requirement everything else here serves: an internal staff note must not
// be reachable by a family. Not filtered in a page — unreachable. So the test
// that matters reads `messages` as a parent with NO where-clause at all, which
// is what a forgotten filter or a crafted PostgREST call looks like.
// --------------------------------------------------------------------------

// A guardian on this household who may NOT message the clinic. Tests that
// household membership alone does not open a thread.
const silent = await mkUser("silent", "client", clinicA);
await db.exec(`insert into household_members (clinic_id, household_id, full_name, relationship, user_id)
               values ('${clinicA}','${household}','Quiet','other_relative','${silent}')`);
await db.exec(`insert into guardian_relationships (clinic_id, user_id, client_id, household_id, status)
               values ('${clinicA}','${silent}',${maya},'${household}','ACTIVE')`);
await db.exec(`update relationship_permissions set granted = false
                where permission = 'message_clinic'
                  and relationship_id in (select id from guardian_relationships where user_id='${silent}')`);

const thread = (await db.query(
  `insert into message_threads (clinic_id, household_id, client_id, subject, category, started_by)
   values ('${clinicA}','${household}',${maya},'Maya''s Tuesday session','scheduling','${parentA}')
   returning id`)).rows[0].id;

await db.exec(`insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
               values ('${clinicA}','${thread}','${parentA}','family','Can we move Tuesday?')`);
await db.exec(`insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
               values ('${clinicA}','${thread}','${aClin}','staff','Yes, Thursday 4pm works.')`);
const internal = (await db.query(
  `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body, visibility)
   values ('${clinicA}','${thread}','${aClin}','staff','Parent seems overwhelmed; flag to supervisor.','internal')
   returning id`)).rows[0].id;

await check("a family reading the messages table unfiltered still cannot see an internal note", async () => {
  await as(parentA, async () => {
    // Deliberately no visibility filter. This is the query a page would run if
    // someone forgot, and the query an attacker would craft on purpose.
    eq(await count(`select count(*)::int n from messages`), 2, "messages visible to a parent");
    eq(await count(`select count(*)::int n from messages where id = '${internal}'`), 0, "the internal note");
  });
});

await check("the internal note does not even produce an unread badge", async () => {
  await as(parentA, async () => {
    const row = await one(`select unread_count, last_message_preview from my_message_threads
                            where thread_id = '${thread}'`);
    eq(row.unread_count, 2, "unread");
    if (String(row.last_message_preview).includes("overwhelmed"))
      throw new Error("the internal note leaked through the preview");
  });
});

await check("an internal note does not move the thread into 'awaiting family'", async () => {
  // The staff reply already did that; the internal note must not re-touch it.
  const t0 = await one(`select last_message_at from message_threads where id='${thread}'`);
  await db.exec(`insert into messages (clinic_id, thread_id, author_user_id, author_kind, body, visibility)
                 values ('${clinicA}','${thread}','${aClin}','staff','Second internal note.','internal')`);
  const t1 = await one(`select last_message_at from message_threads where id='${thread}'`);
  eq(String(t0.last_message_at), String(t1.last_message_at), "an internal note bumped the thread");
});

await check("staff see the whole thread, internal notes included", async () => {
  await as(aClin, async () =>
    eq(await count(`select count(*)::int n from messages where thread_id='${thread}'`), 4, "staff view"));
});

await check("a family member cannot author an internal note, even by asking for one", async () => {
  await as(parentA, () => insertRaises(
    `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body, visibility)
     values ('${clinicA}','${thread}','${parentA}','family','hidden','internal')`,
    "family-authored internal note"));
});

await check("a family member cannot post as staff", async () => {
  await as(parentA, () => insertRaises(
    `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
     values ('${clinicA}','${thread}','${parentA}','staff','Approved by the clinic')`,
    "family posting as staff"));
});

await check("a family member cannot post under another person's name", async () => {
  await as(parentA, () => insertRaises(
    `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
     values ('${clinicA}','${thread}','${parentB}','family','Signed as Ian')`,
    "forged message author"));
});

await check("a sent message cannot be edited or deleted by the family", async () => {
  await as(parentA, async () => {
    await updateAffects(`update messages set body='rewritten' where thread_id='${thread}'`, 0, "family edit");
    const res = await db.query(`delete from messages where thread_id='${thread}'`);
    eq(res.affectedRows ?? 0, 0, "family delete");
  });
});

await check("a guardian without message_clinic reaches no thread at all", async () => {
  await as(silent, async () => {
    eq(await count(`select count(*)::int n from message_threads`), 0, "threads");
    eq(await count(`select count(*)::int n from messages`), 0, "messages");
    eq(await count(`select count(*)::int n from my_message_threads`), 0, "inbox");
  });
  await as(silent, () => insertRaises(
    `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
     values ('${clinicA}','${thread}','${silent}','family','Let me in')`,
    "reply without message_clinic"));
});

await check("a household thread is reachable by a guardian of any child in it", async () => {
  const houseThread = (await db.query(
    `insert into message_threads (clinic_id, household_id, subject, started_by)
     values ('${clinicA}','${household}','Address change','${parentB}') returning id`)).rows[0].id;
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from message_threads where id='${houseThread}'`), 1, "household thread"));
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from message_threads where id='${houseThread}'`), 0, "silent guardian"));
});

await check("an unrelated family reaches nothing", async () => {
  await as(outsider, async () => {
    eq(await count(`select count(*)::int n from message_threads`), 0, "threads");
    eq(await count(`select count(*)::int n from messages`), 0, "messages");
  });
});

await check("another clinic's staff reach nothing", async () => {
  await as(bAdmin, async () => {
    eq(await count(`select count(*)::int n from message_threads`), 0, "cross-tenant threads");
    eq(await count(`select count(*)::int n from messages`), 0, "cross-tenant messages");
  });
});

await check("a family cannot open a thread on someone else's household", async () => {
  const otherHouse = (await db.query(
    `insert into households (clinic_id, name) values ('${clinicA}','Other Family') returning id`)).rows[0].id;
  await as(parentA, () => insertRaises(
    `insert into message_threads (clinic_id, household_id, subject, started_by)
     values ('${clinicA}','${otherHouse}','Prying','${parentA}')`,
    "thread on a foreign household"));
});

await check("a family cannot open a thread at high priority", async () => {
  await as(parentA, () => insertRaises(
    `insert into message_threads (clinic_id, household_id, client_id, subject, priority, started_by)
     values ('${clinicA}','${household}',${maya},'Urgent','high','${parentA}')`,
    "family-set priority"));
});

await check("a family cannot reassign, reclassify or resolve their own thread", async () => {
  await as(parentA, async () => {
    await updateAffects(`update message_threads set status='resolved', resolved_at=now()
                          where id='${thread}'`, 0, "family resolving");
    await updateAffects(`update message_threads set assigned_to='${aClin}' where id='${thread}'`, 0, "family assigning");
  });
});

await check("a family reply reopens a resolved thread rather than vanishing into it", async () => {
  await db.exec(`update message_threads set status='resolved', resolved_at=now(), resolved_by='${aClin}'
                  where id='${thread}'`);
  await db.exec(`insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
                 values ('${clinicA}','${thread}','${parentA}','family','Actually, one more thing.')`);
  const row = await one(`select status, resolved_at from message_threads where id='${thread}'`);
  eq(row.status, "open", "status after a family reply");
  if (row.resolved_at !== null) throw new Error("resolved_at survived the reopen");
});

await check("an attachment is only as visible as the message it hangs off", async () => {
  await db.exec(`insert into message_attachments
                   (clinic_id, message_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
                 values ('${clinicA}','${internal}','x/1.pdf','supervision.pdf','application/pdf',900,'${aClin}')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from message_attachments`), 0, "attachment on an internal note"));
  await as(aClin, async () =>
    eq(await count(`select count(*)::int n from message_attachments`), 1, "staff view of the attachment"));
});

await check("an executable masquerading as a document is refused by the database", async () => {
  const shared = (await one(`select id from messages where thread_id='${thread}'
                              and visibility='shared' limit 1`)).id;
  await insertRaises(
    `insert into message_attachments
       (clinic_id, message_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
     values ('${clinicA}','${shared}','x/2','report.pdf.exe','application/x-msdownload',10,'${aClin}')`,
    "disallowed content type");
  await insertRaises(
    `insert into message_attachments
       (clinic_id, message_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
     values ('${clinicA}','${shared}','x/3','huge.pdf','application/pdf',99999999,'${aClin}')`,
    "oversized attachment");
});

// --------------------------------------------------------------------------
// 0052 · The two things that made every policy above optional
//
// A Postgres view runs as its OWNER unless it is declared
// `security_invoker = true`, so RLS on the tables underneath was never applied
// to anyone reading through a view — which is how every page in every portal
// reads. These tests are the ones that would have caught it.
// --------------------------------------------------------------------------

await check("every view in the schema evaluates the CALLER's policies, not its owner's", async () => {
  const off = (await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker'), 'false') <> 'true'`)).rows;
  if (off.length) throw new Error(`views without security_invoker: ${off.map(r => r.relname).join(", ")}`);
});

await check("no view hands a second clinic's rows to that clinic's admin", async () => {
  const views = (await db.query(`
    select c.relname as name from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'clinic_id' and a.attnum > 0
     where n.nspname = 'public' and c.relkind = 'v'`)).rows;
  const bad = [];
  for (const v of views) {
    await as(bAdmin, async () => {
      const n = await count(`select count(*)::int n from public.${v.name} where clinic_id = '${clinicA}'`);
      if (n > 0) bad.push(`${v.name}(${n})`);
    });
  }
  if (bad.length) throw new Error(`clinic A rows visible to clinic B: ${bad.join(", ")}`);
});

await check("no view hands anything to a family with no relationship to anyone", async () => {
  // `my_permissions` is excluded, and only it: every row is the action
  // catalogue with a `granted` flag computed for the caller, so reading it
  // reveals the names of actions you do not have and nothing about anyone
  // else. The portal needs it to ask what the signed-in person may do.
  const views = (await db.query(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname <> 'my_permissions'`)).rows;
  const bad = [];
  for (const v of views) {
    await as(outsider, async () => {
      const n = await count(`select count(*)::int n from public.${v.name}`);
      if (n > 0) bad.push(`${v.name}(${n})`);
    });
  }
  if (bad.length) throw new Error(`visible to an unrelated family: ${bad.join(", ")}`);
});

await check("a guardian can read household_members at all", async () => {
  // The policy asked a question about household_members from inside the
  // household_members policy, so every read raised "infinite recursion" — the
  // family-contacts feature was broken, not restricted. Invisible while the
  // views were bypassing the policy entirely.
  await as(parentA, async () => {
    const n = await count(`select count(*)::int n from household_members`);
    if (n === 0) throw new Error("a guardian sees nobody on their own family record");
  });
});

await check("the client-facing tables are reachable through the household model, not the old scalar", async () => {
  // Before 0052: clients and sessions had no family policy at all, and
  // programs / client_budgets / budget_entries / session_notes were keyed on
  // auth_client_row_id(), which returns null for every guardian.
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from clients`), 2, "children readable directly");
    eq(await count(`select count(*)::int n from programs`), 1, "programs");
    eq(await count(`select count(*)::int n from client_budgets`), 1, "budgets");
    eq(await count(`select count(*)::int n from budget_entries`), 1, "budget entries");
  });
});

await check("the legacy one-child link grants a guardian nothing", async () => {
  // Kept as a tripwire: if a policy is ever written in terms of
  // auth_client_row_id() again, it will silently grant nothing rather than
  // loudly fail, which is the failure mode this whole migration exists for.
  await as(parentA, async () =>
    eq((await one(`select public.auth_client_row_id() is null as legacy_dead`)).legacy_dead,
       true, "auth_client_row_id for a guardian"));
});

await check("a guardian without billing reads no budget through the table itself", async () => {
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from client_budgets`), 0, "parent B's budgets"));
});

await check("operator diagnostics are not readable by a family", async () => {
  for (const v of ["rls_coverage", "deployment_readiness", "receipt_readiness"]) {
    await as(parentA, async () =>
      eq(await count(`select count(*)::int n from public.${v}`), 0, v));
  }
  // Still readable by the people they are for.
  await as(aAdmin, async () => {
    const n = await count(`select count(*)::int n from rls_coverage`);
    if (n === 0) throw new Error("an admin can no longer read rls_coverage");
  });
});

// --------------------------------------------------------------------------
// 0053 · Merging two parallel builds
//
// Main built four family-facing features against auth_client_row_id(), the
// one-login-one-child link 0047 replaced. On the merged tree every one of them
// returned nothing to a guardian and refused their writes. These are the tests
// that say so, and that the permission gates are real rather than decorative.
// --------------------------------------------------------------------------

const sess = (await db.query(
  `insert into sessions (clinic_id, client_id, session_date, hour, status, type)
   values ('${clinicA}', ${maya}, current_date + 3, 14, 'scheduled', 'Session') returning id`)).rows[0].id;

await db.exec(`insert into client_documents
                 (clinic_id, client_id, file_path, title, direction, uploaded_by)
               values ('${clinicA}', ${maya}, 'x/report.pdf', 'Assessment report',
                       'staff_to_client', '${aClin}')`);
await db.exec(`insert into home_program_activities
                 (clinic_id, client_id, title, assigned_by)
               values ('${clinicA}', ${maya}, 'Practise requesting help', '${aClin}')`);
await db.exec(`insert into session_change_requests
                 (clinic_id, session_id, client_id, request_type, created_by)
               values ('${clinicA}', ${sess}, ${maya}, 'reschedule', '${parentA}')`);

await check("a guardian reaches main's documents, home program and change requests", async () => {
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from client_documents`), 1, "documents");
    eq(await count(`select count(*)::int n from home_program_activities`), 1, "home program");
    eq(await count(`select count(*)::int n from session_change_requests`), 1, "change requests");
  });
});

await check("a guardian can still upload a document, and only in their own direction", async () => {
  await as(parentA, async () => {
    await db.exec(`insert into client_documents
                     (clinic_id, client_id, file_path, title, direction, uploaded_by)
                   values ('${clinicA}', ${maya}, 'x/consent.pdf', 'Signed consent',
                           'client_to_staff', '${parentA}')`);
  });
  // Not in the staff direction, which would let a family plant a document that
  // reads as though the clinic sent it.
  await as(parentA, () => insertRaises(
    `insert into client_documents (clinic_id, client_id, file_path, title, direction, uploaded_by)
     values ('${clinicA}', ${maya}, 'x/fake.pdf', 'From the clinic', 'staff_to_client', '${parentA}')`,
    "family-uploaded staff document"));
});

await check("requesting a change needs manage_appointments, not merely view_appointments", async () => {
  // parentA holds everything; the request lands.
  await as(parentA, async () => {
    await db.exec(`insert into session_change_requests
                     (clinic_id, session_id, client_id, request_type, created_by)
                   values ('${clinicA}', ${sess}, ${maya}, 'cancel', '${parentA}')`);
  });
  // silent holds view_appointments but not manage_appointments.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'manage_appointments'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${silent}')`);
  await as(silent, () => insertRaises(
    `insert into session_change_requests (clinic_id, session_id, client_id, request_type, created_by)
     values ('${clinicA}', ${sess}, ${maya}, 'cancel', '${silent}')`,
    "change request without manage_appointments"));
});

await check("a guardian without clinical access sees no home-program work", async () => {
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_clinical_progress'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${silent}')`);
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from home_program_activities`), 0, "home program"));
});

await check("an unrelated family reaches none of main's four surfaces", async () => {
  await as(outsider, async () => {
    for (const t of ["client_documents", "home_program_activities",
                     "session_change_requests", "client_messages"]) {
      eq(await count(`select count(*)::int n from public.${t}`), 0, t);
    }
  });
});

await check("client_messages is an archive: readable, but nothing new lands there", async () => {
  await as(parentA, () => insertRaises(
    `insert into client_messages (clinic_id, client_id, sender_user_id, sender_role, body)
     values ('${clinicA}', ${maya}, '${parentA}', 'client', 'new message')`,
    "family write to the retired table"));
  await as(aClin, () => insertRaises(
    `insert into client_messages (clinic_id, client_id, sender_user_id, sender_role, body)
     values ('${clinicA}', ${maya}, '${aClin}', 'clinician', 'new reply')`,
    "staff write to the retired table"));
});

await check("a thread's clinic is derived from the child, never taken from the request", async () => {
  // The gap 0013 flagged and main solved for client_messages: a row claiming
  // clinic B while its client lives in clinic A would sit in the wrong queue.
  const t = (await db.query(
    `insert into message_threads (clinic_id, household_id, client_id, subject, started_by)
     values ('${clinicB}', '${household}', ${maya}, 'Wrong clinic', '${parentA}')
     returning id, clinic_id`)).rows[0];
  eq(t.clinic_id, clinicA, "derived clinic");
  const m = (await db.query(
    `insert into messages (clinic_id, thread_id, author_user_id, author_kind, body)
     values ('${clinicB}', '${t.id}', '${aClin}', 'staff', 'hello') returning clinic_id`)).rows[0];
  eq(m.clinic_id, clinicA, "derived message clinic");
});

await check("staff messaging is gated on the care-team action, not on client-file access", async () => {
  // A scheduler may read a client file; the family's care conversation is not
  // part of that. Main's action catalogue says so and now governs 0050's
  // tables too.
  const scheduler = await mkUser("a_sched2", "scheduler", clinicA);
  await as(scheduler, async () => {
    eq(await count(`select count(*)::int n from message_threads`), 0, "scheduler threads");
    eq(await count(`select count(*)::int n from messages`), 0, "scheduler messages");
  });
  await as(aClin, async () => {
    const n = await count(`select count(*)::int n from message_threads`);
    if (n === 0) throw new Error("a clinician can no longer read any thread");
  });
});

// --------------------------------------------------------------------------
// 0051 · Announcements and the notification centre
// --------------------------------------------------------------------------
const annAll = (await db.query(
  `insert into announcements (clinic_id, audience, title, body, category, created_by)
   values ('${clinicA}', 'all_families', 'Holiday closure',
           'The clinic is closed on 8 September.', 'closure', '${aAdmin}')
   returning id`)).rows[0].id;
const annHouse = (await db.query(
  `insert into announcements (clinic_id, audience, household_id, title, body, created_by)
   values ('${clinicA}', 'household', '${household}', 'Your intake is complete',
           'Everything is on file.', '${aAdmin}')
   returning id`)).rows[0].id;

await check("a family sees a clinic-wide announcement and their own household's", async () => {
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from my_announcements`), 2, "announcements"));
});

await check("another household's announcement is not visible", async () => {
  const other = (await db.query(
    `insert into households (clinic_id, name) values ('${clinicA}','Someone Else') returning id`)).rows[0].id;
  await db.exec(`insert into announcements (clinic_id, audience, household_id, title, body, created_by)
                 values ('${clinicA}','household','${other}','Private','Not for you','${aAdmin}')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from my_announcements`), 2, "still two"));
});

await check("an announcement that has not been published yet is unreachable, not merely hidden", async () => {
  // The publish window is in the policy rather than the view, so a draft is
  // not selectable however the query is shaped.
  await db.exec(`insert into announcements (clinic_id, audience, title, body, publish_at, created_by)
                 values ('${clinicA}','all_families','Draft','Not yet', now() + interval '2 days','${aAdmin}')`);
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from announcements where title='Draft'`), 0, "draft via the table");
    eq(await count(`select count(*)::int n from my_announcements`), 2, "draft via the view");
  });
});

await check("an expired announcement stops appearing on its own", async () => {
  // Published two days ago, expired an hour ago. The window constraint refuses
  // an expiry before the publish time, which is why this cannot be done by
  // back-dating expires_at on an announcement posted seconds earlier - a clinic
  // "unpublishes" by ending the window, not by moving it behind the start.
  const past = (await db.query(
    `insert into announcements (clinic_id, audience, title, body, publish_at, expires_at, created_by)
     values ('${clinicA}','all_families','Last week''s notice','Over now',
             now() - interval '2 days', now() - interval '1 hour','${aAdmin}')
     returning id`)).rows[0].id;
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from my_announcements where announcement_id='${past}'`),
       0, "an expired announcement"));
  await insertRaises(
    `update announcements set expires_at = publish_at - interval '1 hour' where id='${past}'`,
    "an expiry before the publish time");
});

await check("a household announcement cannot be written without a household", async () => {
  await insertRaises(
    `insert into announcements (clinic_id, audience, title, body, created_by)
     values ('${clinicA}','household','Oops','No household named','${aAdmin}')`,
    "household announcement with no household");
});

await check("a family cannot write or edit an announcement", async () => {
  await as(parentA, () => insertRaises(
    `insert into announcements (clinic_id, audience, title, body, created_by)
     values ('${clinicA}','all_families','From a parent','Hello','${aAdmin}')`,
    "family-written announcement"));
  await as(parentA, () => updateAffects(
    `update announcements set title='edited' where id='${annHouse}'`, 0, "family editing"));
});

await check("a clinician cannot publish an announcement; that is a settings action", async () => {
  await as(aClin, () => insertRaises(
    `insert into announcements (clinic_id, audience, title, body, created_by)
     values ('${clinicA}','all_families','From a clinician','Hello','${aClin}')`,
    "clinician-written announcement"));
});

await check("read state is per person, so one parent reading does not clear it for the other", async () => {
  await as(parentA, async () =>
    await db.exec(`insert into announcement_reads (announcement_id, user_id)
                   values ('${annHouse}', '${parentA}')`));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from my_announcements where is_unread`), 1, "parent A"));
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from my_announcements where is_unread`), 2, "parent B"));
});

await check("a parent cannot mark an announcement read on someone else's behalf", async () => {
  await as(parentA, () => insertRaises(
    `insert into announcement_reads (announcement_id, user_id) values ('${annAll}','${parentB}')`,
    "read state written for another person"));
});

await check("notification preferences are private, even from the clinic", async () => {
  await as(parentA, async () =>
    await db.exec(`insert into notification_preferences (user_id, kind, sms)
                   values ('${parentA}', 'appointment_reminder', true)`));
  await as(aAdmin, async () =>
    eq(await count(`select count(*)::int n from notification_preferences`), 0, "admin reading preferences"));
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from notification_preferences`), 0, "another parent"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from notification_preferences`), 1, "their own"));
});

await check("detail in an external preview is off until someone turns it on", async () => {
  await as(parentA, async () =>
    eq((await one(`select allow_detail_in_preview a from notification_preferences
                    where user_id='${parentA}' and kind='appointment_reminder'`)).a,
       false, "default"));
});

await check("the notification centre carries messages, announcements and tasks together", async () => {
  await as(parentA, async () => {
    const rows = (await db.query(`select source, title, href from public.my_notifications()`)).rows;
    const sources = new Set(rows.map((r) => r.source));
    if (!sources.has("announcement")) throw new Error("no announcement reached the centre");
    if (!sources.has("message")) throw new Error("no unread message reached the centre");
    if (rows.some((r) => !r.href)) throw new Error("a notification has nowhere to go");
  });
});

await check("the centre is empty for someone with no family", async () => {
  await as(outsider, async () =>
    eq(await count(`select count(*)::int n from public.my_notifications()`), 0, "outsider"));
});

await check("an internal staff note never produces a notification", async () => {
  // The centre counts unread from my_message_threads, which counts shared
  // messages only. A badge for a note the family may not read would tell them
  // something happened that they are not permitted to see.
  const before = await (async () => {
    let n = 0;
    await as(parentA, async () => {
      n = await count(`select count(*)::int n from public.my_notifications() where source='message'`);
    });
    return n;
  })();
  await db.exec(`insert into messages (clinic_id, thread_id, author_user_id, author_kind, body, visibility)
                 values ('${clinicA}','${thread}','${aClin}','staff','Another internal note.','internal')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_notifications() where source='message'`),
       before, "message notifications after an internal note"));
});

// --------------------------------------------------------------------------
// Phase 8 · the family calendar
//
// The calendar now shows every child at once, so "can see it" and "can change
// it" stop being the same question. These fix that distinction in place.
// --------------------------------------------------------------------------

await check("one query returns every child's sessions to a guardian", async () => {
  await db.exec(`insert into sessions (clinic_id, client_id, session_date, hour, status, type)
                 values ('${clinicA}', ${noah}, current_date + 4, 10, 'scheduled', 'Session')`);
  await as(parentA, async () => {
    const rows = (await db.query(`select distinct client_id from sessions`)).rows;
    eq(rows.length, 2, "children with visible sessions");
  });
});

await check("a guardian without view_appointments for a child sees none of their sessions", async () => {
  // `silent` holds a relationship to Maya only, and had view_appointments
  // revoked earlier in this file.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_appointments'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${silent}')`);
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from sessions`), 0, "sessions for a guardian without access"));
});

await check("seeing a sibling's session is not permission to move it", async () => {
  // The exact case the family calendar creates: parentB may view both
  // children, but manage only one.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'manage_appointments'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${parentB}' and client_id = ${maya})`);
  const s = (await db.query(
    `select id from sessions where client_id = ${maya} limit 1`)).rows[0].id;
  await as(parentB, async () => {
    // Still visible...
    eq(await count(`select count(*)::int n from sessions where id = ${s}`), 1, "visible");
  });
  // ...but not movable.
  await as(parentB, () => insertRaises(
    `insert into session_change_requests (clinic_id, session_id, client_id, request_type, created_by)
     values ('${clinicA}', ${s}, ${maya}, 'reschedule', '${parentB}')`,
    "change request without manage_appointments for that child"));
});

await check("a change request naming a different child than its session is refused", async () => {
  // What would happen if the route pinned client_id to whichever child the
  // portal was pointed at, rather than reading it off the session.
  const mayaSession = (await db.query(
    `select id from sessions where client_id = ${maya} limit 1`)).rows[0].id;
  await as(parentA, () => insertRaises(
    `insert into session_change_requests (clinic_id, session_id, client_id, request_type, created_by)
     values ('${clinicA}', ${mayaSession}, ${noah}, 'reschedule', '${parentA}')`,
    "change request with a mismatched child"));
});

// --------------------------------------------------------------------------
// 0054 · Forms and consents
//
// The two decisions worth testing: a published template cannot change under a
// family that already answered it, and a consent is a window rather than an
// answer - so withdrawal keeps the history instead of editing it away.
// --------------------------------------------------------------------------
await db.exec(`select set_config('request.jwt.claim.sub','${aAdmin}',false)`);
const tmpl = (await db.query(
  `insert into form_templates (clinic_id, key, version, title, kind, fields, status, published_at, created_by)
   values ('${clinicA}', 'intake', 1, 'Intake questionnaire', 'form',
           '[{"id":"allergies","label":"Any allergies?","type":"text","required":true}]'::jsonb,
           'published', now(), '${aAdmin}')
   returning id`)).rows[0].id;
const consentTmpl = (await db.query(
  `insert into form_templates (clinic_id, key, version, title, kind, consent_statement, status, published_at, created_by)
   values ('${clinicA}', 'photography', 1, 'Photography', 'consent',
           'Photographs of my child may be used in session materials.',
           'published', now(), '${aAdmin}')
   returning id`)).rows[0].id;

await check("a published template cannot be edited under the families who answered it", async () => {
  await insertRaises(
    `update form_templates set fields = '[]'::jsonb where id = '${tmpl}'`,
    "editing a published template");
  await insertRaises(
    `update form_templates set title = 'Reworded' where id = '${tmpl}'`,
    "retitling a published template");
});

await check("retiring a published template is allowed, because it changes no wording", async () => {
  const t2 = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, status, published_at, created_by)
     values ('${clinicA}','retire-me',1,'Old form','published', now(),'${aAdmin}') returning id`)).rows[0].id;
  await db.exec(`update form_templates set status='retired' where id='${t2}'`);
  eq((await one(`select status from form_templates where id='${t2}'`)).status, 'retired', "retired");
});

await check("a consent template must actually say what is being consented to", async () => {
  await insertRaises(
    `insert into form_templates (clinic_id, key, version, title, kind, status, created_by)
     values ('${clinicA}','empty-consent',1,'Consent','consent','draft','${aAdmin}')`,
    "consent template with no statement");
});

const assign = (await db.query(
  `insert into form_assignments (clinic_id, template_id, client_id, assigned_by, is_required)
   values ('${clinicA}', '${tmpl}', ${maya}, '${aAdmin}', true) returning id`)).rows[0].id;

await check("a family sees the form assigned to their child, and the wording it was assigned against", async () => {
  await as(parentA, async () => {
    const row = await one(`select title, version, fields from my_forms where assignment_id='${assign}'`);
    eq(row.title, "Intake questionnaire", "title");
    eq(row.version, 1, "version");
  });
});

await check("an unassigned template is not browsable by a family", async () => {
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from form_templates where key='retire-me'`), 0,
       "unassigned template"));
});

await check("a draft template is unreachable even once assigned", async () => {
  const draft = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, status, created_by)
     values ('${clinicA}','draft-form',1,'Not ready','draft','${aAdmin}') returning id`)).rows[0].id;
  await db.exec(`insert into form_assignments (clinic_id, template_id, client_id, assigned_by)
                 values ('${clinicA}','${draft}',${maya},'${aAdmin}')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from form_templates where key='draft-form'`), 0, "draft"));
});

await check("completing a form needs complete_forms, not merely view_forms", async () => {
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'complete_forms'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${parentB}' and client_id=${maya})`);
  await as(parentB, () => insertRaises(
    `insert into form_submissions (clinic_id, assignment_id, template_id, client_id, answers, submitted_by, signed_name)
     values ('${clinicA}','${assign}','${tmpl}',${maya},'{"allergies":"none"}'::jsonb,'${parentB}','Ian')`,
    "submission without complete_forms"));
  // Reading it is still fine.
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from my_forms where assignment_id='${assign}'`), 1, "read"));
});

await check("submitting closes the assignment without any page having to", async () => {
  await as(parentA, async () =>
    await db.exec(`insert into form_submissions
                     (clinic_id, assignment_id, template_id, client_id, answers, submitted_by, signed_name)
                   values ('${clinicA}','${assign}','${tmpl}',${maya},
                           '{"allergies":"none"}'::jsonb,'${parentA}','Adina')`));
  eq((await one(`select completed_at is not null c from form_assignments where id='${assign}'`)).c,
     true, "assignment closed");
});

await check("the same assignment cannot be answered twice", async () => {
  await as(parentA, () => insertRaises(
    `insert into form_submissions (clinic_id, assignment_id, template_id, client_id, answers, submitted_by)
     values ('${clinicA}','${assign}','${tmpl}',${maya},'{"allergies":"changed"}'::jsonb,'${parentA}')`,
    "second submission"));
});

await check("a submitted answer cannot be edited after the clinic has it", async () => {
  await as(parentA, () => updateAffects(
    `update form_submissions set answers = '{"allergies":"rewritten"}'::jsonb
      where assignment_id='${assign}'`, 0, "family editing a submission"));
});

await check("a family cannot answer another family's form", async () => {
  await as(outsider, () => insertRaises(
    `insert into form_submissions (clinic_id, assignment_id, template_id, client_id, answers, submitted_by)
     values ('${clinicA}','${assign}','${tmpl}',${maya},'{}'::jsonb,'${outsider}')`,
    "submission by an unrelated user"));
});

// --- consents -------------------------------------------------------------
const consent = (await db.query(
  `insert into consent_records (clinic_id, client_id, template_id, granted_by, signed_name)
   values ('${clinicA}', ${maya}, '${consentTmpl}', '${parentA}', 'Adina') returning id`)).rows[0].id;

await check("a child cannot hold two live consents for the same thing", async () => {
  await insertRaises(
    `insert into consent_records (clinic_id, client_id, template_id, granted_by)
     values ('${clinicA}', ${maya}, '${consentTmpl}', '${parentA}')`,
    "a second live consent");
});

await check("withdrawing keeps the window rather than editing it away", async () => {
  await as(parentA, async () =>
    await db.exec(`update consent_records
                      set withdrawn_at = now(), withdrawn_by = '${parentA}',
                          withdrawal_reason = 'Changed our minds'
                    where id = '${consent}'`));
  const row = await one(`select granted_at, withdrawn_at, is_active from my_consents
                          where consent_id='${consent}'`);
  if (!row.granted_at) throw new Error("the grant date was lost");
  if (!row.withdrawn_at) throw new Error("the withdrawal was not recorded");
  eq(row.is_active, false, "active");
});

await check("a withdrawn consent cannot be quietly reinstated", async () => {
  await insertRaises(
    `update consent_records set withdrawn_at = null, withdrawn_by = null where id='${consent}'`,
    "reinstating a withdrawn consent");
});

await check("the grant on a consent is immutable", async () => {
  await insertRaises(
    `update consent_records set granted_by = '${parentB}' where id='${consent}'`,
    "rewriting who consented");
});

await check("re-consenting after withdrawal is a new row, so both windows survive", async () => {
  await as(parentA, async () =>
    await db.exec(`insert into consent_records (clinic_id, client_id, template_id, granted_by, signed_name)
                   values ('${clinicA}', ${maya}, '${consentTmpl}', '${parentA}', 'Adina')`));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from my_consents where client_id=${maya}`), 2, "both windows"));
});

await check("an unrelated family reaches no form, submission or consent", async () => {
  await as(outsider, async () => {
    for (const t of ["form_assignments", "form_submissions", "consent_records", "my_forms", "my_consents"]) {
      eq(await count(`select count(*)::int n from public.${t}`), 0, t);
    }
  });
});

// --------------------------------------------------------------------------
// 0055 · forms become tasks
// --------------------------------------------------------------------------

await check("an unanswered required form reaches the family as a task", async () => {
  const t = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, status, published_at, created_by)
     values ('${clinicA}','consent-check',1,'Media consent','published', now(), '${aAdmin}')
     returning id`)).rows[0].id;
  const a = (await db.query(
    `insert into form_assignments (clinic_id, template_id, client_id, assigned_by, due_on, is_required)
     values ('${clinicA}','${t}',${noah},'${aAdmin}', current_date + 1, true) returning id`)).rows[0].id;

  await as(parentA, async () => {
    const row = await one(`select title, href, priority from public.my_family_tasks()
                            where task_id = 'form:${a}'`);
    eq(row.title, "Form to complete", "title");
    eq(row.href, `/forms?form=${a}`, "href");
    // Due tomorrow, so it leads.
    eq(row.priority, "high", "priority");
  });
});

await check("an optional form is not chased, so it is not a task", async () => {
  const t = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, status, published_at, created_by)
     values ('${clinicA}','optional-survey',1,'Survey','published', now(), '${aAdmin}') returning id`)).rows[0].id;
  const a = (await db.query(
    `insert into form_assignments (clinic_id, template_id, client_id, assigned_by, is_required)
     values ('${clinicA}','${t}',${noah},'${aAdmin}', false) returning id`)).rows[0].id;
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where task_id='form:${a}'`),
       0, "optional form as a task"));
});

await check("completing a form removes its task, with nothing to clear", async () => {
  const t = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, status, published_at, created_by)
     values ('${clinicA}','vanishing',1,'Vanishing form','published', now(),'${aAdmin}') returning id`)).rows[0].id;
  const a = (await db.query(
    `insert into form_assignments (clinic_id, template_id, client_id, assigned_by)
     values ('${clinicA}','${t}',${noah},'${aAdmin}') returning id`)).rows[0].id;
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where task_id='form:${a}'`),
       1, "before"));
  await as(parentA, async () =>
    await db.exec(`insert into form_submissions
                     (clinic_id, assignment_id, template_id, client_id, answers, submitted_by)
                   values ('${clinicA}','${a}','${t}',${noah},'{}'::jsonb,'${parentA}')`));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where task_id='form:${a}'`),
       0, "after"));
});

await check("a form task needs view_forms, and a guardian without it never sees one", async () => {
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_forms'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${silent}')`);
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from public.my_family_tasks() where kind='form'`),
       0, "form tasks without view_forms"));
});

await check("a form task reaches the notification centre too", async () => {
  await as(parentA, async () => {
    const n = await count(
      `select count(*)::int n from public.my_notifications() where source='task' and title like '%Form%'`);
    if (n === 0) throw new Error("no form task reached my_notifications()");
  });
});

await check("every branch of family_tasks still produces its own kind", async () => {
  // Not a count. The first draft of 0055 retyped the funding branch and
  // changed `status = 'ACTIVE'` to lowercase; every funding task silently
  // vanished, and the two tests that only asked whether *a* task existed
  // still passed. Naming the kinds is what makes a lost branch visible.
  //
  // Read as a guardian rather than as the superuser: family_tasks is scoped by
  // auth_accessible_client_ids(), so an unauthenticated read is empty by
  // design and would assert nothing.
  await as(parentA, async () => {
    const kinds = (await db.query(
      `select distinct kind from public.my_family_tasks() order by 1`)).rows.map((r) => r.kind);
    for (const k of ["form", "funding"]) {
      if (!kinds.includes(k)) {
        throw new Error(`no ${k} task reached a guardian (kinds: ${kinds.join(", ") || "none"})`);
      }
    }
  });
});


// --------------------------------------------------------------------------
// 0056 · the care team
// --------------------------------------------------------------------------
await check("a family still cannot read the staff table itself", async () => {
  // The whole reason my_care_team() is a function: a policy here would return
  // capacity, specialties and location alongside the name.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from staff`), 0, "staff rows"));
});

await check("the care team names the people who actually deliver the sessions", async () => {
  const st = (await db.query(
    `insert into staff (name, role, capacity, clinic_id)
     values ('Dana Okafor', 'Behaviour Therapist', 12, '${clinicA}') returning id`)).rows[0].id;
  await db.exec(`insert into sessions (clinic_id, client_id, employee_id, session_date, hour, status, type)
                 values ('${clinicA}', ${maya}, ${st}, current_date - 7, 10, 'completed', 'Session'),
                        ('${clinicA}', ${maya}, ${st}, current_date + 5, 10, 'scheduled', 'Session')`);
  await as(parentA, async () => {
    const row = await one(`select staff_name, staff_role, sessions_delivered, last_seen_on, next_on
                             from public.my_care_team() where staff_id = ${st}`);
    eq(row.staff_name, "Dana Okafor", "name");
    eq(row.staff_role, "Behaviour Therapist", "role");
    eq(row.sessions_delivered, 1, "delivered");
    if (!row.last_seen_on) throw new Error("no last seen date");
    if (!row.next_on) throw new Error("no next date");
  });
});

await check("the care team returns a name and a title, and nothing operational", async () => {
  const cols = (await db.query(
    `select p.proname, pg_get_function_result(p.oid) r from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='my_care_team'`)).rows[0].r;
  for (const leaked of ["capacity", "specialt", "location_id"]) {
    if (cols.includes(leaked)) throw new Error(`my_care_team exposes ${leaked}`);
  }
});

await check("a guardian without view_appointments learns no clinician's name", async () => {
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from public.my_care_team()`), 0, "care team"));
});

await check("an unrelated family sees no care team", async () => {
  await as(outsider, async () =>
    eq(await count(`select count(*)::int n from public.my_care_team()`), 0, "care team"));
});

await check("a cancelled session does not put someone on the care team", async () => {
  const st = (await db.query(
    `insert into staff (name, clinic_id) values ('Only Cancelled', '${clinicA}') returning id`)).rows[0].id;
  await db.exec(`insert into sessions (clinic_id, client_id, employee_id, session_date, hour, status, type)
                 values ('${clinicA}', ${maya}, ${st}, current_date - 2, 9, 'cancelled', 'Session')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from public.my_care_team() where staff_id = ${st}`),
       0, "cancelled-only staff"));
});

// --------------------------------------------------------------------------
// Phase 12 · the sweep nobody has to remember
//
// Everything above tests a table someone chose to test. These walk every table
// in the schema and ask the two questions that have to be true of all of them,
// so a table added later is covered without anyone adding a test for it.
// --------------------------------------------------------------------------

/** Tables with a clinic_id, which is every multi-tenant one. */
const tenantTables = (await db.query(`
  select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'clinic_id' and a.attnum > 0
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`)).rows.map((r) => r.name);

await check(`every clinic-scoped table has row security switched on (${tenantTables.length} tables)`, async () => {
  const off = (await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname='clinic_id' and a.attnum > 0)`)).rows;
  if (off.length) throw new Error(`RLS off: ${off.map((r) => r.relname).join(", ")}`);
});

await check("no table has policies that are not doing anything", async () => {
  // 0032 fixed 39 of these. This is what stops the 40th.
  const inert = (await db.query(`
    select c.relname, count(p.polname)::int n
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity
     group by c.relname having count(p.polname) > 0`)).rows;
  if (inert.length) {
    throw new Error(`policies with RLS off: ${inert.map((r) => `${r.relname}(${r.n})`).join(", ")}`);
  }
});

await check("no clinic-scoped table hands a row to a second clinic's admin", async () => {
  const leaks = [];
  for (const t of tenantTables) {
    await as(bAdmin, async () => {
      let n = 0;
      try { n = await count(`select count(*)::int n from public.${t} where clinic_id = '${clinicA}'`); }
      catch { return; }   // a table B's admin cannot read at all is fine
      if (n > 0) leaks.push(`${t}(${n})`);
    });
  }
  if (leaks.length) throw new Error(`clinic A rows visible to clinic B: ${leaks.join(", ")}`);
});

await check("no table hands a row to a signed-in family with no relationship to anyone", async () => {
  // The catalogue tables are the deliberate exceptions and are named, not
  // pattern-matched, so adding a table cannot silently join the allow-list.
  // Named, not pattern-matched, so adding a table cannot silently join the
  // allow-list. Each one is a vocabulary with no subject: it describes what
  // kinds of thing exist, never a person or a clinic's operations. `clinics`
  // is here because the policy is `id = auth_clinic_id()` - a family reading
  // their own clinic's name and address, which is on their letters already.
  const CATALOGUES = new Set([
    "permission_actions",          // the action vocabulary; per-caller grants live elsewhere
    "guardian_permission_kinds",   // the permission vocabulary the portal renders
    "role_permissions",            // which role holds which action - not per person
    "pay_codes", "activity_types", // clinic-wide reference data with no subject
    "clinics",                     // their own clinic only
  ]);
  const tables = (await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' order by 1`)).rows.map((r) => r.relname);
  const leaks = [];
  for (const t of tables) {
    if (CATALOGUES.has(t)) continue;
    await as(outsider, async () => {
      // `profiles` is not excluded, because excluding it is what let it leak
      // in the first place: a family must reach exactly their own row, and a
      // sweep that skipped the table would not have noticed it returning
      // twelve. Asserted by shape rather than by absence.
      if (t === "profiles") {
        const rows = (await db.query(`select id from profiles`)).rows;
        if (rows.length > 1 || (rows[0] && rows[0].id !== outsider)) {
          leaks.push(`profiles(${rows.length}, not just their own)`);
        }
        return;
      }
      let n = 0;
      try { n = await count(`select count(*)::int n from public.${t}`); } catch { return; }
      if (n > 0) leaks.push(`${t}(${n})`);
    });
  }
  if (leaks.length) throw new Error(`visible to an unrelated family: ${leaks.join(", ")}`);
});

await check("no security definer function has a mutable search_path", async () => {
  // A definer function without a pinned search_path can be made to call
  // someone else's function by putting a schema in front of public - the
  // hardening 0009 did by hand, asserted here for every function since.
  const loose = (await db.query(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
          where cfg like 'search_path=%')`)).rows;
  if (loose.length) {
    throw new Error(`security definer without search_path: ${loose.map((r) => r.proname).join(", ")}`);
  }
});

await check("every security definer function names pg_temp last", async () => {
  // pg_temp ahead of public lets a caller shadow a function the definer body
  // resolves unqualified. 0009 fixed this; nothing was stopping the next one.
  const bad = (await db.query(`
    select p.proname, cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
           unnest(coalesce(p.proconfig, '{}')) cfg
     where n.nspname='public' and p.prosecdef and cfg like 'search_path=%'
       and cfg not like '%pg_temp'`)).rows;
  if (bad.length) {
    throw new Error(`pg_temp not last: ${bad.map((r) => `${r.proname} [${r.cfg}]`).join(", ")}`);
  }
});

await check("a family session cannot write to any table it should only read", async () => {
  // Reads are covered above. This checks the other direction on the tables a
  // family is closest to: an insert with no permission behind it must fail,
  // not silently land.
  const readOnlyForFamilies = [
    ["programs",      `insert into programs (clinic_id, client_id, name, status) values ('${clinicA}', ${maya}, 'Self-assigned goal', 'active')`],
    ["session_notes", `insert into session_notes (clinic_id, client_id, status) values ('${clinicA}', ${maya}, 'signed')`],
    ["client_budgets",`insert into client_budgets (clinic_id, client_id, name, allocated_amount) values ('${clinicA}', ${maya}, 'Extra funding', 99999)`],
    ["announcements", `insert into announcements (clinic_id, audience, title, body, created_by) values ('${clinicA}','all_families','From a parent','x','${aAdmin}')`],
    ["form_templates",`insert into form_templates (clinic_id, key, version, title, created_by) values ('${clinicA}','mine',1,'My form','${aAdmin}')`],
  ];
  for (const [table, sql] of readOnlyForFamilies) {
    await as(parentA, () => insertRaises(sql, `family write to ${table}`));
  }
});

await check("a family cannot escalate their own permissions", async () => {
  await as(parentA, () => updateAffects(
    `update relationship_permissions set granted = true`, 0, "granting themselves everything"));
  await as(parentA, () => insertRaises(
    `insert into guardian_relationships (clinic_id, user_id, client_id, status)
     values ('${clinicA}','${parentA}', ${maya}, 'ACTIVE')`,
    "adding a relationship"));
  // Raises rather than matching nothing: 0032's profiles_guard_privileges
  // trigger rejects a self-role-change outright, which is stronger than an
  // RLS filter and needs a different assertion.
  await as(parentA, () => insertRaises(
    `update profiles set role = 'admin' where id = '${parentA}'`, "self-promotion"));
});

// --------------------------------------------------------------------------
// 0061-0064 · the goal bank
// --------------------------------------------------------------------------

await check("a family cannot read the goal bank", async () => {
  // It is the clinic's clinical knowledge, not a client record. A parent
  // browsing every goal the organization teaches is not something the portal
  // should offer, and goal_bank_read is staff-only.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from goal_bank_entries`), 0, "entries"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from goal_bank_steps`), 0, "steps"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from goal_bank_catalogue`), 0, "catalogue"));
});

await check("a second clinic's staff cannot read this clinic's bank", async () => {
  const e = (await db.query(
    `insert into goal_bank_entries (clinic_id, name, domain, operational_definition,
                                    default_measurement_mode)
     values ('${clinicA}','A private goal','Play','The child does the thing 3 times.','dtt')
     returning id`)).rows[0].id;
  await db.exec(`insert into goal_bank_steps (entry_id, step_number, description, prompt_level)
                 values ('${e}', 1, 'Full physical prompt.', 'physical')`);
  await as(bAdmin, async () => {
    eq(await count(`select count(*)::int n from goal_bank_entries where id='${e}'`), 0, "entry");
    eq(await count(`select count(*)::int n from goal_bank_steps where entry_id='${e}'`), 0, "steps");
  });
  await as(aClin, async () =>
    eq(await count(`select count(*)::int n from goal_bank_entries where id='${e}'`), 1, "own clinic"));
});

await check("a goal written for a client is contributed back to the bank as a draft", async () => {
  const before = await count(`select count(*)::int n from goal_bank_entries`);
  const p = (await db.query(
    `insert into programs (clinic_id, client_id, name, domain, measurement_mode,
                           operational_definition, created_by)
     values ('${clinicA}', ${maya}, 'Requests a turn',
             'Social Skills', 'dtt',
             'When a peer has a preferred item, the child asks for a turn using a full sentence.', '${aClin}')
     returning id, goal_bank_id`)).rows[0];
  eq(await count(`select count(*)::int n from goal_bank_entries`), before + 1, "bank grew");
  if (!p.goal_bank_id) throw new Error("the program was not linked to what it contributed");
  const e = await one(`select status, needs_clinical_review, review_reason, domain, clinic_id
                         from goal_bank_entries where id='${p.goal_bank_id}'`);
  eq(e.status, "draft", "status");
  eq(e.needs_clinical_review, true, "flagged");
  eq(e.domain, "Social Skills", "domain carried over");
  if (!String(e.review_reason).includes("contributed")) throw new Error("no reason recorded");
});

await check("a program taken FROM the bank does not contribute a copy of itself", async () => {
  const src = (await db.query(
    `insert into goal_bank_entries (clinic_id, name, domain, operational_definition,
                                    default_measurement_mode)
     values ('${clinicA}','From the bank','Play','The child takes a turn within 5 seconds, 8 of 10 times.','dtt')
     returning id`)).rows[0].id;
  const before = await count(`select count(*)::int n from goal_bank_entries`);
  await db.exec(`insert into programs (clinic_id, client_id, name, domain, measurement_mode,
                                       operational_definition, goal_bank_id, created_by)
                 values ('${clinicA}', ${maya}, 'From the bank','Play','dtt',
                         'The child takes a turn within 5 seconds, 8 of 10 times.','${src}', '${aClin}')`);
  eq(await count(`select count(*)::int n from goal_bank_entries`), before, "bank unchanged");
});

await check("a goal too thin to reuse is not contributed", async () => {
  const before = await count(`select count(*)::int n from goal_bank_entries`);
  await db.exec(`insert into programs (clinic_id, client_id, name, domain, measurement_mode,
                                       operational_definition, created_by)
                 values ('${clinicA}', ${maya}, 'x', 'Play', 'dtt', 'do it', '${aClin}')`);
  eq(await count(`select count(*)::int n from goal_bank_entries`), before, "bank unchanged");
});

await check("contributed and drafted goals land in the review queue", async () => {
  await as(aClin, async () => {
    const n = await count(`select count(*)::int n from goal_bank_review_queue`);
    if (n === 0) throw new Error("the review queue is empty");
    const row = await one(`select programs_using from goal_bank_review_queue
                            where name = 'Requests a turn'`);
    // The program that contributed it counts as a user, which is the signal
    // that a contributed goal is worth approving for everyone.
    eq(row.programs_using, 1, "programs using");
  });
});

await check("every goal bank domain has exactly one spelling", async () => {
  // 0002's seeded rows said "Expressive communication" and the 2026 import
  // says "Expressive Communication". The Generator filters by domain, so two
  // spellings means a clinician picking one silently does not see the other's
  // goals - and a filter that returns results looks like it worked.
  const dupes = (await db.query(`
    select lower(domain) d, count(distinct domain)::int n
      from goal_bank_entries group by 1 having count(distinct domain) > 1`)).rows;
  if (dupes.length) {
    throw new Error(`domains spelled more than one way: ${dupes.map((r) => r.d).join(", ")}`);
  }
});

// --------------------------------------------------------------------------
// 0065 · supervision
// --------------------------------------------------------------------------
const supervisee = aClin;

await check("a clinician-supervision note cannot carry a client id", async () => {
  await insertRaises(
    `insert into supervision_notes (clinic_id, kind, supervisee_id, client_id, supervisor_id, observations)
     values ('${clinicA}','clinician','${supervisee}',${maya},'${aSuper}','Observed session')`,
    "clinician note naming a client");
  await insertRaises(
    `insert into supervision_notes (clinic_id, kind, supervisee_id, supervisor_id, observations)
     values ('${clinicA}','client','${supervisee}','${aSuper}','Observed session')`,
    "client note naming no client");
});

const note = (await db.query(
  `insert into supervision_notes (clinic_id, kind, supervisee_id, supervisor_id,
                                  observations, action_items, next_steps, setting)
   values ('${clinicA}','clinician','${supervisee}','${aSuper}',
           'Strong pairing; prompt fading was late on three trials.',
           'Review prompt hierarchy before Thursday.',
           'Re-observe in two weeks.', 'In-person, clinic')
   returning id`)).rows[0].id;

await check("a supervisee reads what was written about them without asking", async () => {
  await as(supervisee, async () =>
    eq(await count(`select count(*)::int n from supervision_notes where id='${note}'`), 1, "own note"));
});

await check("another clinician cannot read someone else's supervision", async () => {
  await as(aOtherClin, async () =>
    eq(await count(`select count(*)::int n from supervision_notes where id='${note}'`), 0, "someone else's"));
});

await check("a supervisee acknowledges, and that is not agreement", async () => {
  await as(supervisee, async () =>
    await db.exec(`update supervision_notes set acknowledged_at = now() where id='${note}'`));
  const r = await one(`select acknowledged_at, signed_at from supervision_notes where id='${note}'`);
  if (!r.acknowledged_at) throw new Error("acknowledgement not recorded");
  // Reading it does not sign it. Only the supervisor does that.
  if (r.signed_at) throw new Error("acknowledging set the signature");
});

await check("a supervisee cannot edit the note they are acknowledging", async () => {
  // The UPDATE policy that lets them acknowledge necessarily admits the row,
  // and RLS cannot restrict which columns an admitted row exposes - so this is
  // enforced by the trigger, which raises rather than quietly ignoring the
  // change. The first version of this test asserted the update matched a row
  // and then read the content back, which is how the hole was found.
  await as(supervisee, () => insertRaises(
    `update supervision_notes set observations='Actually it went perfectly' where id='${note}'`,
    "a supervisee rewriting their own review"));
  const r = await one(`select observations from supervision_notes where id='${note}'`);
  if (r.observations.includes("perfectly")) throw new Error("the review was rewritten");
  // Acknowledging still works.
  await as(supervisee, async () =>
    await db.exec(`update supervision_notes set acknowledged_at = now() where id='${note}'`));
});

await check("a signed note stops changing", async () => {
  await as(aSuper, async () =>
    await db.exec(`update supervision_notes set signed_at = now(), signed_name = 'A Supervisor'
                    where id='${note}'`));
  await insertRaises(
    `update supervision_notes set observations = 'rewritten' where id='${note}'`,
    "editing a signed note");
});

await check("a supervisor cannot file a note under someone else's name", async () => {
  await as(aSuper, () => insertRaises(
    `insert into supervision_notes (clinic_id, kind, supervisee_id, supervisor_id, observations)
     values ('${clinicA}','clinician','${supervisee}','${aAdmin}','Not mine to write')`,
    "note filed under another supervisor"));
});

await check("client supervision needs the clinical action, not the HR one", async () => {
  // 0024 refuses one action that exposes both PHI and HR confidences, so
  // these are two actions and the policies pick by the note's kind.
  const both = (await db.query(`
    select count(*)::int n from permission_actions
     where action in ('hr.supervision.manage','clinical.supervision.manage')`)).rows[0].n;
  eq(both, 2, "both actions exist");
  const dual = (await db.query(`
    select count(*)::int n from permission_actions
     where exposes_phi and exposes_hr_confidential`)).rows[0].n;
  eq(dual, 0, "no action exposes both");
});

await check("a material is confirmed by the supervisee and nobody else", async () => {
  const m = (await db.query(
    `insert into supervision_materials (clinic_id, note_id, title, kind)
     values ('${clinicA}','${note}','Prompt hierarchy refresher','training_module')
     returning id`)).rows[0].id;
  await as(aOtherClin, () => updateAffects(
    `update supervision_materials set confirmed_at = now() where id='${m}'`,
    0, "an unrelated clinician confirming"));
  await as(supervisee, async () =>
    await db.exec(`update supervision_materials set confirmed_at = now() where id='${m}'`));
  const r = await one(`select confirmed_at from supervision_materials where id='${m}'`);
  if (!r.confirmed_at) throw new Error("the supervisee could not confirm their own material");
});

await check("a family cannot read supervision of any kind", async () => {
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from supervision_notes`), 0, "notes");
    eq(await count(`select count(*)::int n from supervision_materials`), 0, "materials");
    eq(await count(`select count(*)::int n from my_supervision`), 0, "view");
  });
});

// --------------------------------------------------------------------------
// 0066-0067 · the lesson plan bank
// --------------------------------------------------------------------------
const lessonProgram = (await db.query(
  `insert into lesson_programs (id, clinic_id, name, status)
   values ('lp-test','${clinicA}','Test Cooking Group','Approved') returning id`)).rows[0].id;
await db.exec(`insert into lesson_resources (id, clinic_id, program_id, name, kind, contains_client_info)
               values ('lr-blank','${clinicA}','${lessonProgram}','Blank datasheet','datasheet', false),
                      ('lr-filled','${clinicA}','${lessonProgram}','Completed datasheet','datasheet', true)`);

await check("a blank template is staff material; one naming a client is not", async () => {
  // aSched2 holds no clinical.client.read.
  const scheduler = await mkUser("a_sched3", "scheduler", clinicA);
  await as(scheduler, async () => {
    eq(await count(`select count(*)::int n from lesson_resources where id='lr-blank'`), 1, "blank");
    eq(await count(`select count(*)::int n from lesson_resources where id='lr-filled'`), 0, "with client info");
  });
  await as(aClin, async () =>
    eq(await count(`select count(*)::int n from lesson_resources where id='lr-filled'`), 1, "clinician"));
});

await check("a family cannot read the lesson plan bank", async () => {
  await as(parentA, async () => {
    eq(await count(`select count(*)::int n from lesson_programs`), 0, "programs");
    eq(await count(`select count(*)::int n from lesson_resources`), 0, "resources");
    eq(await count(`select count(*)::int n from lesson_plan_catalogue`), 0, "catalogue");
  });
});

await check("a second clinic cannot read this clinic's lesson bank", async () => {
  await as(bAdmin, async () =>
    eq(await count(`select count(*)::int n from lesson_programs where id='${lessonProgram}'`), 0, "cross-tenant"));
});

await check("the catalogue counts every resource, including ones the reader cannot open", async () => {
  // Hiding the count would misrepresent the programme rather than protect
  // anything: the resource's existence is not the sensitive part.
  await as(aClin, async () => {
    const r = await one(`select resource_count from lesson_plan_catalogue where id='${lessonProgram}'`);
    eq(r.resource_count, 2, "resource count");
  });
});

// --------------------------------------------------------------------------
// 0046 · clinician access to apps/scheduler - read parity clinic-wide,
// write power scoped to the clinician's own linked staff row only.
//
// aClin/aOtherClin and their employment_records rows (empClin/empOther)
// already exist from the fixture above; this links each to a distinct
// `staff` row (staff1/staff2) the way an admin would via the employee
// portal's Settings -> Workforce screen, and adds a third clinician who is
// deliberately left unlinked to prove read parity does not depend on the
// link but booking power does.
// --------------------------------------------------------------------------
const staff1 = (await db.query(
  `insert into staff (name, role, clinic_id) values ('Staff One','RBT','${clinicA}') returning id`)).rows[0].id;
const staff2 = (await db.query(
  `insert into staff (name, role, clinic_id) values ('Staff Two','RBT','${clinicA}') returning id`)).rows[0].id;
await db.exec(`update employment_records set staff_id = ${staff1} where id = '${empClin}'`);
await db.exec(`update employment_records set staff_id = ${staff2} where id = '${empOther}'`);

const aSched = await mkUser("a_sched", "scheduler", clinicA);
const aUnlinked = await mkUser("a_unlinked", "clinician", clinicA);

const locA = (await db.query(`insert into locations (name, clinic_id) values ('Loc A','${clinicA}') returning id`)).rows[0].id;
await db.exec(`insert into locations (name, clinic_id) values ('Loc B','${clinicB}')`);
const typeA = (await db.query(`insert into session_types (name, clinic_id) values ('Direct Therapy','${clinicA}') returning id`)).rows[0].id;
const calA = (await db.query(`insert into calendars (name, date_start, date_end, status, clinic_id) values ('Cal A','2026-01-01','2026-12-31','active','${clinicA}') returning id`)).rows[0].id;
await db.exec(`insert into client_availability (client_id, clinic_id, day, start_time, end_time) values (${clientA}, '${clinicA}', 'Mon', '09:00', '17:00')`);
await db.exec(`insert into staff_availability (staff_id, clinic_id, day, start_time, end_time) values (${staff1}, '${clinicA}', 'Mon', '09:00', '17:00')`);

// sess1: aClin's own session (staff1). sess2: aOtherClin's (staff2) -
// untouched by aClin in every negative test below. sess3: a second session
// of aClin's, kept separate so the reassignment test doesn't interact with
// sess1's own reschedule/cancel lifecycle.
const sess1 = (await db.query(`insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
  values (${clientA}, ${staff1}, '${clinicA}', '2026-04-01', 9, 0, 'Direct Therapy', 'scheduled') returning id`)).rows[0].id;
const sess2 = (await db.query(`insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
  values (${clientA}, ${staff2}, '${clinicA}', '2026-04-01', 9, 0, 'Direct Therapy', 'scheduled') returning id`)).rows[0].id;
const sess3 = (await db.query(`insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
  values (${clientA}, ${staff1}, '${clinicA}', '2026-04-05', 9, 0, 'Direct Therapy', 'scheduled') returning id`)).rows[0].id;

await check("clinician gains clinic-wide read on the five tables 0046 adds (session_types/locations/calendars/availability)", async () => {
  await as(aClin, async () => {
    eq(await visible("session_types", `id = ${typeA}`), 1, "session_types");
    eq(await visible("locations", `id = ${locA}`), 1, "locations");
    eq(await visible("calendars", `id = ${calA}`), 1, "calendars");
    eq(await visible("client_availability"), 1, "client_availability");
    eq(await visible("staff_availability"), 1, "staff_availability");
  });
});

await check("clinician's new read access stays clinic-scoped, same as every other table here", async () => {
  await as(aClin, async () => eq(await visible("locations", `clinic_id = '${clinicB}'`), 0, "clinic B's locations"));
});

await check("a clinician linked via employment_records can book, reschedule and cancel their OWN session", async () => {
  await as(aClin, async () => {
    const r = await db.query(`insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
      values (${clientA}, ${staff1}, '${clinicA}', '2026-04-02', 10, 0, 'Direct Therapy', 'scheduled') returning id`);
    if (!r.rows[0]?.id) throw new Error("booking a session for themselves was not allowed");
    await updateAffects(`update sessions set hour = 11 where id = ${sess1}`, 1, "own reschedule");
    await updateAffects(`update sessions set status = 'cancelled' where id = ${sess1}`, 1, "own cancel");
  });
});

await check("a clinician cannot create a session for a colleague", async () => {
  await as(aClin, () => insertRaises(
    `insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
     values (${clientA}, ${staff2}, '${clinicA}', '2026-04-03', 9, 0, 'Direct Therapy', 'scheduled')`,
    "booking a session for a colleague"));
});

await check("a clinician cannot reschedule or cancel a colleague's session - it visibly exists, but no write reaches it", async () => {
  await as(aClin, async () => {
    eq(await visible("sessions", `id = ${sess2}`), 1, "colleague's session is still readable (full visibility rule)");
    await updateAffects(`update sessions set hour = 15 where id = ${sess2}`, 0, "reschedule a colleague's session");
    await updateAffects(`update sessions set status = 'cancelled' where id = ${sess2}`, 0, "cancel a colleague's session");
  });
});

await check("a clinician cannot reassign their own session to a colleague", async () => {
  await as(aClin, async () => {
    let raised = false;
    try { await db.exec(`update sessions set employee_id = ${staff2} where id = ${sess3}`); }
    catch { raised = true; }
    if (!raised) throw new Error("the reassignment away from the caller's own staff row was allowed");
  });
  // Untouched: still assigned to staff1, exactly as the rejected write left it.
  eq((await db.query(`select employee_id from sessions where id = ${sess3}`)).rows[0].employee_id, staff1,
    "session's employee_id after the rejected reassignment");
});

await check("an unlinked clinician (no employment_records.staff_id) keeps full read parity but has zero booking power", async () => {
  await as(aUnlinked, async () => {
    eq(await visible("session_types", `id = ${typeA}`), 1, "still reads session_types clinic-wide");
    eq(await visible("sessions", `id = ${sess1}`), 1, "still reads every session clinic-wide, same as a linked clinician");
  });
  await as(aUnlinked, () => insertRaises(
    `insert into sessions (client_id, employee_id, clinic_id, session_date, hour, minute, type, status)
     values (${clientA}, ${staff1}, '${clinicA}', '2026-04-04', 9, 0, 'Direct Therapy', 'scheduled')`,
    "unlinked clinician booking against a real, existing staff_id"));
  await as(aUnlinked, () => updateAffects(
    `update sessions set hour = 16 where id = ${sess1}`, 0, "unlinked clinician rescheduling someone else's session"));
});

await check("admin and scheduler keep full, unscoped session writes - 0046 only adds, never narrows, their access", async () => {
  await as(aAdmin, () => updateAffects(`update sessions set status = 'cancelled' where id = ${sess2}`, 1, "admin cancels any session"));
  await as(aSched, () => updateAffects(`update sessions set hour = 13 where id = ${sess3}`, 1, "scheduler reschedules any session"));

});

// --------------------------------------------------------------------------
// 0068 · the family access audit
//
// The sweeps above prove the policies hold. These prove that what happened
// while they held is recorded, and that the people the record is about cannot
// edit or suppress it.
// --------------------------------------------------------------------------
const auditKid = (await db.query(
  `insert into clients (name, status, clinic_id) values ('Audit Child','active','${clinicA}') returning id`)).rows[0].id;
await db.exec(`insert into household_members (clinic_id, household_id, full_name, relationship, client_id)
               values ('${clinicA}','${household}','Audit Child','self',${auditKid})`);

const auditCount = async (action) => count(
  `select count(*)::int n from clinical_audit_events
    where client_id = ${auditKid} and action = '${action}'`);

await check("linking a guardian to a child is recorded", async () => {
  await db.exec(`insert into guardian_relationships (clinic_id, user_id, client_id, household_id, status)
                 values ('${clinicA}','${parentB}',${auditKid},'${household}','ACTIVE')`);
  eq(await auditCount("family.guardian.linked"), 1, "link events");
});

await check("the default permission seed is marked, so real decisions stay legible", async () => {
  // 0047 seeds a full permission set on every new relationship. Sixteen rows
  // land a millisecond after the link; without the marker a clinic's own later
  // grant is one line among seventeen identical-looking ones.
  const seeded = await count(
    `select count(*)::int n from family_access_audit
      where client_id = ${auditKid} and from_default_seed`);
  if (seeded === 0) throw new Error("the seeded permissions were not marked");
  const real = await count(
    `select count(*)::int n from family_access_audit
      where client_id = ${auditKid} and action like 'family.permission%' and not from_default_seed`);
  eq(real, 0, "no real decisions yet");
});

await check("changing what a guardian may see is recorded, with the permission named", async () => {
  const rel = (await one(`select id from guardian_relationships
                           where user_id='${parentB}' and client_id=${auditKid}`)).id;
  await db.exec(`update relationship_permissions set granted = true
                  where relationship_id = '${rel}' and permission = 'view_billing'`);
  const row = await one(`select action, permission, from_default_seed from family_access_audit
                          where client_id = ${auditKid} and permission = 'view_billing'
                          order by created_at desc limit 1`);
  eq(row.action, "family.permission.granted", "action");
  eq(row.from_default_seed, false, "marked as a real decision");
});

await check("ending a guardian's access is recorded as such", async () => {
  await db.exec(`update guardian_relationships set ends_on = current_date - 1
                  where user_id='${parentB}' and client_id=${auditKid}`);
  eq(await auditCount("family.guardian.access_ended"), 1, "access_ended events");
});

await check("deleting the relationship still leaves a trail", async () => {
  // The one case where the row itself stops existing, so the audit entry is
  // the only remaining evidence the access was ever granted.
  await db.exec(`delete from guardian_relationships
                  where user_id='${parentB}' and client_id=${auditKid}`);
  eq(await auditCount("family.guardian.removed"), 1, "removal events");
});

await check("consent and its withdrawal both appear", async () => {
  const t = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, kind, consent_statement,
                                 status, published_at, created_by)
     values ('${clinicA}','audit-consent',1,'Audit consent','consent','We may.',
             'published', now(), '${aAdmin}') returning id`)).rows[0].id;
  const c = (await db.query(
    `insert into consent_records (clinic_id, client_id, template_id, granted_by)
     values ('${clinicA}', ${auditKid}, '${t}', '${parentA}') returning id`)).rows[0].id;
  eq(await auditCount("family.consent.granted"), 1, "granted");
  await db.exec(`update consent_records set withdrawn_at = now(), withdrawn_by='${parentA}'
                  where id = '${c}'`);
  eq(await auditCount("family.consent.withdrawn"), 1, "withdrawn");
});

await check("a family cannot read the audit trail, or write to it, or erase it", async () => {
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from clinical_audit_events`), 0, "reading"));
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from family_access_audit`), 0, "reading the view"));
  await as(parentA, () => insertRaises(
    `insert into clinical_audit_events (clinic_id, client_id, action)
     values ('${clinicA}', ${maya}, 'family.guardian.linked')`,
    "family writing an audit event"));
  await as(parentA, async () => {
    const res = await db.query(`delete from clinical_audit_events where client_id = ${auditKid}`);
    eq(res.affectedRows ?? 0, 0, "family deleting audit events");
  });
});

await check("an audit row is written even when the actor could not insert one", async () => {
  // The whole reason the trigger is security definer. A guardian has no insert
  // on clinical_audit_events, and if the log were written with their rights the
  // event that matters most - somebody changing who can reach a child - would
  // be the one event that never lands.
  //
  // Written against a child parentA actually guardians. The first version of
  // this test used auditKid, whom they have no relationship to, so the consent
  // insert would have been refused by RLS before the trigger ever ran - it
  // would have proved nothing about the audit and failed for an unrelated
  // reason. The template id is also read outside the `as()` block, because a
  // family only sees a template through an assignment or an existing consent.
  const t = (await db.query(
    `insert into form_templates (clinic_id, key, version, title, kind, consent_statement,
                                 status, published_at, created_by)
     values ('${clinicA}','audit-definer',1,'Definer check','consent','We may.',
             'published', now(), '${aAdmin}') returning id`)).rows[0].id;

  const before = await count(
    `select count(*)::int n from clinical_audit_events
      where client_id = ${maya} and action = 'family.consent.granted'`);

  await as(parentA, async () => {
    // Proves the actor genuinely cannot write the log themselves.
    await insertRaises(
      `insert into clinical_audit_events (clinic_id, client_id, action)
       values ('${clinicA}', ${maya}, 'family.consent.granted')`,
      "guardian writing an audit row directly");
    await db.exec(`insert into consent_records (clinic_id, client_id, template_id, granted_by)
                   values ('${clinicA}', ${maya}, '${t}', '${parentA}')`);
  });

  eq(await count(`select count(*)::int n from clinical_audit_events
                   where client_id = ${maya} and action = 'family.consent.granted'`),
     before + 1, "logged despite the actor having no insert right");
});

await check("staff read the trail with names rather than a list of UUIDs", async () => {
  await as(aClin, async () => {
    const row = await one(`select client_name, action from family_access_audit
                            where client_id = ${auditKid} order by created_at limit 1`);
    eq(row.client_name, "Audit Child", "client resolved to a name");
  });
});

await check("another clinic's staff see none of it", async () => {
  await as(bAdmin, async () =>
    eq(await count(`select count(*)::int n from family_access_audit where client_id = ${auditKid}`),
       0, "cross-tenant audit"));
});

// --------------------------------------------------------------------------
// 0069 · record visibility
//
// internal / family / specific, chosen by an admin or supervisor. Narrows what
// the permission grid already allows; never widens it.
// --------------------------------------------------------------------------
const visDoc = (await db.query(
  `insert into client_documents (clinic_id, client_id, file_path, title, direction, uploaded_by)
   values ('${clinicA}', ${maya}, 'x/report.pdf', 'Assessment report', 'staff_to_client', '${aClin}')
   returning id`)).rows[0].id;

await check("a document is visible to the family by default, as it was before", async () => {
  // The migration must not change who sees what on the day it runs.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 1, "parentA"));
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 1, "parentB"));
});

await check("only an admin or supervisor can change what a family sees", async () => {
  // A clinician writes the clinical record; deciding who outside the team
  // reads it is a supervisory judgement.
  //
  // Two mechanisms stop them, on different tables, and both are checked:
  //
  //   client_documents - the only update policy is gated on
  //     clinical.record.share, so a clinician's update matches no rows. RLS
  //     filters rather than raising, which is why this is updateAffects(0) and
  //     not insertRaises.
  //   session_notes - a clinician CAN update, through clinical.client.write.
  //     There the trigger is what refuses, and it raises.
  await as(aClin, () => updateAffects(
    `update client_documents set visibility='internal' where id='${visDoc}'`,
    0, "clinician changing a document's visibility"));
  await as(parentA, () => updateAffects(
    `update client_documents set visibility='internal' where id='${visDoc}'`,
    0, "family changing a document's visibility"));

  const noteSession = (await db.query(
    `insert into sessions (clinic_id, client_id, session_date, hour, status, type)
     values ('${clinicA}', ${maya}, current_date, 11, 'completed', 'Session') returning id`)).rows[0].id;
  const n = (await db.query(
    `insert into session_notes (clinic_id, client_id, session_id, clinician_id, body, status)
     values ('${clinicA}', ${maya}, ${noteSession}, '${aClin}',
             '{"familyUpdate":"Good session."}'::jsonb, 'signed') returning id`)).rows[0].id;
  await as(aClin, () => insertRaises(
    `update session_notes set visibility='internal' where id='${n}'`,
    "clinician changing a note's visibility"));

  await as(aSuper, async () =>
    await db.exec(`update client_documents set visibility='internal' where id='${visDoc}'`));
});

await check("internal means no family member sees it, whatever their permissions", async () => {
  // parentA holds every permission including view_shared_documents.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 0, "parentA"));
  await as(aClin, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 1, "staff still see it"));
});

await check("who set it, and when, is recorded", async () => {
  const r = await one(`select visibility_set_by, visibility_set_at from client_documents
                        where id='${visDoc}'`);
  eq(r.visibility_set_by, aSuper, "set_by");
  if (!r.visibility_set_at) throw new Error("no timestamp recorded");
});

await check("specific means the named guardian and nobody else", async () => {
  await as(aSuper, async () =>
    await db.exec(`update client_documents set visibility='specific' where id='${visDoc}'`));
  await db.exec(`insert into record_visibility_grants
                   (clinic_id, record_type, record_id, guardian_user_id, granted_by)
                 values ('${clinicA}','client_document','${visDoc}','${parentA}','${aSuper}')`);
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 1, "named guardian"));
  await as(parentB, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 0, "the other parent"));
});

await check("a family cannot enumerate who else a record was shared with", async () => {
  // The grant rows are themselves information about the household.
  await as(parentA, async () =>
    eq(await count(`select count(*)::int n from record_visibility_grants`), 0, "grants visible to a family"));
});

await check("naming a guardian does not hand them a surface they never had", async () => {
  // Visibility narrows; it never widens. `silent` had view_shared_documents
  // revoked earlier in this file.
  await db.exec(`update relationship_permissions set granted = false
                  where permission = 'view_shared_documents'
                    and relationship_id in (select id from guardian_relationships
                                             where user_id='${silent}')`);
  await db.exec(`insert into record_visibility_grants
                   (clinic_id, record_type, record_id, guardian_user_id, granted_by)
                 values ('${clinicA}','client_document','${visDoc}','${silent}','${aSuper}')`);
  await as(silent, async () =>
    eq(await count(`select count(*)::int n from client_documents where id='${visDoc}'`), 0,
       "grant without the permission"));
});

await check("a family cannot grant themselves a record", async () => {
  await as(parentB, () => insertRaises(
    `insert into record_visibility_grants
       (clinic_id, record_type, record_id, guardian_user_id, granted_by)
     values ('${clinicA}','client_document','${visDoc}','${parentB}','${aSuper}')`,
    "family-written grant"));
});

await check("an unrecognised visibility fails closed", async () => {
  // The check constraint refuses one, which is the point: a value the
  // read function does not know must never render as visible.
  await insertRaises(
    `update client_documents set visibility='everyone' where id='${visDoc}'`,
    "an unknown visibility value");
});

await check("the milestone boolean and the visibility column cannot disagree", async () => {
  const m = (await db.query(
    `insert into family_milestones (clinic_id, client_id, kind, title, occurred_on)
     values ('${clinicA}', ${maya}, 'goal_mastered', 'Visibility sync check', current_date)
     returning id, visibility`)).rows[0];
  eq(m.visibility, "internal", "unshared milestone");
  await db.exec(`update family_milestones
                    set shared_with_family = true, shared_at = now(), shared_by = '${aSuper}'
                  where id = '${m.id}'`);
  eq((await one(`select visibility from family_milestones where id='${m.id}'`)).visibility,
     "family", "sharing drives visibility");
});

await check("deleting a record takes its grants with it", async () => {
  const before = await count(
    `select count(*)::int n from record_visibility_grants where record_id='${visDoc}'`);
  if (before === 0) throw new Error("no grants to clean up");
  await db.exec(`delete from client_documents where id='${visDoc}'`);
  eq(await count(`select count(*)::int n from record_visibility_grants where record_id='${visDoc}'`),
     0, "orphaned grants");
});

console.log(out.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
