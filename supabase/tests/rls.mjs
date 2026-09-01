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
// 0035 · households, guardians and per-relationship permissions
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

console.log(out.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
