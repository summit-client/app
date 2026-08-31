-- 0033 · Provisional data, and the readiness checks that gate a deploy
--
-- THE PROBLEM
--
-- Migration 0026's backfill writes an employment position for everyone in
-- hub_employee_profiles, and asserts `employment_type = 'full_time'` for all of
-- them, because hub_employee_profiles does not record employment type and there
-- is nothing to derive it from. The column has to be non-null for the
-- constraint to mean anything, so a value had to be written.
--
-- That value is wrong for every part-time and casual employee on the roster.
-- Wrong employment type means wrong standard weekly hours, which means a wrong
-- utilization denominator and — far worse — a wrong overtime threshold. The
-- failure is silent: every view returns a number, the number looks reasonable,
-- and it is somebody's pay.
--
-- 0026's own comment says these rows are placeholders awaiting a pass by
-- someone who knows the roster. A comment in a migration file is not a control.
-- This makes it one.
--
-- THE APPROACH
--
-- Mark the placeholders, and make anything that would spend money on them
-- refuse rather than compute. A wrong number that arrives confidently is worse
-- than no number: nobody checks the first, and everybody chases the second.

alter table employment_positions
  add column if not exists provisional boolean not null default false;

comment on column employment_positions.provisional is
  'This row was created by a backfill and its employment_type, standard hours '
  'and FTE were assumed rather than recorded. Pay-affecting derivations refuse '
  'to use it. Cleared by a human confirming the real terms.';

-- Every position the backfill created. It is the only path that writes a
-- position with no created_by: the application always records who acted, and
-- the RLS policies on this table require an authenticated caller who would
-- therefore have an id.
update employment_positions
   set provisional = true
 where created_by is null
   and provisional = false;

-- And keep it true going forward. The UPDATE above only catches what exists
-- today; the next backfill, import or fix-up script would reintroduce exactly
-- the same silent assumption. A row that cannot say who recorded it is not a
-- recorded fact, so it is provisional by construction rather than by anyone
-- remembering to set the flag.
create or replace function public.employment_positions_mark_provisional() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.created_by is null then
    new.provisional := true;
  end if;
  return new;
end $$;

drop trigger if exists employment_positions_provisional on employment_positions;
create trigger employment_positions_provisional
  before insert on employment_positions
  for each row execute function public.employment_positions_mark_provisional();

comment on function public.employment_positions_mark_provisional() is
  'A position with no attributable author is provisional. Clearing the flag '
  'means a person confirmed the terms, which is an UPDATE they are accountable '
  'for rather than a default nobody chose.';

-- ---------------------------------------------------------------------------
-- Payroll readiness, per employment
--
-- The question this answers is the only one that matters before a pay run:
-- for this person, in this period, is every input a recorded fact rather than
-- an assumption? Each column is a reason to stop, named in words rather than
-- as a boolean nobody can interpret at 6pm on a Thursday.
-- ---------------------------------------------------------------------------
create or replace view payroll_readiness as
select
  r.id                                as employment_id,
  r.clinic_id,
  r.user_id,
  p.full_name,
  r.staff_id,
  pos.position_title,
  pos.employment_type,
  pos.provisional                     as position_provisional,
  (r.staff_id is null)                as scheduler_record_unlinked,
  (pos.id is null)                    as no_current_position,
  (rate.id is null)                   as no_pay_rate,
  (pos.overtime_exempt and pos.overtime_exempt_basis is null)
                                      as exemption_unexplained,
  case
    when pos.id is null
      then 'No current position. Record what they are employed as.'
    when rate.id is null
      then 'No pay rate on file. Nothing can be paid until there is one.'
    when pos.provisional
      then 'Employment type was assumed by the backfill, not recorded. Confirm it before paying: the overtime threshold depends on it.'
    when r.staff_id is null
      then 'Not linked to a scheduler record, so delivered sessions cannot become hours. Time can still be entered by hand.'
    else 'ready'
  end                                 as blocker
from employment_records r
join profiles p on p.id = r.user_id
left join employment_positions pos
  on pos.employment_id = r.id
 and pos.effective_from <= current_date
 and (pos.effective_to is null or pos.effective_to >= current_date)
