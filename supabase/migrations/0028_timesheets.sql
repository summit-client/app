-- 0028 · Time entries, timesheets and the work week
--
-- THE SHAPE
--
--   work_week_config   the employer's declared 7-day week, per clinic
--   pay_periods        the payroll calendar
--   timesheets         one employee's one period, and its approval state
--   time_entries       the atoms: a date, an activity, a duration
--
-- Time entries are atomic and everything else is derived from them, the same
-- way session observations work in the clinical half of the platform. Hours
-- worked, overtime, utilization and payroll are all sums over entries. None of
-- them is a number anyone types.
--
-- THE WORK WEEK IS NOT THE PAY PERIOD
--
-- Ontario computes overtime over a WORK WEEK: a recurring period of seven
-- consecutive days that the employer establishes. Most payroll runs
-- bi-weekly or semi-monthly, and a semi-monthly period does not contain a
-- whole number of weeks at all.
--
-- Computing overtime over the pay period instead of the work week is the
-- classic Ontario payroll defect, and it is not a rounding error. A 60-hour
-- week followed by a 20-hour week is 16 hours of overtime, every time. Summed
-- over a bi-weekly period it is 80 hours and no overtime at all. The employee
-- is underpaid 16 hours at half time, the employer is liable for it, and
-- nothing in the totals looks wrong.
--
-- So the work week is declared per clinic, entries are attributed to work
-- weeks independently of which pay period they land in, and a work week
-- straddling two periods is handled by attributing each day to its own week.
--
-- WHAT IS DERIVED AND WHAT IS ENTERED
--
-- Entered:  the date, the activity, the duration, the client where relevant.
-- Derived:  which work week it belongs to, whether it is worked time, whether
--           it is productive, whether it is overtime, and at what multiplier.
--
-- An employee cannot select "overtime". Overtime is a fact about a week that
-- becomes true retroactively when the 45th hour is recorded, often days after
-- the hour that becomes premium was worked. Letting anyone pick it means the
-- record disagrees with the rule, and then there are two answers.

-- ---------------------------------------------------------------------------
-- The declared work week
-- ---------------------------------------------------------------------------
create table if not exists work_week_config (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  -- 0 = Sunday, matching extract(dow). The default is Sunday because that is
  -- the most common Ontario declaration, not because it is a rule.
  week_starts_dow smallint not null default 0 check (week_starts_dow between 0 and 6),
  overtime_threshold_hours numeric(5,2) not null default 44.00
    constraint work_week_overtime_threshold check (overtime_threshold_hours >= 44.00),
  -- Averaging agreements exist under the ESA but require the employee's
  -- written agreement and, for some, director approval. Not modelled: a flag
  -- that silently lowers someone's overtime is worse than no feature.
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on constraint work_week_overtime_threshold on work_week_config is
  'A clinic may set a threshold BELOW 44 only by paying overtime sooner, which is '
  'more generous and which this constraint currently forbids. Deliberate: the '
  'common failure is a threshold set too high, and until there is a real request '
  'for the generous case it is better to refuse both than to permit either.';

insert into work_week_config (clinic_id)
select id from clinics on conflict do nothing;

-- Which work week a date belongs to, given the clinic's declaration. One
-- function, so no caller can get it subtly different.
create or replace function public.work_week_start(p_clinic uuid, p_date date)
returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select p_date - ((extract(dow from p_date)::int
                    - coalesce((select week_starts_dow from public.work_week_config
                                 where clinic_id = p_clinic), 0)
                    + 7) % 7)
$$;

-- ---------------------------------------------------------------------------
-- Pay periods
-- ---------------------------------------------------------------------------
create table if not exists pay_periods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  pay_date date,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'LOCKED', 'EXPORTED')),
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint pay_periods_dates check (ends_on >= starts_on)
);
create index if not exists pay_periods_clinic_idx on pay_periods(clinic_id, starts_on desc);

-- Periods may not overlap. An hour that falls in two periods gets paid twice
-- or not at all, and which of the two is discovered later at random.
create extension if not exists btree_gist;
alter table pay_periods drop constraint if exists pay_periods_no_overlap;
alter table pay_periods add constraint pay_periods_no_overlap
  exclude using gist (clinic_id with =, daterange(starts_on, ends_on, '[]') with &&);

-- ---------------------------------------------------------------------------
-- Timesheets · one employee, one period
-- ---------------------------------------------------------------------------
create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  employment_id uuid not null references employment_records(id) on delete restrict,
  pay_period_id uuid not null references pay_periods(id) on delete restrict,

  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED')),

  submitted_at timestamptz,
  submitted_by uuid references auth.users(id),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  returned_at timestamptz,
  returned_by uuid references auth.users(id),
  return_reason text,

  created_at timestamptz not null default now(),

  unique (employment_id, pay_period_id),
  -- A return without a reason is a rejection the employee cannot act on.
  constraint timesheets_return_reason
    check (status <> 'RETURNED' or return_reason is not null)
);
create index if not exists timesheets_period_idx on timesheets(pay_period_id, status);

