# Deploying the workforce branch

`feat/client-budget-and-credential-numbers` — migrations `0000` and `0022`–`0032`.

Read this end to end before running anything. Three of these migrations are not
ordinary: one runs out of order, two cannot run alongside anything else, and one
can take access away if production is not in the state it appears to be in.

Everything here has been executed against a real Postgres 18 (`supabase/tests`,
100 tests). None of it has been executed against production, and the whole
point of steps 1 and 3 is that this file does not assume what production looks
like.

---

## 1. Pre-flight — read production before writing to it

Run these as read-only queries against production and keep the output. Two of
them decide whether step 4 is safe.

```sql
-- a. Row security posture on the tables 0031 touches.
--    Expected: all true. If any is false, 0031 is a real change, not a no-op —
--    read step 4 before continuing.
select relname, relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and relname in ('clients','staff','sessions','calendars','locations',
                   'session_types','staff_availability','client_availability','profiles');

-- b. What policies profiles already has.
--    Expected: at least one SELECT policy. If this returns NOTHING and (a)
--    says profiles.relrowsecurity is false, then STOP and read step 4.
select policyname, cmd, qual, with_check
  from pg_policies where schemaname = 'public' and tablename = 'profiles';

-- c. The live user_role enum members, which 0000 asserts and 0029 extends.
select enumlabel from pg_enum e
  join pg_type t on t.oid = e.enumtypid
 where t.typname = 'user_role' order by e.enumsortorder;

-- d. Confirm clients.user_id exists, since every client-portal policy uses it.
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'clients' and column_name = 'user_id';

-- e. The applied migration history, so step 2's ordering is checked not assumed.
select version from supabase_migrations.schema_migrations order by version;
```

Also take the schema dump that `0000` asks for, and diff it against
`supabase/migrations/0000_baseline_core_tables.sql`. `0000` is a reconstruction
from application code; running the history caught two errors in it already, and
this is the step that would catch a third.

```bash
pg_dump --schema-only \
  -t clients -t staff -t sessions -t calendars -t locations \
  -t session_types -t staff_availability -t client_availability -t profiles \
  "$PRODUCTION_URL" > /tmp/production-baseline.sql
```

**Do not skip the diff.** If production's `session_types` has `duration_minutes`
and `cost` rather than `duration` and `price`, `0000` is wrong about it and a
rebuilt environment will diverge from production in a way nothing else catches.

---

## 2. Apply, in this order

Take a backup first. Supabase's point-in-time restore is the rollback plan for
everything except `0021` and `0029`; see step 5.

### 2a. `0000`, out of order

Production's history starts at `0001`, so the CLI sees `0000` as older than
everything applied and skips it.

```bash
supabase db push --include-all
```

Every statement in `0000` is `if not exists`, so against production this writes
nothing. Recording it is the point: it puts the repo and the live history in
agreement, and it is what lets anyone build a database from this repo at all.

### 2b. `0022` through `0028`, `0030`, `0032` — ordinary

```bash
supabase db push
```

### 2c. `0029` — alone

`alter type ... add value` cannot run in the same transaction as anything that
uses the new value. `0021` carries the same warning and for the same reason.

```bash
psql "$PRODUCTION_URL" -f supabase/migrations/0029_add_hr_and_payroll_roles.sql
```

If `supabase db push` batches it with neighbours and fails, this is why. Run it
by itself, then re-run the push.

### 2d. `0031` — the one that can take access away

Read step 4 first. If pre-flight (a) and (b) came back the way this file expects
— row security already on, profiles already carrying policies — then `0031`'s
first half is a no-op and its second half replaces hand-made policies with
recorded ones. That still deserves a staging run.

---

## 3. Verify, before anyone uses it

```sql
-- Nothing inert. Every row should say 'ok'.
select * from rls_coverage where status <> 'ok';

-- The checklist. Everything failing is a number that will be wrong or absent.
select * from deployment_readiness order by passing, check_name;

-- Who cannot be paid yet, and why, in words.
select full_name, blocker from payroll_readiness where blocker <> 'ready';

-- Delivered sessions that could not be attributed, and what is blocking each.
select blocked_by, count(*) from underived_sessions group by blocked_by;
```

