-- 0025 · The employment record
--
-- THE PROBLEM THIS SOLVES
--
-- A person who works here currently exists as up to three unlinked rows:
--
--   profiles              the identity — an auth user, a role, a supervisor
--   staff                 the schedulable resource — a name, a capacity, a
--                         set of specialties, a location
--   hub_employee_profiles the HR fields — employee number, job title, start
--                         date, police check status
--
-- Nothing joins staff to the other two. `staff.id` is a bigint the scheduler
-- generated; `profiles.id` is an auth uuid. A session's employee_id points at
-- the first; every HR, credential and training record points at the second.
-- The two are matched today by a human reading names off two screens.
--
-- Everything the workforce work needs crosses that gap. Hours worked come from
-- sessions (staff_id); the person to pay comes from HR (user_id). Utilization
-- is delivered hours over available hours: the numerator is keyed one way and
-- the denominator the other. Until one row says "this scheduler resource and
-- this login are the same employment", none of it can be computed rather than
-- assembled by hand.
--
-- WHAT THIS ADDS
--
-- One engagement per period of employment, and effective-dated positions
-- within it. Two levels rather than one because they answer different
-- questions, and flattening them loses one of the answers:
--
--   employment_records    was this person employed on 3 March, and for which
--                         stretch — survives a rehire as a second record
--   employment_positions  what were they employed AS on 3 March — title, FTE,
--                         supervisor, employment type, all effective-dated
--
-- A promotion is a new position, not an edit. The old row keeps its dates.
-- That is what makes "what was their FTE in the pay period we are now
-- correcting" answerable six months later, which is the whole reason payroll
-- reconstruction is possible at all.
--
-- WHAT IT DOES NOT ADD
--
-- No compensation. Not an oversight: pay rates live in 0028 with the rest of
-- the money, behind finance actions, so that the HR read which shows a title
-- and an FTE does not also show a salary. Someone who administers onboarding
-- has no business seeing what a colleague earns, and the cheapest way to
-- guarantee that is for the two never to sit in the same table.

-- ---------------------------------------------------------------------------
-- The engagement
-- ---------------------------------------------------------------------------
create table if not exists employment_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),

  -- The login. Required: an employment without an identity cannot hold
  -- credentials, acknowledge a policy or submit time.
  user_id uuid not null references auth.users(id) on delete restrict,

  -- The scheduler resource, where one exists. Nullable because plenty of
  -- employees are never booked (an administrator, a payroll clerk), and
  -- unique because one scheduler resource is one employment at a time.
  staff_id bigint references staff(id) on delete set null,

  employee_number text,

  start_date date not null,
  end_date date,                       -- null: currently employed
  end_reason text check (end_reason in
    ('resigned', 'ended_by_employer', 'contract_ended', 'retired',
     'transferred', 'other')),

  -- Ontario ESA: continuous service drives notice, severance and vacation
  -- entitlement, and it is NOT always the start date of this record. A rehire
  -- inside 13 weeks continues the prior service; a transfer between related
  -- employers carries service across. Recorded explicitly because deriving it
  -- from start_date silently gets long-service entitlements wrong.
  continuous_service_date date,

  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint employment_records_dates check (end_date is null or end_date >= start_date),
  constraint employment_records_end_reason
    check ((end_date is null) = (end_reason is null))
);

create unique index if not exists employment_records_staff_unique
  on employment_records(staff_id) where staff_id is not null and end_date is null;
create index if not exists employment_records_user_idx on employment_records(user_id, start_date desc);
create index if not exists employment_records_clinic_idx on employment_records(clinic_id, start_date desc);

comment on column employment_records.continuous_service_date is
  'ESA continuous service start, which may predate this record after a rehire '
  'or a transfer. Falls back to start_date when null.';

-- One open engagement per person. A second is a data-entry error, and finding
-- out at payroll time is finding out too late.
create unique index if not exists employment_records_one_open
  on employment_records(user_id) where end_date is null;