-- RETURNED goes back to DRAFT deliberately: the point of returning a sheet is
-- that the employee edits and resubmits it. Everything else is forward-only,
-- and APPROVED is terminal — a correction after approval is an adjusting entry
-- in the next period, not a rewrite of a period that has been paid.
create or replace function public.timesheet_status_transition() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = new.status then return new; end if;

  if not (
       (old.status = 'DRAFT'     and new.status = 'SUBMITTED')
    or (old.status = 'SUBMITTED' and new.status in ('APPROVED', 'RETURNED'))
    or (old.status = 'RETURNED'  and new.status = 'DRAFT')
  ) then
    raise exception 'A timesheet cannot go from % to %', old.status, new.status;
  end if;

  -- Nobody approves their own time. Not a matter of trust: an approval that
  -- can be self-granted is not a control, and every audit of a payroll system
  -- tests exactly this.
  if new.status = 'APPROVED' then
    if exists (select 1 from public.employment_records r
                where r.id = new.employment_id and r.user_id = auth.uid()) then
      raise exception 'A timesheet cannot be approved by the person it belongs to';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists timesheets_transition on timesheets;
create trigger timesheets_transition
  before update on timesheets
  for each row execute function public.timesheet_status_transition();

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  employment_id uuid not null references employment_records(id) on delete restrict,
  timesheet_id uuid references timesheets(id) on delete set null,

  work_date date not null,
  -- The work week this date falls in, stamped on write. Denormalized on
  -- purpose: it is the grouping key for every overtime calculation, and it
  -- must not change retroactively if a clinic later redeclares its week. A
  -- redeclaration applies going forward; hours already worked were worked in
  -- the week that was declared at the time.
  work_week_start date not null,

  activity_code_id uuid not null references activity_codes(id) on delete restrict,
  minutes integer not null check (minutes > 0 and minutes <= 1440),

  client_id bigint references clients(id) on delete set null,
  session_id bigint references sessions(id) on delete set null,

  -- Where the entry came from. Entries derived from a delivered session are
  -- not hand-typed, which is the point: the schedule already knows.
  source text not null default 'manual'
    check (source in ('manual', 'session', 'import', 'system')),

  note text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists time_entries_employment_date_idx
  on time_entries(employment_id, work_date);
create index if not exists time_entries_week_idx
  on time_entries(employment_id, work_week_start);
create index if not exists time_entries_timesheet_idx on time_entries(timesheet_id);
create unique index if not exists time_entries_one_per_session
  on time_entries(session_id) where session_id is not null;

-- Everything about an entry that can be checked, checked in one place.
create or replace function public.time_entries_validate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  a record;
  r record;
begin
  select requires_client, billable, clinic_id into a
    from public.activity_codes where id = new.activity_code_id;

  if a.requires_client and new.client_id is null then
    raise exception 'This activity has to name a client';
  end if;
  if not a.requires_client and new.client_id is not null then
    raise exception 'This activity is not recorded against a client';
  end if;
  if a.clinic_id is not null and a.clinic_id <> new.clinic_id then
    raise exception 'Activity code belongs to another clinic';
  end if;

  -- The entry must fall inside the employment it is attributed to. Recording
  -- hours for a period someone was not employed is how ghost payroll happens.
  select start_date, end_date, clinic_id into r
    from public.employment_records where id = new.employment_id;
  if new.clinic_id <> r.clinic_id then
    raise exception 'Time entry clinic does not match the employment record';
  end if;
  if new.work_date < r.start_date then
    raise exception 'Work date % is before employment began on %', new.work_date, r.start_date;
  end if;
  if r.end_date is not null and new.work_date > r.end_date then
    raise exception 'Work date % is after employment ended on %', new.work_date, r.end_date;
  end if;

  -- Always stamped by the database, never accepted from the client.
  new.work_week_start := public.work_week_start(new.clinic_id, new.work_date);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists time_entries_validate_trg on time_entries;
create trigger time_entries_validate_trg
  before insert or update on time_entries
  for each row execute function public.time_entries_validate();

-- Approved time is settled. Editing it changes a number someone has already
-- been paid against, silently and after the fact.
-- NEW and OLD are branched on TG_OP rather than coalesced. In a DELETE
-- trigger NEW is not assigned at all, and touching it raises "record new is
-- not assigned yet" — which would surface as a delete that always fails, for
-- a reason that has nothing to do with approval.
create or replace function public.time_entries_respect_approval() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  s text;
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.timesheet_id;
  else
    -- On an update, both the sheet it is leaving and the one it is joining
    -- have to be open. Otherwise an entry can be moved off an approved sheet,
    -- changing a total that has already been paid against.
    target := old.timesheet_id;
    if new.timesheet_id is distinct from old.timesheet_id then
      select status into s from public.timesheets where id = new.timesheet_id;
      if s in ('SUBMITTED', 'APPROVED') then
        raise exception 'That timesheet is % and cannot take new entries.', s;
      end if;
    end if;
  end if;

  if target is not null then
    select status into s from public.timesheets where id = target;
    if s in ('SUBMITTED', 'APPROVED') then
      raise exception
        'This time entry is on a % timesheet. Return the timesheet to amend it, or record an adjustment in the next period.', s;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists time_entries_approval_guard on time_entries;
