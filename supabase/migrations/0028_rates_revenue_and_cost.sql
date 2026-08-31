-- 0028 · Rates, revenue and cost
--
-- The money layer, and the last piece the workforce work needs. Three rate
-- kinds, deliberately separate:
--
--   billing rates      what a funder is charged for an hour of a service
--   pay rates          what an employee earns for an hour of work
--   cost rates         what an hour of that employee actually costs the
--                      organization, which is not their pay rate
--
-- Every one of them is effective-dated, and none is ever edited in place. A
-- rate change is a new row that supersedes the old one on a date. This is not
-- fastidiousness: re-running a pay period after a raise, or reproducing an
-- invoice a funder is querying, both require knowing what the rate WAS, and a
-- table that only knows what the rate IS cannot answer either.
--
-- WHY COST IS NOT PAY
--
-- An employee paid $40 an hour does not cost $40 an hour. Employer CPP and EI
-- contributions, WSIB premiums, vacation pay accrual, employer health tax and
-- benefits all sit on top, and together they are commonly 15-25% in Ontario.
-- A margin computed against the pay rate is wrong by roughly that much, in the
-- flattering direction, which is exactly the direction that makes a service
-- look sustainable when it is not.
--
-- The loading is recorded as a percentage rather than computed, because the
-- real figure depends on the employer's WSIB rate group, benefits plan and EHT
-- exemption, and a platform that guesses at those is asserting something about
-- someone's books it has no way to know.
--
-- WHAT THIS DOES NOT DO
--
-- It does not calculate source deductions. Income tax, CPP and EI withholding
-- are the payroll provider's job, they change annually, and getting them
-- wrong is a CRA remittance problem rather than a reporting inconvenience.
-- This produces gross earnings by pay code and hands them over. Section 67
-- applies with particular force here: nothing in this migration should be
-- described as "payroll" without that sentence attached to it.

-- ---------------------------------------------------------------------------
-- Billing rates · what a funder pays
-- ---------------------------------------------------------------------------
create table if not exists billing_rates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,

  -- Narrowing scope, most specific match wins. All three null is the clinic's
  -- default rate for everything, which is where a small organization starts.
  activity_code_id uuid references activity_codes(id) on delete cascade,
  session_type_id bigint references session_types(id) on delete cascade,
  funding_source text,                 -- matches client_budgets.funding_source

  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  currency text not null default 'CAD',

  effective_from date not null,
  effective_to date,

  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint billing_rates_dates check (effective_to is null or effective_to >= effective_from)
);
create index if not exists billing_rates_lookup_idx
  on billing_rates(clinic_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- Pay rates · what an employee earns
--
-- Attached to the employment, not to the person: a rehire is a new engagement
-- and starts a new rate history rather than inheriting the old one.
-- ---------------------------------------------------------------------------
create table if not exists pay_rates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  employment_id uuid not null references employment_records(id) on delete cascade,

  basis text not null check (basis in ('hourly', 'annual_salary')),
  -- For hourly, the rate. For salary, the annual amount; the hourly
  -- equivalent is derived from the position's standard weekly hours, which is
  -- also the ESA basis for a salaried employee's overtime rate.
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'CAD',

  effective_from date not null,
  effective_to date,

  -- Why it changed. A rate history without reasons cannot answer a pay equity
  -- question, and those get asked years later.
  change_reason text check (change_reason in
    ('initial', 'annual_review', 'promotion', 'market_adjustment',
     'credential_attained', 'minimum_wage', 'correction', 'other')),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint pay_rates_dates check (effective_to is null or effective_to >= effective_from)
);
create index if not exists pay_rates_employment_idx
  on pay_rates(employment_id, effective_from desc);

create extension if not exists btree_gist;
alter table pay_rates drop constraint if exists pay_rates_no_overlap;
alter table pay_rates add constraint pay_rates_no_overlap
  exclude using gist (
    employment_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  );