-- ---------------------------------------------------------------------------
-- Effective-dated positions
-- ---------------------------------------------------------------------------
create table if not exists employment_positions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  employment_id uuid not null references employment_records(id) on delete cascade,

  effective_from date not null,
  effective_to date,                   -- null: current

  position_title text not null,
  employment_type text not null check (employment_type in
    ('full_time', 'part_time', 'casual', 'contract', 'student', 'volunteer')),

  -- Scheduled hours per week at full engagement, and the fraction of it this
  -- position represents. Both, rather than one: FTE alone cannot produce a
  -- weekly hours figure without a full-time definition, and that definition
  -- differs by employer.
  standard_weekly_hours numeric(5,2) not null default 37.5
    check (standard_weekly_hours > 0 and standard_weekly_hours <= 80),
  fte numeric(4,3) not null default 1.000 check (fte > 0 and fte <= 1),

  -- Ontario ESA overtime exemptions are by DUTIES, not by title or salary.
  -- Recorded as a deliberate assertion with a reason, because the default
  -- assumption for anyone is that overtime applies, and an exemption claimed
  -- without a stated basis is the one an inspector asks about.
  overtime_exempt boolean not null default false,
  overtime_exempt_basis text,

  supervisor_user_id uuid references auth.users(id),
  location_id bigint references locations(id),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint employment_positions_dates
    check (effective_to is null or effective_to >= effective_from),
  constraint employment_positions_exempt_basis
    check (not overtime_exempt or overtime_exempt_basis is not null)
);

create index if not exists employment_positions_employment_idx
  on employment_positions(employment_id, effective_from desc);

-- No two positions on one engagement may overlap in time. Enforced by the
-- database rather than the application: an overlap means a person has two FTEs
-- on one day, and every hours calculation downstream then silently doubles.
create extension if not exists btree_gist;
alter table employment_positions
  drop constraint if exists employment_positions_no_overlap;
alter table employment_positions
  add constraint employment_positions_no_overlap
  exclude using gist (
    employment_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  );

-- A position cannot sit outside the engagement that owns it.
create or replace function public.employment_positions_within_record() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  r record;
begin
  select start_date, end_date, clinic_id into r
    from public.employment_records where id = new.employment_id;

  if new.clinic_id is distinct from r.clinic_id then
    raise exception 'Position clinic does not match the employment record''s clinic';
  end if;
  if new.effective_from < r.start_date then
    raise exception 'Position starts % , before employment began on %',
      new.effective_from, r.start_date;
  end if;
  if r.end_date is not null and (new.effective_to is null or new.effective_to > r.end_date) then
    raise exception 'Position runs past the end of employment on %', r.end_date;
  end if;
  return new;
end $$;

drop trigger if exists employment_positions_bounds on employment_positions;
create trigger employment_positions_bounds
  before insert or update on employment_positions
  for each row execute function public.employment_positions_within_record();

-- ---------------------------------------------------------------------------
-- Leave
--
-- Distinct from time off in 0006: that is a request-and-approval workflow for
-- days away. This is a period during which the employment continues but work
-- does not — parental leave, sick leave, a job-protected ESA leave. It changes
-- what "available hours" means, so utilization and payroll both need it, and
-- neither can read it off a time-off request.
-- ---------------------------------------------------------------------------
create table if not exists employment_leaves (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  employment_id uuid not null references employment_records(id) on delete cascade,

  leave_type text not null check (leave_type in
    ('parental', 'pregnancy', 'sick', 'family_responsibility', 'family_caregiver',
     'family_medical', 'bereavement', 'domestic_violence', 'reservist',
     'declared_emergency', 'unpaid_personal', 'other')),
  starts_on date not null,
  ends_on date,                        -- null: open-ended
  expected_return_on date,

  -- Whether this leave counts as continuous service. Under the ESA most
  -- job-protected leaves do. Recorded rather than assumed because the answer
  -- changes an entitlement calculation years later.
  counts_as_service boolean not null default true,

  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint employment_leaves_dates check (ends_on is null or ends_on >= starts_on)
);
create index if not exists employment_leaves_employment_idx
  on employment_leaves(employment_id, starts_on desc);

-- ---------------------------------------------------------------------------
-- Derived views
--
-- Current employment is derived, never stored. A stored "is_active" flag is a
-- second source of truth that goes stale the day someone's last shift moves.
-- ---------------------------------------------------------------------------
create or replace view current_employment as
select
  r.id                as employment_id,
  r.clinic_id,
  r.user_id,
  r.staff_id,
  r.employee_number,
  r.start_date,
  coalesce(r.continuous_service_date, r.start_date) as service_date,
  p.id                as position_id,
  p.position_title,
  p.employment_type,
  p.standard_weekly_hours,
  p.fte,
  round(p.standard_weekly_hours * p.fte, 2) as scheduled_weekly_hours,
  p.overtime_exempt,
  p.supervisor_user_id,
  p.location_id,
  exists (
    select 1 from employment_leaves l
     where l.employment_id = r.id
       and l.starts_on <= current_date
       and (l.ends_on is null or l.ends_on >= current_date)
  ) as on_leave
