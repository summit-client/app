-- 0026 · Activity codes and pay codes
--
-- THE TWO VOCABULARIES, AND WHY THEY ARE TWO
--
-- Every hour an employee works has two independent descriptions:
--
--   WHAT was done          direct therapy, supervision, note writing, travel,
--                          a team meeting, a training module
--   HOW it is paid         regular, overtime, statutory holiday, on-call,
--                          paid leave, unpaid
--
-- These are routinely collapsed into one list, and collapsing them is the
-- single most common reason a workforce system cannot answer either question.
-- "Direct therapy" is not a pay rate: the same hour is regular time in week
-- one and overtime in week two, and the difference is a fact about the week,
-- not about the work. "Overtime" is not an activity: it says nothing about
-- what the person was doing, so nothing billable can be derived from it.
--
-- Keeping them separate is what lets one time entry carry both, and lets the
-- two be resolved by different rules — an activity code is chosen by the
-- person recording the work, a pay code is DERIVED by the ESA rules in 0027
-- and is not the employee's to pick.
--
-- BILLABILITY IS AN ACTIVITY PROPERTY, NOT A PAY PROPERTY
--
-- Whether an hour can be charged to a client's funding is a fact about what
-- was done and for whom. It has nothing to do with how the employee is paid
-- for it: a clinician earning overtime for a direct session is still
-- delivering a billable hour at the ordinary rate to the funder. Charging a
-- funder more because a staffing decision put someone into overtime is a
-- billing error, and separating the two vocabularies is what makes it hard to
-- commit by accident.

-- ---------------------------------------------------------------------------
-- Activity codes · what was done
-- ---------------------------------------------------------------------------
create table if not exists activity_codes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id) on delete cascade,  -- null: platform default

  code text not null,
  label text not null,
  description text,

  category text not null check (category in
    ('direct_service', 'indirect_service', 'supervision', 'documentation',
     'travel', 'administration', 'training', 'non_worked')),

  -- Billable to a client's funding. When true, a time entry using this code
  -- must name a client; when false, naming one is meaningless. Enforced on
  -- the time entry in 0027.
  billable boolean not null default false,
  requires_client boolean not null default false,

  -- Counts toward "worked time" for ESA hours-of-work and overtime purposes.
  -- Paid leave and holiday pay are paid but not worked, and including them in
  -- an overtime threshold overstates it.
  counts_as_worked boolean not null default true,

  -- Counts toward the utilization numerator. Direct service does; travel and
  -- documentation are real work and do not, which is why a utilization target
  -- expressed against total hours is meaningless.
  counts_as_productive boolean not null default false,

  active boolean not null default true,
  sort_order integer not null default 100,

  constraint activity_codes_billable_needs_client
    check (not billable or requires_client),
  unique nulls not distinct (clinic_id, code)
);

comment on constraint activity_codes_billable_needs_client on activity_codes is
  'A billable activity must name the client being billed. Anything else produces '
  'a charge with nobody to charge it to.';

insert into activity_codes
  (clinic_id, code, label, description, category, billable, requires_client, counts_as_worked, counts_as_productive, sort_order) values
  (null, 'DIRECT',      'Direct therapy',        'Face-to-face or telehealth service delivered to a client.', 'direct_service',   true,  true,  true,  true,  10),
  (null, 'ASSESS',      'Assessment',            'Administering, scoring or interpreting an assessment.', 'direct_service',   true,  true,  true,  true,  20),
  (null, 'PARENT',      'Caregiver session',     'Caregiver training, coaching or a team meeting with the family.', 'direct_service',   true,  true,  true,  true,  30),
  (null, 'CONSULT',     'Consultation',          'Consultation with a school, physician or another provider about a client.', 'indirect_service', true,  true,  true,  true,  40),
  (null, 'PROGRAM',     'Program development',   'Writing or revising programs, materials and data sheets for a client.', 'indirect_service', true,  true,  true,  false, 50),
  (null, 'NOTES',       'Documentation',         'Session notes, reports and other clinical writing.', 'documentation',    false, false, true,  false, 60),
  (null, 'SUPERV_RECV', 'Supervision received',  'Being supervised, including fieldwork supervision hours.', 'supervision',      false, false, true,  false, 70),
  (null, 'SUPERV_GIVE', 'Supervision provided',  'Supervising another clinician.', 'supervision',      false, false, true,  false, 80),
  (null, 'TRAVEL',      'Travel',                'Travel between service locations during the working day.', 'travel',           false, false, true,  false, 90),
  (null, 'MEETING',     'Team meeting',          'Internal meetings not about a single client.', 'administration',   false, false, true,  false, 100),
  (null, 'ADMIN',       'Administration',        'Scheduling, email, and other general administrative work.', 'administration',   false, false, true,  false, 110),
  (null, 'TRAINING',    'Training',              'Completing training or professional development.', 'training',         false, false, true,  false, 120),
  (null, 'CANCEL',      'Late cancellation',     'A booked session the client did not attend, where the time was held.', 'indirect_service', false, true,  true,  false, 130),
  (null, 'PAID_LEAVE',  'Paid leave',            'Vacation, sick or other paid time away.', 'non_worked',       false, false, false, false, 140),
  (null, 'HOLIDAY',     'Public holiday',        'A public holiday under the ESA.', 'non_worked',       false, false, false, false, 150),
  (null, 'UNPAID',      'Unpaid leave',          'Time away without pay.', 'non_worked',       false, false, false, false, 160)