Then sign in as each role and confirm the obvious things still work: a clinician
sees their caseload, a scheduler sees the calendar, a family sees their own
budget and nobody else's, an administrator sees Settings. The RLS suite covers
these as assertions; this is the version that catches a wrong `clinic_id` on a
real profile.

---

## 4. The `0031` risk, stated plainly

`0031` enables row security on nine tables and adds policies to `profiles`.

**What the evidence says.** Migration `0014`'s header reports a clinician's
`getClients()` returning "a plain, RLS-filtered empty array" — the reported
"empty caseload" symptom it was written to fix. That symptom is only possible if
row security is already active on `clients` in production. The likely history is
that these tables and their first policies were created by hand in the Supabase
dashboard, which enables row security for you, and `0013` later dropped and
replaced the policies without touching the flag. So the defect is that **the
repository does not reproduce production**, not that production is open.

**What to do if pre-flight disagrees.** If (a) shows row security off on the
eight scheduler tables, then production has been open to any authenticated user
across all clinics, and `0031` is a security fix to apply urgently — but
carefully, because turning row security on immediately starts enforcing policies
that have never been exercised. Apply to staging, run through every portal, then
production during a quiet window.

**If (b) returns no policies on `profiles` at all**, that is the serious case.
Every portal's auth gate reads `profiles`, and the moment row security comes on,
only what `0031` permits keeps working. `0031`'s policies are written to cover
every read the applications actually make — own row, and clinic peers for the
team screens — but verify against staging with real data before production. The
`0031` migration refuses to enable row security on any table with no policies at
all, so it will stop rather than lock everyone out.

---

## 5. Rollback

Everything except the two enum migrations rolls back by point-in-time restore.

`0021` and `0029` do not. **Postgres cannot remove a value from an enum.** If
you roll back past them, the values stay. That is harmless — an unused enum
member costs nothing, and `0021` documents the same situation for the retired
`staff` role — but it means the enum is not a clean revert. Nothing else depends
on it.

`0031` rolls back with `alter table ... disable row level security`, which
restores the previous posture exactly. Do that only as an emergency measure and
with the understanding that it reopens whatever it was closing.

---

## 6. After deploy — the data work

The schema is live at this point and the derivation still does nothing. Three
things have to be done by a person, in this order, and none can be automated.

**Link scheduler records to people.** Settings → Workforce. Until an employment
record names a `staff_id`, delivered sessions cannot become hours, and
`underived_sessions` reports every one of them as blocked. The screen shows both
names side by side because the mismatch is the thing worth checking; software
matching on names would eventually pay one person for another's hours.

**Confirm employment terms.** `0025`'s backfill wrote `full_time` for everyone
because `hub_employee_profiles` does not record employment type. `0032` marks
every one of those rows provisional, and `employee_week_economics` returns null
cost for them rather than a plausible wrong figure. Someone who knows the roster
has to set the real employment type, standard hours and FTE. Query:

```sql
select full_name, position_title, employment_type
  from payroll_readiness where position_provisional;
```

**Set rates.** Billing rates, so delivered sessions post charges; employer cost
loading, so margin is not overstated by 15–25%; pay rates, so anyone can be
paid at all. All three are reported by `deployment_readiness`.

Until those three are done, the platform records hours and refuses to price
them. That is the intended behaviour and not a bug to work around.

---

## 7. What is deployed, and what is not

**Deployed and working:** client budgets with a family-facing statement and a
clinic-facing Funding tab; credential numbers in the employee portal; the
permission, event, employment, time and rate schema; the session→time→charge
derivation; the Workforce linking screen and derivation queue.

**Deployed as schema with no screen yet:** timesheets (the state machine and
the ESA overtime split are tested and correct; there is no "my time" or
approval UI), the permission matrix editor, employment record editing, and
payroll export.

**Not built, deliberately:** source deductions. Income tax, CPP and EI
withholding belong to the payroll provider. This platform produces gross
earnings by pay code. Nothing here should be described as "payroll" without
that sentence attached to it.