from employment_records r
left join employment_positions p
  on p.employment_id = r.id
 and p.effective_from <= current_date
 and (p.effective_to is null or p.effective_to >= current_date)
where r.end_date is null;

-- The lookup the rest of the platform actually needs: given a scheduler staff
-- id, who is this as a login, and the reverse. Every hours, utilization and
-- payroll query in 0026-0028 goes through here rather than matching on names.
create or replace view employment_identity as
select
  r.clinic_id,
  r.user_id,
  r.staff_id,
  r.id as employment_id,
  r.start_date,
  r.end_date,
  s.name as scheduler_name,
  pr.full_name as profile_name
from employment_records r
left join staff s on s.id = r.staff_id
left join profiles pr on pr.id = r.user_id;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Own record always readable. Anyone else's needs the HR boundary from 0023.
-- Writes need hr.record.write, which no clinical role holds.
-- ---------------------------------------------------------------------------
alter table employment_records enable row level security;
alter table employment_positions enable row level security;
alter table employment_leaves enable row level security;

drop policy if exists employment_records_read on employment_records;
create policy employment_records_read on employment_records for select
  using (clinic_id = public.auth_clinic_id() and public.auth_may_read_hr_of(user_id));

drop policy if exists employment_records_write on employment_records;
create policy employment_records_write on employment_records for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('hr.record.write'));

drop policy if exists employment_records_update on employment_records;
create policy employment_records_update on employment_records for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('hr.record.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('hr.record.write'));

do $$
declare t text;
begin
  foreach t in array array['employment_positions', 'employment_leaves'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using ('
      '  clinic_id = public.auth_clinic_id() and exists ('
      '    select 1 from public.employment_records r'
      '     where r.id = %I.employment_id'
      '       and public.auth_may_read_hr_of(r.user_id)))', t, t, t);

    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for insert with check ('
      '  clinic_id = public.auth_clinic_id() and public.auth_can(''hr.record.write''))', t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update using ('
      '  clinic_id = public.auth_clinic_id() and public.auth_can(''hr.record.write'')) '
      'with check (clinic_id = public.auth_clinic_id() and public.auth_can(''hr.record.write''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill
--
-- hub_employee_profiles already holds a start date and a job title for the
-- people who have one. Those become the first engagement and its first
-- position, so the live tenant is not asked to re-enter what it already told
-- the platform.
--
-- staff_id is left null by this backfill. Matching a scheduler resource to a
-- login is the one thing nothing in the database can currently do — that is
-- the gap this migration exists to close, not one it can close by guessing.
-- Names are not unique, not always spelled the same in both systems, and a
-- wrong match silently pays one person for another's hours. It has to be done
-- once, deliberately, by someone who knows the roster, against a screen that
-- shows both rosters side by side and refuses a match already claimed.
-- ---------------------------------------------------------------------------
insert into employment_records (clinic_id, user_id, employee_number, start_date, created_at)
select h.clinic_id, h.user_id, h.employee_number, h.start_date, now()
  from hub_employee_profiles h
 where h.start_date is not null
   and h.clinic_id is not null
   and not exists (select 1 from employment_records r where r.user_id = h.user_id)
on conflict do nothing;

insert into employment_positions
  (clinic_id, employment_id, effective_from, position_title, employment_type, created_at)
select r.clinic_id, r.id, r.start_date,
       coalesce(h.job_title, 'Not recorded'),
       'full_time',
       now()
  from employment_records r
  join hub_employee_profiles h on h.user_id = r.user_id
 where not exists (select 1 from employment_positions p where p.employment_id = r.id)
on conflict do nothing;

-- The backfill asserts full_time for everyone, because hub_employee_profiles
-- does not record employment type and there is nothing to derive it from.
-- That is wrong for every part-time and casual employee on the roster and it
-- will produce wrong overtime thresholds and wrong utilization denominators
-- until it is corrected. It is written this way rather than left null because
-- the column has to be non-null for the constraint to mean anything; the
-- honest reading is that these rows are placeholders awaiting a pass by
-- someone who knows the roster, not data.