-- Ontario's general minimum wage. Held as data because it changes on 1 October
-- most years, and because the check that matters is "was this rate legal on
-- the day it applied", which needs the historical figure, not today's.
create table if not exists minimum_wage_rates (
  jurisdiction text not null default 'CA-ON',
  category text not null default 'general'
    check (category in ('general', 'student', 'homeworker')),
  hourly_rate numeric(10,2) not null check (hourly_rate > 0),
  effective_from date not null,
  effective_to date,
  primary key (jurisdiction, category, effective_from)
);

insert into minimum_wage_rates (jurisdiction, category, hourly_rate, effective_from, effective_to) values
  ('CA-ON', 'general', 16.55, '2023-10-01', '2024-09-30'),
  ('CA-ON', 'general', 17.20, '2024-10-01', '2025-09-30'),
  ('CA-ON', 'general', 17.60, '2025-10-01', null)
on conflict do nothing;

comment on table minimum_wage_rates is
  'Ontario general minimum wage by effective date. Seeded to 2025-10-01. The rate '
  'is announced each spring for the following 1 October, so this table needs a row '
  'added annually; a missing row makes the compliance view below silent rather '
  'than wrong, which is why that view reports "unknown" instead of "compliant".';

-- ---------------------------------------------------------------------------
-- Cost loading · what an hour actually costs
-- ---------------------------------------------------------------------------
create table if not exists employer_cost_loading (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,

  -- Each stated separately rather than as one blended number, so a clinic can
  -- see which component moved when the total does.
  cpp_percent numeric(5,3) not null default 0 check (cpp_percent >= 0),
  ei_percent numeric(5,3) not null default 0 check (ei_percent >= 0),
  wsib_percent numeric(5,3) not null default 0 check (wsib_percent >= 0),
  eht_percent numeric(5,3) not null default 0 check (eht_percent >= 0),
  vacation_percent numeric(5,3) not null default 4.000 check (vacation_percent >= 4.000),
  benefits_percent numeric(5,3) not null default 0 check (benefits_percent >= 0),
  other_percent numeric(5,3) not null default 0 check (other_percent >= 0),

  effective_from date not null,
  effective_to date,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint employer_cost_loading_dates
    check (effective_to is null or effective_to >= effective_from)
);
create index if not exists employer_cost_loading_idx
  on employer_cost_loading(clinic_id, effective_from desc);

comment on column employer_cost_loading.vacation_percent is
  'Ontario ESA minimum vacation pay: 4% under five years of service, 6% at five '
  'years and over. The constraint enforces the 4% floor only. An employer with '
  'long-service employees needs 6% for them, and this single clinic-wide figure '
  'cannot express that — it will understate cost for those employees until the '
  'loading is made service-aware. Recorded here rather than left as a surprise.';

comment on column employer_cost_loading.cpp_percent is
  'All contribution percentages default to zero, which understates cost to zero '
  'rather than guessing. They are annual figures with earnings maxima that this '
  'flat-percentage model does not represent: an employee past the CPP or EI '
  'maximum costs less for the rest of the year than this arithmetic says. Good '
  'enough for planning, not a substitute for the payroll provider''s numbers.';

-- ---------------------------------------------------------------------------
-- Rate resolution
--
-- One function per rate kind, so that a report, an invoice and a screen cannot
-- resolve the same rate three different ways.
-- ---------------------------------------------------------------------------
create or replace function public.billing_rate_for(
  p_clinic uuid, p_activity uuid, p_session_type bigint,
  p_funding text, p_on date
) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select r.hourly_rate
    from public.billing_rates r
   where r.clinic_id = p_clinic
     and r.effective_from <= p_on
     and (r.effective_to is null or r.effective_to >= p_on)
     and (r.activity_code_id is null or r.activity_code_id = p_activity)
     and (r.session_type_id is null or r.session_type_id = p_session_type)
     and (r.funding_source is null or r.funding_source = p_funding)
   order by
     -- Most specific match wins, and specificity is counted rather than
     -- ordered by column, so adding a fourth dimension later does not silently
     -- reshuffle which rate applies.
     (case when r.activity_code_id is not null then 1 else 0 end
      + case when r.session_type_id is not null then 1 else 0 end
      + case when r.funding_source is not null then 1 else 0 end) desc,
     r.effective_from desc
   limit 1
