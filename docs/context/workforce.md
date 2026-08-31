# Workforce, OBM and payroll — the schema layer

Migrations `0000` and `0023`–`0028`, plus `packages/workforce`.

This document is written to be read before anyone builds a screen on top of
this layer, and specifically before anyone reports it as finished. The last
section is the honest status.

## What the six migrations do

| Migration | What it establishes |
|---|---|
| `0000` | Baseline DDL for the eight scheduler tables that predate the migration history. Makes `supabase db reset` possible for the first time. No-op against production. |
| `0023` | Action-based permissions: `auth_can('domain.object.verb')`, a per-clinic role/action matrix, per-user exceptions, and the HR/clinical boundary redefined in terms of actions. |
| `0024` | `organization_events`: one append-only stream that crosses module boundaries, with a fixed reviewed catalogue of event types. |
| `0025` | The employment record — the row that finally says a scheduler `staff` resource and a `profiles` login are the same employment. Effective-dated positions, leaves, ESA continuous service. |
| `0026` | Activity codes (what was done) and pay codes (how it is paid), kept separate. Ontario public holidays as data. |
| `0027` | Time entries, timesheets, the declared work week, and the ESA overtime split as a derived view. |
| `0028` | Billing rates, pay rates, employer cost loading; revenue and cost derived per entry and per week. |

## The four decisions worth knowing

**The work week is not the pay period.** Ontario computes overtime over a
declared recurring seven-day period. Summing over a bi-weekly pay period
instead is the standard Ontario payroll defect: a 60-hour week followed by a
20-hour week is 16 hours of overtime, and pooled over the period it is 80
hours and none. Entries carry `work_week_start`, stamped by the database, and
every overtime figure groups on it.

**Activity and pay are two vocabularies.** "Direct therapy" is not a pay rate;
the same hour is regular time one week and overtime the next. "Overtime" is
not an activity; nothing billable can be derived from it. One time entry
carries both, an employee picks the activity, and the pay code is derived.

**Cost is not pay.** Employer CPP, EI, WSIB, EHT, vacation accrual and
benefits sit on top of the pay rate, commonly 15–25% in Ontario. Margin
computed against pay is wrong by that much in the flattering direction. The
loading is recorded per clinic rather than guessed, and defaults to zero,
which understates rather than invents.

**Nothing that pays anyone is stored.** Hours, overtime, revenue and cost are
all views over time entries. The only stored numbers are the ones a human
entered: a duration, a rate, an allocation.

## Where the boundary between HR and clinical is drawn

`auth_can()` actions carry `exposes_phi` and `exposes_hr_confidential`, and a
constraint forbids an action carrying both. `hub_can_manage()` — which every
HR policy from `0006` and `0007` already called — is redefined in `0023` from
role names to actions, so an HR administrator can exist who reads employment
files and no PHI, and a clinical role can exist that reads PHI and no
colleague's HR file.

Pay rates are narrower still: own rate, or `finance.payroll.read`. Not HR. An
HR administrator maintaining onboarding records has no automatic business
knowing what colleagues earn.

## What Section 54 rules out, structurally

`organization_events` records organizational facts — a shift approved, a
credential lapsed, a rate changed. Not individual activity: no page views, no
idle time, no keystrokes, no location, no "productivity" derived from anything
other than work actually delivered and recorded.

This is enforced by the catalogue rather than by a constraint. `event_type` is
a foreign key into a fixed list, so adding one is a migration, and a migration
gets read. An event type whose purpose is surveillance should not survive that
reading.

Two related properties: every person can always read events about themselves,
and `employee_work_weeks` reports the excess hours of an overtime-exempt
position rather than suppressing them, because a claimed exemption that turns
out to be wrong is a liability that should be visible.

## Status — read this before calling anything done

### Verified, by execution

**All 31 migrations apply from an empty database.** `supabase/tests/apply.mjs`
runs them in order against PGlite, a real Postgres 18 compiled to WASM, with no
install required. Result: 85 tables, 11 views, 35 functions, 265 policies.

**45 behavioural tests pass.** `supabase/tests/behaviour.mjs` covers permission
resolution and expiry, the HR/clinical boundary in both directions, the
append-only event stream, employment constraints, the ESA overtime split, the
timesheet state machine including refusal of self-approval, rate resolution,
minimum-wage reporting, budget arithmetic, and the session derivation.

**16 TypeScript tests pass.** `packages/workforce/esa.test.ts`. The overtime
cases there and in `behaviour.mjs` are deliberately identical, because one rule
implemented twice is only safe if both are checked against one specification.

### What running it found

Four defects that reading it had not:

1. **`profiles.role` is a Postgres enum, not text.** Migration `0021` proves it.
   The `0000` baseline had it as `text`, which would have produced a database
   that looked right and rejected `0021`.
2. **`clients.user_id` was missing from the baseline.** It is what
   `auth_client_row_id()` reads, so every client-portal RLS policy in `0020`
   and `0022` depends on it.
3. **`hr_admin` and `payroll_admin` were unassignable.** `0023` seeded a
   permission matrix for two roles the enum could not hold — the same
   unreachable-role situation `0021` describes for `supervisor`. Fixed by
   `0029`.
4. **`budget_entries.session_id` referenced the wrong table**, and
   `client_sessions` had no link to `sessions` at all. See the header of
   `0030`; both are corrected there.

### Still unverified

- **RLS enforcement.** PGlite runs as the superuser, who bypasses row security.
  Policies are verified as creatable and their functions tested directly, but
  whether a policy filters correctly for a given JWT needs a Supabase instance
  and the psql path in `supabase/tests/README.md`.
- **The three overlap-exclusion constraints** on `employment_positions`,
  `pay_periods` and `pay_rates`. They need `btree_gist`, which PGlite does not
  bundle. Available on Supabase; unproven here.
- **The `0000` baseline against production.** Two defects in it were caught by
  the migrations that follow it. That is evidence the method works, not
  evidence the file is now complete. `pg_dump --schema-only` the eight tables
  and reconcile before treating a rebuilt database as a restore target.

### Known incomplete, deliberately

- No source deductions. Income tax, CPP and EI withholding belong to the
  payroll provider. This produces gross earnings by pay code. Nothing here
  should be described as "payroll" without that sentence attached.
- `employment_records.staff_id` is null for every backfilled row, so
  `record_session_delivery` reports every session for those people as blocked.
  That is the intended behaviour — it refuses to guess which login a scheduler
  resource belongs to — but it means the derivation does nothing useful until
  someone works through `underived_sessions` and links them.
- The `0025` backfill asserts `full_time` for everyone, because
  `hub_employee_profiles` does not record employment type. Wrong for every
  part-time and casual employee, and it will produce wrong overtime thresholds
  until corrected. Those rows are placeholders, not data.
- `employer_cost_loading.vacation_percent` is one clinic-wide figure and cannot
  express the ESA's 6% at five years of service. It understates cost for
  long-service employees.
- Contribution percentages are flat and ignore annual maxima. An employee past
  the CPP or EI ceiling costs less than this arithmetic says. Planning-grade,
  not books-grade.
- Averaging agreements, the three-hour rule and on-call rules are not modelled.
  `pay_codes.ONCALL` defaults to 0.25 as a placeholder that must be set
  deliberately before use.
- `public_holidays` is seeded through 2027 only. A missing year makes the
  holiday views silent rather than wrong, which is the intended failure mode,
  but it still needs a row added annually.
- `client_sessions.scheduled_session_id` exists but nothing sets it yet. The
  Run Session workspace needs to carry the booking through.
- No UI for any of it. A screen is not evidence that the layer beneath works.