left join lateral (
  select pr.id from pay_rates pr
   where pr.employment_id = r.id
     and pr.effective_from <= current_date
     and (pr.effective_to is null or pr.effective_to >= current_date)
   order by pr.effective_from desc
   limit 1
) rate on true
where r.end_date is null;

comment on view payroll_readiness is
  'One row per open employment, with the first reason it is not safe to pay, in '
  'words. "ready" means every input is a recorded fact.';

-- ---------------------------------------------------------------------------
-- Refuse to price a provisional position
--
-- employee_work_weeks reports hours whatever happens — a person worked what
-- they worked, and suppressing that would hide the very thing somebody needs to
-- see. What it must not do is present an overtime split derived from an
-- employment type nobody confirmed.
--
-- So the view gains a column saying whether the split is trustworthy, and the
-- money view below returns null rather than a number when it is not. Null
-- propagates into a report as a visible gap; a plausible wrong number does not.
-- ---------------------------------------------------------------------------
-- `create or replace view` cannot add a column anywhere but the end, and
-- terms_provisional belongs beside the figures it qualifies rather than
-- trailing after the money. So these three are dropped in dependency order and
-- rebuilt. Dropped explicitly rather than with `cascade`: cascade would also
-- silently take anything else that had come to depend on them, and finding out
-- later which reports vanished is not a good afternoon.
drop view if exists employee_week_economics;
drop view if exists employee_utilization;
drop view if exists employee_work_weeks;

create view employee_work_weeks as
select
  e.clinic_id,
  e.employment_id,
  e.work_week_start,
  round(sum(e.minutes) filter (where a.counts_as_worked) / 60.0, 2)      as worked_hours,
  round(sum(e.minutes) filter (where not a.counts_as_worked) / 60.0, 2)  as non_worked_hours,
  round(sum(e.minutes) filter (where a.counts_as_productive) / 60.0, 2)  as productive_hours,
  round(sum(e.minutes) filter (where a.billable) / 60.0, 2)              as billable_hours,
  greatest(
    round(sum(e.minutes) filter (where a.counts_as_worked) / 60.0, 2)
      - coalesce(w.overtime_threshold_hours, 44.00), 0)                  as overtime_hours,
  least(
    round(sum(e.minutes) filter (where a.counts_as_worked) / 60.0, 2),
    coalesce(w.overtime_threshold_hours, 44.00))                         as regular_hours,
  bool_or(p.overtime_exempt)                                             as overtime_exempt,
  -- New: whether the terms behind the split were recorded or assumed.
  bool_or(coalesce(p.provisional, true))                                 as terms_provisional
from time_entries e
join activity_codes a on a.id = e.activity_code_id
left join work_week_config w on w.clinic_id = e.clinic_id
left join employment_positions p
  on p.employment_id = e.employment_id
 and p.effective_from <= e.work_date
 and (p.effective_to is null or p.effective_to >= e.work_date)
group by e.clinic_id, e.employment_id, e.work_week_start, w.overtime_threshold_hours;

comment on view employee_work_weeks is
  'Hours per employee per declared work week, with the ESA overtime split. '
  'Hours are always reported. terms_provisional true means the employment type '
  'behind the split was assumed by a backfill, so the split is not to be paid '
  'against — employee_week_economics returns null cost for those weeks. It is '
  'also true when no position covers the date at all, because an absent term is '
  'no more confirmed than an assumed one. overtime_exempt is reported, not '
  'applied: a claimed exemption that turns out to be wrong is a liability that '
  'should be visible rather than a row that was never computed.';

create view employee_week_economics as
select
  w.clinic_id,
  w.employment_id,
  w.work_week_start,
  w.worked_hours,
  w.overtime_hours,
  w.billable_hours,
  w.terms_provisional,
  coalesce(sum(t.revenue), 0) as revenue,
  -- Revenue is what a funder was charged and does not depend on the employee's
  -- terms at all, so it is reported either way. Cost does depend on them.
  case when w.terms_provisional then null else
    coalesce(sum(t.base_cost), 0)
      + round(w.overtime_hours
              * coalesce(public.pay_rate_for(w.employment_id, w.work_week_start), 0) * 0.5
              * public.cost_multiplier_for(w.clinic_id, w.work_week_start), 2)
  end as cost
from employee_work_weeks w
left join time_entry_economics t
  on t.employment_id = w.employment_id and t.work_week_start = w.work_week_start