on conflict do nothing;

-- Which activity a session type produces, so time recorded from a delivered
-- session gets its code without anyone choosing one. Per clinic, because the
-- session catalogue is per clinic.
create table if not exists session_type_activity_map (
  clinic_id uuid not null references clinics(id) on delete cascade,
  session_type_id bigint not null references session_types(id) on delete cascade,
  activity_code_id uuid not null references activity_codes(id) on delete restrict,
  primary key (clinic_id, session_type_id)
);

-- ---------------------------------------------------------------------------
-- Pay codes · how it is paid
--
-- The multiplier is against the employee's regular rate. Ontario ESA sets the
-- floors used as defaults here: overtime at 1.5x after 44 hours in a work
-- week, public holiday premium at 1.5x for work performed on a public holiday
-- the employee is also being paid holiday pay for. An employer may pay more
-- and some do; none may pay less, which is what the check enforces.
-- ---------------------------------------------------------------------------
create table if not exists pay_codes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id) on delete cascade,  -- null: platform default

  code text not null,
  label text not null,
  description text,

  kind text not null check (kind in
    ('regular', 'overtime', 'premium', 'holiday', 'leave_paid', 'leave_unpaid',
     'on_call', 'stat_holiday_pay')),

  multiplier numeric(4,2) not null default 1.00 check (multiplier >= 0),

  -- Whether the hours under this code count toward the overtime threshold.
  -- Overtime hours themselves must not, or the threshold compounds.
  counts_toward_overtime boolean not null default true,

  -- Whether it is paid at all. Unpaid leave exists as a code so that absence
  -- is recorded rather than missing, which is the difference between "did not
  -- work" and "we have no record".
  paid boolean not null default true,

  -- The ESA floor for this kind, where one exists. A clinic may set its own
  -- multiplier at or above it and never below.
  statutory_minimum_multiplier numeric(4,2),

  active boolean not null default true,
  sort_order integer not null default 100,

  constraint pay_codes_meets_statutory_minimum
    check (statutory_minimum_multiplier is null or multiplier >= statutory_minimum_multiplier),
  constraint pay_codes_unpaid_has_no_multiplier
    check (paid or multiplier = 0),
  unique nulls not distinct (clinic_id, code)
);

comment on constraint pay_codes_meets_statutory_minimum on pay_codes is
  'A clinic may pay above the ESA floor and never below it. This is the last '
  'place a wrong number can be stopped before it reaches someone''s pay.';

insert into pay_codes
  (clinic_id, code, label, description, kind, multiplier, counts_toward_overtime, paid, statutory_minimum_multiplier, sort_order) values
  (null, 'REG',      'Regular',              'Ordinary hours at the regular rate.', 'regular',          1.00, true,  true,  null, 10),
  (null, 'OT',       'Overtime',             'Hours beyond 44 in a work week, at time and a half.', 'overtime',         1.50, false, true,  1.50, 20),
  (null, 'STAT_PAY', 'Public holiday pay',   'Public holiday pay, calculated from the prior four work weeks.', 'stat_holiday_pay', 1.00, false, true,  null, 30),
  (null, 'STAT_PRM', 'Public holiday premium','Work performed on a public holiday, at premium pay.', 'holiday',          1.50, false, true,  1.50, 40),
  (null, 'VAC',      'Vacation pay',         'Paid vacation time.', 'leave_paid',       1.00, false, true,  null, 50),
  (null, 'SICK',     'Paid sick leave',      'Paid time away for illness.', 'leave_paid',       1.00, false, true,  null, 60),
  (null, 'BEREAVE',  'Bereavement',          'Paid bereavement leave, where the employer provides it.', 'leave_paid',       1.00, false, true,  null, 70),
  (null, 'ONCALL',   'On call',              'Available but not working, at the on-call rate.', 'on_call',          0.25, false, true,  null, 80),
  (null, 'UNPAID',   'Unpaid',               'Time away without pay.', 'leave_unpaid',     0.00, false, false, null, 90)
on conflict do nothing;