create trigger time_entries_approval_guard
  before update or delete on time_entries
  for each row execute function public.time_entries_respect_approval();

-- ---------------------------------------------------------------------------
-- Derived: hours by work week, and the overtime split
--
-- The ESA calculation, in one view, so no report can implement it differently.
--
--   worked hours in the week   sum of entries whose activity counts as worked
--   overtime hours             the excess over the threshold
--   regular hours              the rest
--
-- Paid-but-not-worked time (vacation, holiday, sick) is excluded from the
-- threshold, which is correct: a 40-hour week plus an 8-hour holiday is not
-- 4 hours of overtime.
--
-- What this does NOT do, stated so nobody assumes it: it does not allocate
-- overtime to particular entries. An hour of overtime in a week where the
-- employee worked at two different rates has to be paid at a blended regular
-- rate under the ESA, and that blending needs the rates in 0029. This view
-- produces the HOURS; the money is computed there.
-- ---------------------------------------------------------------------------
create or replace view employee_work_weeks as
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
  bool_or(p.overtime_exempt)                                             as overtime_exempt
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
  'overtime_exempt is reported, not applied: an exempt position still has its '
  'excess hours shown, because a claimed exemption that turns out to be wrong '
  'is a liability that should be visible rather than a row that was never '
  'computed.';

-- Utilization, which is only meaningful against the position's scheduled
-- hours rather than against whatever was worked.
create or replace view employee_utilization as
select
  w.clinic_id,
  w.employment_id,
  w.work_week_start,
  w.worked_hours,
  w.productive_hours,
  w.billable_hours,
  round(c.standard_weekly_hours * c.fte, 2) as scheduled_hours,
  case when c.standard_weekly_hours * c.fte > 0
       then round(w.productive_hours / (c.standard_weekly_hours * c.fte) * 100, 1)
       else null end as utilization_percent
from employee_work_weeks w
left join current_employment c on c.employment_id = w.employment_id;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Own time always. Someone else's needs an approval action, and only for
-- people they actually approve for.
-- ---------------------------------------------------------------------------
alter table work_week_config enable row level security;
alter table pay_periods enable row level security;
alter table timesheets enable row level security;
alter table time_entries enable row level security;

drop policy if exists work_week_config_read on work_week_config;
create policy work_week_config_read on work_week_config for select
  using (clinic_id = public.auth_clinic_id());
drop policy if exists work_week_config_write on work_week_config;
create policy work_week_config_write on work_week_config for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists pay_periods_read on pay_periods;
create policy pay_periods_read on pay_periods for select
  using (clinic_id = public.auth_clinic_id());
drop policy if exists pay_periods_write on pay_periods;
create policy pay_periods_write on pay_periods for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.payroll.run'));
drop policy if exists pay_periods_update on pay_periods;
create policy pay_periods_update on pay_periods for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('finance.payroll.run'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('finance.payroll.run'));

-- Who may see a given employee's time.
create or replace function public.auth_may_see_time_of(p_employment uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.employment_records r
     where r.id = p_employment
       and r.clinic_id = public.auth_clinic_id()
       and (
         r.user_id = auth.uid()
         or public.auth_can('finance.payroll.read')
         or (public.auth_can('hr.timesheet.approve')
             and (public.auth_can('hr.record.read')
                  or exists (select 1 from public.profiles p
                              where p.id = r.user_id and p.supervisor_id = auth.uid())))
       )
  )
$$;

drop policy if exists timesheets_read on timesheets;
create policy timesheets_read on timesheets for select
  using (public.auth_may_see_time_of(employment_id));
drop policy if exists timesheets_write on timesheets;
create policy timesheets_write on timesheets for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_may_see_time_of(employment_id));
drop policy if exists timesheets_update on timesheets;
create policy timesheets_update on timesheets for update
  using (public.auth_may_see_time_of(employment_id))
  with check (public.auth_may_see_time_of(employment_id));

drop policy if exists time_entries_read on time_entries;
create policy time_entries_read on time_entries for select
  using (public.auth_may_see_time_of(employment_id));
drop policy if exists time_entries_write on time_entries;
create policy time_entries_write on time_entries for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_may_see_time_of(employment_id));
drop policy if exists time_entries_update on time_entries;
create policy time_entries_update on time_entries for update
  using (public.auth_may_see_time_of(employment_id))
  with check (public.auth_may_see_time_of(employment_id));
drop policy if exists time_entries_delete on time_entries;
create policy time_entries_delete on time_entries for delete
  using (public.auth_may_see_time_of(employment_id));

-- The approval trigger above is what stops an employee deleting their own
-- entry off a submitted sheet; RLS deliberately lets them delete a draft one,
-- because correcting your own draft is the normal case and forcing an
-- adjustment for it would make the whole thing unusable.