group by w.clinic_id, w.employment_id, w.work_week_start,
         w.worked_hours, w.overtime_hours, w.billable_hours, w.terms_provisional;

comment on view employee_week_economics is
  'Revenue and cost per employee per week. cost is NULL where the employment '
  'terms were assumed rather than recorded: a gap in a report gets chased, a '
  'confident wrong number does not.';

-- employee_utilization is unchanged in shape; it is recreated because the view
-- it reads was dropped above. It gains terms_provisional for the same reason
-- the economics view did: a utilization percentage computed against an assumed
-- FTE is a made-up denominator.
create view employee_utilization as
select
  w.clinic_id,
  w.employment_id,
  w.work_week_start,
  w.worked_hours,
  w.productive_hours,
  w.billable_hours,
  w.terms_provisional,
  round(c.standard_weekly_hours * c.fte, 2) as scheduled_hours,
  case when w.terms_provisional then null
       when c.standard_weekly_hours * c.fte > 0
       then round(w.productive_hours / (c.standard_weekly_hours * c.fte) * 100, 1)
       else null end as utilization_percent
from employee_work_weeks w
left join current_employment c on c.employment_id = w.employment_id;

comment on view employee_utilization is
  'Productive hours against the position''s scheduled hours. Null where the '
  'terms were assumed rather than recorded: a percentage against a made-up '
  'denominator is not a measurement.';

-- ---------------------------------------------------------------------------
-- Organization readiness
--
-- The pre-deploy checklist, as a query rather than a document somebody has to
-- remember to run. Every row is something that will produce a wrong or missing
-- number in production if it is left as it is.
-- ---------------------------------------------------------------------------
create or replace view deployment_readiness as
with checks as (
  select 'Employment terms confirmed' as check_name,
         count(*) filter (where provisional)::int as outstanding,
         'Positions whose employment type was assumed by the backfill. Each one is a wrong overtime threshold waiting to happen.' as why
    from employment_positions
   where effective_to is null

  union all
  select 'Scheduler records linked',
         count(*) filter (where staff_id is null)::int,
         'Open employments with no scheduler record. Delivered sessions for these people cannot become hours or charges.'
    from employment_records where end_date is null

  union all
  select 'Pay rates on file',
         count(*)::int,
         'Open employments with no current pay rate. Nothing can be paid for them.'
    from employment_records r
   where r.end_date is null
     and not exists (select 1 from pay_rates pr
                      where pr.employment_id = r.id
                        and pr.effective_from <= current_date
                        and (pr.effective_to is null or pr.effective_to >= current_date))

  union all
  select 'Employer cost loading recorded',
         (select count(*)::int from clinics c
           where not exists (select 1 from employer_cost_loading l
                              where l.clinic_id = c.id
                                and l.effective_from <= current_date
                                and (l.effective_to is null or l.effective_to >= current_date))),
         'Clinics with no cost loading. Cost falls back to the pay rate, which understates it by roughly 15-25%.'

  union all
  select 'Billing rates set',
         (select count(*)::int from clinics c
           where not exists (select 1 from billing_rates b where b.clinic_id = c.id)),
         'Clinics with no billing rate. Delivered sessions record hours but post no charge, so budgets never move.'

  union all
  select 'Public holidays seeded ahead',
         case when exists (
           select 1 from public_holidays
            where holiday_date > current_date + interval '90 days') then 0 else 1 end,
         'No public holidays more than 90 days out. Holiday pay goes silent rather than wrong, but it goes silent.'

  union all
  select 'Row security active',
         (select count(*)::int from rls_coverage where status like 'POLICIES INERT%'),
         'Tables carrying policies with row security switched off. Every one of those policies is doing nothing.'

  union all
  select 'Sessions awaiting derivation',
         (select count(*)::int from underived_sessions where blocked_by <> 'ready to derive'),
         'Delivered sessions that could not be attributed. Hours and charges for these are missing, not wrong.'
)
select check_name, outstanding, (outstanding = 0) as passing, why
  from checks
 order by (outstanding = 0), check_name;

comment on view deployment_readiness is
  'The pre-deploy checklist as a query. Everything passing does not mean the '
  'platform is correct; anything failing means a number in production will be '
  'wrong or absent, and says which.';