comment on column pay_codes.multiplier is
  'Against the employee''s regular rate. ONCALL defaults to 0.25 as a placeholder '
  'only: Ontario has no statutory on-call rate, so this number is whatever the '
  'employer''s own policy says and must be set deliberately before it is used. '
  'Three-hour-rule obligations for a shortened shift are not modelled here.';

-- ---------------------------------------------------------------------------
-- Ontario public holidays
--
-- Needed as data because holiday pay and premium pay both key off a date, and
-- because the dates move each year. Seeded through 2027 so nothing depends on
-- someone remembering in January; anything past that fails visibly (no rows)
-- rather than quietly paying regular time on a statutory holiday.
--
-- Ontario has nine public holidays under the ESA. Not included, deliberately:
-- Easter Monday, Remembrance Day, Civic Holiday and the National Day for Truth
-- and Reconciliation are NOT ESA public holidays in Ontario, however widely
-- they are observed. An employer that gives them contractually should add rows
-- with statutory = false rather than have the platform assert an entitlement
-- the ESA does not create.
-- ---------------------------------------------------------------------------
create table if not exists public_holidays (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id) on delete cascade,   -- null: jurisdiction-wide
  jurisdiction text not null default 'CA-ON',
  holiday_date date not null,
  name text not null,
  statutory boolean not null default true,
  unique nulls not distinct (clinic_id, jurisdiction, holiday_date)
);

insert into public_holidays (clinic_id, jurisdiction, holiday_date, name, statutory) values
  (null, 'CA-ON', '2026-01-01', 'New Year''s Day', true),
  (null, 'CA-ON', '2026-02-16', 'Family Day', true),
  (null, 'CA-ON', '2026-04-03', 'Good Friday', true),
  (null, 'CA-ON', '2026-05-18', 'Victoria Day', true),
  (null, 'CA-ON', '2026-07-01', 'Canada Day', true),
  (null, 'CA-ON', '2026-09-07', 'Labour Day', true),
  (null, 'CA-ON', '2026-10-12', 'Thanksgiving Day', true),
  (null, 'CA-ON', '2026-12-25', 'Christmas Day', true),
  (null, 'CA-ON', '2026-12-26', 'Boxing Day', true),
  (null, 'CA-ON', '2027-01-01', 'New Year''s Day', true),
  (null, 'CA-ON', '2027-02-15', 'Family Day', true),
  (null, 'CA-ON', '2027-03-26', 'Good Friday', true),
  (null, 'CA-ON', '2027-05-24', 'Victoria Day', true),
  (null, 'CA-ON', '2027-07-01', 'Canada Day', true),
  (null, 'CA-ON', '2027-09-06', 'Labour Day', true),
  (null, 'CA-ON', '2027-10-11', 'Thanksgiving Day', true),
  (null, 'CA-ON', '2027-12-25', 'Christmas Day', true),
  (null, 'CA-ON', '2027-12-27', 'Boxing Day', true)
on conflict do nothing;

comment on table public_holidays is
  'Ontario ESA public holidays. 2026 and 2027 seeded. Boxing Day 2027 falls on a '
  'Sunday and is listed as the 27th, which is when it is observed; verify against '
  'the year''s official listing before relying on it for pay.';

-- ---------------------------------------------------------------------------
-- RLS
--
-- Codes are organizational vocabulary, not confidential: anyone recording time
-- has to be able to read them. Writing them is a settings action.
-- ---------------------------------------------------------------------------
alter table activity_codes enable row level security;
alter table pay_codes enable row level security;
alter table public_holidays enable row level security;
alter table session_type_activity_map enable row level security;

do $$
declare t text;
begin
  foreach t in array array['activity_codes', 'pay_codes', 'public_holidays'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using ('
      '  auth.uid() is not null and (clinic_id is null or clinic_id = public.auth_clinic_id()))', t, t);

    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for insert with check ('
      '  clinic_id = public.auth_clinic_id() and public.auth_can(''admin.settings.write''))', t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update using ('
      '  clinic_id = public.auth_clinic_id() and public.auth_can(''admin.settings.write'')) '
      'with check (clinic_id = public.auth_clinic_id() and public.auth_can(''admin.settings.write''))', t, t);
  end loop;
end $$;

drop policy if exists session_type_activity_map_read on session_type_activity_map;
create policy session_type_activity_map_read on session_type_activity_map for select
  using (clinic_id = public.auth_clinic_id());

drop policy if exists session_type_activity_map_write on session_type_activity_map;
create policy session_type_activity_map_write on session_type_activity_map for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists session_type_activity_map_update on session_type_activity_map;
create policy session_type_activity_map_update on session_type_activity_map for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

-- Platform defaults carry clinic_id null and no clinic may edit them: the
-- insert policy's `clinic_id = auth_clinic_id()` is never true for null. A
-- clinic that wants different behaviour adds its own row with the same code,
-- which the unique constraint permits because it is scoped by clinic.