$$;

create or replace function public.pay_rate_for(p_employment uuid, p_on date)
returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when r.basis = 'hourly' then r.amount
    -- ESA: a salaried employee's regular rate is the salary reduced to an
    -- hourly figure over their standard hours. 52 weeks, not 52.18: the ESA
    -- works in weeks, and a fractional week here produces a rate that is
    -- fractionally low, which is the wrong direction to be wrong in.
    else round(r.amount / nullif(p.standard_weekly_hours * p.fte * 52, 0), 2)
  end
  from public.pay_rates r
  left join public.employment_positions p
    on p.employment_id = r.employment_id
   and p.effective_from <= p_on
   and (p.effective_to is null or p.effective_to >= p_on)
  where r.employment_id = p_employment
    and r.effective_from <= p_on
    and (r.effective_to is null or r.effective_to >= p_on)
  order by r.effective_from desc
  limit 1
$$;

create or replace function public.cost_multiplier_for(p_clinic uuid, p_on date)
returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select 1 + (l.cpp_percent + l.ei_percent + l.wsib_percent + l.eht_percent
                 + l.vacation_percent + l.benefits_percent + l.other_percent) / 100
       from public.employer_cost_loading l
      where l.clinic_id = p_clinic
        and l.effective_from <= p_on
        and (l.effective_to is null or l.effective_to >= p_on)
      order by l.effective_from desc
      limit 1),
    1)
$$;

comment on function public.cost_multiplier_for(uuid, date) is
  'Falls back to 1 when a clinic has recorded no loading, meaning cost equals pay. '
  'That is knowably too low. Any view using it should say so rather than present '
  'the resulting margin as fact.';

-- ---------------------------------------------------------------------------
-- Derived: what a week of work earned and cost
--
-- Revenue is billable hours at the resolved billing rate. Cost is worked hours
-- at the pay rate, plus the overtime premium, times the employer loading.
-- ---------------------------------------------------------------------------
create or replace view time_entry_economics as
select
  e.id as time_entry_id,
  e.clinic_id,
  e.employment_id,
  e.work_date,
  e.work_week_start,
  e.client_id,
  a.code as activity_code,
  a.billable,
  round(e.minutes / 60.0, 2) as hours,

  case when a.billable then
    round((e.minutes / 60.0) * coalesce(
      public.billing_rate_for(e.clinic_id, e.activity_code_id, st.id, b.funding_source, e.work_date),
      0), 2)
  else 0 end as revenue,

  case when a.counts_as_worked then
    round((e.minutes / 60.0)
          * coalesce(public.pay_rate_for(e.employment_id, e.work_date), 0)
          * public.cost_multiplier_for(e.clinic_id, e.work_date), 2)
  else 0 end as base_cost
from time_entries e
join activity_codes a on a.id = e.activity_code_id
left join sessions s on s.id = e.session_id
left join session_types st on st.name = s.type and st.clinic_id = e.clinic_id
left join lateral (
  select cb.funding_source
    from client_budgets cb
   where cb.client_id = e.client_id
     and cb.period_start <= e.work_date
     and (cb.period_end is null or cb.period_end >= e.work_date)
     and cb.status <> 'CLOSED'
   order by cb.period_start desc
   limit 1
) b on true;

comment on view time_entry_economics is
  'Per-entry revenue and base cost. base_cost is at the REGULAR rate: the overtime '
  'premium is a property of a week, not of an entry, and is added in '
  'employee_week_economics below. Summing base_cost alone understates cost in any '
  'week containing overtime.';

