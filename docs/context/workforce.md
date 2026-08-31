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

**Verified.** `packages/workforce/esa.ts` — 16 tests, all passing under
`node --experimental-strip-types --test esa.test.ts`. They cover the work-week
boundary (including the Toronto DST transition), the overtime threshold, the
work-week-versus-pay-period defect, exclusion of paid-but-not-worked time from
the threshold, blended-rate overtime, salary-to-hourly reduction, the 4%/6%
vacation step, and public holiday pay.

**Not verified.** Every one of the six migrations. There is no PostgreSQL and
no Docker on the machine they were written on, so not one statement has been
executed. They have been checked structurally — balanced blocks, matched
`begin`/`end`, `if not exists` throughout — and reviewed against the existing
schema's conventions, and that is all. Before any of this is relied on:

1. `supabase db reset` against a local instance, which is also the first real
   test of whether `0000` reconstructs the eight tables correctly.
2. Run the `esa.test.ts` cases against the SQL views. The tests are the
   specification; `employee_work_weeks` should reproduce them exactly, and any
   disagreement is a defect in the view, not in the tests.
3. Confirm the `0023` seed is genuinely a no-op by comparing what each
   existing role can reach before and after.
4. `pg_dump --schema-only` the eight baseline tables from production and
   reconcile against `0000`.

**Known incomplete, deliberately.**

- No source deductions. Income tax, CPP and EI withholding belong to the
  payroll provider. This produces gross earnings by pay code. Nothing here
  should be described as "payroll" without that sentence attached.
- `employment_records.staff_id` is null for every backfilled row. Matching a
  scheduler resource to a login is the gap `0025` exists to close and cannot
  close by guessing — names are not unique and a wrong match pays one person
  for another's hours. It needs a screen showing both rosters and a person who
  knows the roster.
- The `0025` backfill asserts `full_time` for everyone, because
  `hub_employee_profiles` does not record employment type. That is wrong for
  every part-time and casual employee and will produce wrong overtime
  thresholds until corrected. Those rows are placeholders, not data.
- `employer_cost_loading.vacation_percent` is one clinic-wide figure and
  cannot express the ESA's 6% at five years of service. It understates cost
  for long-service employees.
- Contribution percentages are flat and ignore annual maxima. An employee past
  the CPP or EI ceiling costs less than this arithmetic says. Planning-grade,
  not books-grade.
- Averaging agreements, the three-hour rule, and on-call rate rules are not
  modelled. `pay_codes.ONCALL` defaults to 0.25 as a placeholder that must be
  set deliberately before use.
- `public_holidays` is seeded through 2027 only. A missing year makes the
  holiday views silent rather than wrong, which is the intended failure mode,
  but it still needs a row added annually.
- No UI. Section 67: a screen is not evidence that the layer beneath it works.