create or replace view employee_week_economics as
select
  w.clinic_id,
  w.employment_id,
  w.work_week_start,
  w.worked_hours,
  w.overtime_hours,
  w.billable_hours,
  coalesce(sum(t.revenue), 0) as revenue,
  coalesce(sum(t.base_cost), 0)
    -- The premium half of time-and-a-half on the overtime hours. Half rather
    -- than one and a half: the base hour is already counted above.
    + round(w.overtime_hours
            * coalesce(public.pay_rate_for(w.employment_id, w.work_week_start), 0) * 0.5
            * public.cost_multiplier_for(w.clinic_id, w.work_week_start), 2) as cost
from employee_work_weeks w
left join time_entry_economics t
  on t.employment_id = w.employment_id and t.work_week_start = w.work_week_start
group by w.clinic_id, w.employment_id, w.work_week_start,
         w.worked_hours, w.overtime_hours, w.billable_hours;

-- Minimum wage compliance, reported rather than enforced. Enforcement would
-- mean refusing to save a rate, and a platform that blocks a correction
-- because the correction is to a historical row helps nobody.
create or replace view pay_rate_compliance as
select
  r.id as pay_rate_id,
  r.clinic_id,
  r.employment_id,
  r.effective_from,
  case when r.basis = 'hourly' then r.amount
       else public.pay_rate_for(r.employment_id, r.effective_from) end as hourly_equivalent,
  m.hourly_rate as minimum_wage,
  case
    when m.hourly_rate is null then 'unknown'
    when coalesce(case when r.basis = 'hourly' then r.amount
                       else public.pay_rate_for(r.employment_id, r.effective_from) end, 0)
         >= m.hourly_rate then 'compliant'
    else 'below_minimum'
  end as status
from pay_rates r
left join minimum_wage_rates m
  on m.jurisdiction = 'CA-ON'
 and m.category = 'general'
 and m.effective_from <= r.effective_from
 and (m.effective_to is null or m.effective_to >= r.effective_from);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Pay rates are the most confidential thing in the schema. Own rate, or a
-- payroll action. Not HR: an HR administrator maintaining onboarding records
-- has no automatic business knowing what colleagues earn, and the two actions
-- are separate in 0023 precisely so this policy can say so.
-- ---------------------------------------------------------------------------
alter table billing_rates enable row level security;
alter table pay_rates enable row level security;
alter table employer_cost_loading enable row level security;
alter table minimum_wage_rates enable row level security;

drop policy if exists billing_rates_read on billing_rates;
create policy billing_rates_read on billing_rates for select
  using (clinic_id = public.auth_clinic_id()
         and (public.auth_can('finance.rate.write') or public.auth_can('finance.budget.read')));
drop policy if exists billing_rates_write on billing_rates;
create policy billing_rates_write on billing_rates for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));
drop policy if exists billing_rates_update on billing_rates;
create policy billing_rates_update on billing_rates for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));

drop policy if exists pay_rates_read on pay_rates;
create policy pay_rates_read on pay_rates for select
  using (
    clinic_id = public.auth_clinic_id()
    and (
      exists (select 1 from public.employment_records r
               where r.id = pay_rates.employment_id and r.user_id = auth.uid())
      or public.auth_can('finance.payroll.read')
    )
  );
drop policy if exists pay_rates_write on pay_rates;
create policy pay_rates_write on pay_rates for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));
drop policy if exists pay_rates_update on pay_rates;
create policy pay_rates_update on pay_rates for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));

drop policy if exists employer_cost_loading_read on employer_cost_loading;
create policy employer_cost_loading_read on employer_cost_loading for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.payroll.read'));
drop policy if exists employer_cost_loading_write on employer_cost_loading;
create policy employer_cost_loading_write on employer_cost_loading for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));
drop policy if exists employer_cost_loading_update on employer_cost_loading;
create policy employer_cost_loading_update on employer_cost_loading for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.rate.write'));

drop policy if exists minimum_wage_rates_read on minimum_wage_rates;
create policy minimum_wage_rates_read on minimum_wage_rates for select
  using (auth.uid() is not null);
