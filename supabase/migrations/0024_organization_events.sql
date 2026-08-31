-- 0024 · The organization event stream
--
-- WHAT IT IS FOR
--
-- Summit already has three audit tables — clinical_audit_events (0001),
-- hub_audit_events (0006), hr_audit_log (0007) — plus provisioning_audit
-- (0017). Each records what happened inside one module, in its own shape, for
-- its own screen. None of them can answer a question that crosses a module,
-- and every question the workforce work asks crosses one:
--
--   when did this person's employment actually start, given that onboarding,
--   the first booked session and the first paid hour all disagree?
--
--   this credential expired on the 14th — what work was delivered under it
--   after that date, and who approved the timesheet containing it?
--
--   the schedule says 32 hours, the timesheet says 35, the budget was charged
--   for 31. Which of the three moved, when, and who moved it?
--
-- This table is the one place those are answerable. Modules keep their own
-- tables; they additionally emit here, and every derived view in 0025-0028
-- reads from here rather than from a status column somebody has to remember
-- to update.
--
-- WHAT IT IS NOT FOR
--
-- Section 54, stated as a schema rule rather than a promise: this is a record
-- of ORGANIZATIONAL FACTS, not of a person's activity. An event belongs here
-- when it is something the organization did or decided — a shift approved, a
-- credential lapsed, a rate changed, a plan signed. It does not belong here
-- when its only purpose is to observe an individual: page views, idle time,
-- keystrokes, location pings, time-to-first-click, "productivity" derived from
-- anything other than work actually delivered and recorded.
--
-- The distinction is not enforceable by a check constraint, so it is enforced
-- by the catalogue: event_type is a foreign key into a fixed, reviewed list.
-- Adding a new event type is a migration, which means it gets read by someone.
-- An event type whose purpose is surveillance should not survive that reading.

-- ---------------------------------------------------------------------------
-- The event catalogue
-- ---------------------------------------------------------------------------
create table if not exists organization_event_types (
  event_type text primary key,
  domain text not null check (domain in
    ('employment', 'credential', 'scheduling', 'time', 'payroll', 'finance',
     'clinical', 'learning', 'governance')),
  label text not null,
  description text not null,
  -- What kind of thing the event is about, so a reader can join without
  -- guessing. Matches subject_type on the event itself.
  subject_type text not null check (subject_type in
    ('employee', 'client', 'session', 'budget', 'timesheet', 'pay_period',
     'credential', 'organization')),
  -- Whether reading this event exposes PHI or an HR confidence. Drives RLS,
  -- and carries the same either-or rule as permission_actions.
  exposes_phi boolean not null default false,
  exposes_hr_confidential boolean not null default false,
  constraint organization_event_types_no_dual_exposure
    check (not (exposes_phi and exposes_hr_confidential))
);

insert into organization_event_types
  (event_type, domain, label, description, subject_type, exposes_phi, exposes_hr_confidential) values
  -- employment
  ('employment.hired',            'employment', 'Hired',                 'An employment record began.', 'employee', false, true),
  ('employment.position_changed', 'employment', 'Position changed',      'Title, FTE, employment type or supervisor changed.', 'employee', false, true),
  ('employment.leave_started',    'employment', 'Leave started',         'A leave of absence began.', 'employee', false, true),
  ('employment.leave_ended',      'employment', 'Leave ended',           'A leave of absence ended.', 'employee', false, true),
  ('employment.ended',            'employment', 'Employment ended',      'An employment record closed.', 'employee', false, true),

  -- credential
  ('credential.recorded',         'credential', 'Credential recorded',   'A credential and its number were entered.', 'credential', false, false),
  ('credential.renewed',          'credential', 'Credential renewed',    'A new cycle was recorded.', 'credential', false, false),
  ('credential.lapsed',           'credential', 'Credential lapsed',     'A cycle ended without renewal.', 'credential', false, false),
  ('credential.ceu_allocated',    'credential', 'CEU allocated',         'Professional development hours were applied to a requirement.', 'credential', false, false),

  -- scheduling
  ('scheduling.session_booked',   'scheduling', 'Session booked',        'A session was placed on a calendar.', 'session', true, false),
  ('scheduling.session_moved',    'scheduling', 'Session moved',         'A booked session changed time, staff or client.', 'session', true, false),
  ('scheduling.session_cancelled','scheduling', 'Session cancelled',     'A booked session was cancelled.', 'session', true, false),
  ('scheduling.session_delivered','scheduling', 'Session delivered',     'A session was completed and documented.', 'session', true, false),

  -- time
  ('time.entry_recorded',         'time',       'Time recorded',         'A time entry was created.', 'timesheet', false, false),
  ('time.entry_amended',          'time',       'Time amended',          'A time entry was changed before approval.', 'timesheet', false, false),
  ('time.submitted',              'time',       'Timesheet submitted',   'An employee submitted a period for approval.', 'timesheet', false, false),
  ('time.returned',               'time',       'Timesheet returned',    'An approver sent a period back with a reason.', 'timesheet', false, false),
  ('time.approved',               'time',       'Timesheet approved',    'An approver accepted a period.', 'timesheet', false, false),

  -- payroll
  ('payroll.period_opened',       'payroll',    'Pay period opened',     'A pay period began accepting time.', 'pay_period', false, false),
  ('payroll.period_locked',       'payroll',    'Pay period locked',     'A pay period stopped accepting time.', 'pay_period', false, false),
  ('payroll.exported',            'payroll',    'Payroll exported',      'A period''s output was produced for the payroll provider.', 'pay_period', false, true),

  -- finance
  ('finance.budget_opened',       'finance',    'Budget opened',         'A funding allocation was recorded.', 'budget', true, false),
  ('finance.budget_charged',      'finance',    'Budget charged',        'A charge was posted against a budget.', 'budget', true, false),
  ('finance.budget_reconciled',   'finance',    'Budget reconciled',     'Entries were reconciled against the funder''s records.', 'budget', true, false),
  ('finance.rate_changed',        'finance',    'Rate changed',          'A billing or cost rate was set or superseded.', 'organization', false, false),

  -- learning
  ('learning.module_completed',   'learning',   'Training completed',    'A training module was finished.', 'employee', false, false),
  ('learning.certificate_issued', 'learning',   'Certificate issued',    'A certificate was issued for completed work.', 'employee', false, false),

  -- governance
  ('governance.policy_published', 'governance', 'Policy published',      'A policy version was published.', 'organization', false, false),
  ('governance.policy_acknowledged','governance','Policy acknowledged',  'An employee acknowledged a policy version.', 'employee', false, false),
  ('governance.permission_changed','governance','Permission changed',    'A role''s or a person''s permissions were altered.', 'employee', false, false)
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------
-- The stream
-- ---------------------------------------------------------------------------
create table if not exists organization_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),

  event_type text not null references organization_event_types(event_type),

  -- occurred_at is when the thing happened in the world; recorded_at is when
  -- the platform heard about it. They differ whenever anything is entered
  -- late, which for timesheets and leave is most of the time. Deriving from
  -- the wrong one is the usual cause of a report that cannot be reproduced.
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),

  actor_id uuid references auth.users(id),   -- null: the platform itself acted
  subject_type text not null,
  subject_employee uuid references auth.users(id),
  subject_id text,                            -- the other subject kinds, as text

  payload jsonb not null default '{}'::jsonb,

  -- Ties together the events produced by one action across modules: a session
  -- delivered, the time entry it created and the budget charge it posted all
  -- share one.
  correlation_id uuid,
  source text not null default 'app'
    check (source in ('app', 'import', 'migration', 'integration', 'system'))
);

create index if not exists organization_events_clinic_time_idx
  on organization_events(clinic_id, occurred_at desc);
create index if not exists organization_events_employee_idx
  on organization_events(subject_employee, occurred_at desc);
create index if not exists organization_events_type_idx
  on organization_events(event_type, occurred_at desc);
create index if not exists organization_events_correlation_idx
  on organization_events(correlation_id);
create index if not exists organization_events_payload_idx
  on organization_events using gin (payload jsonb_path_ops);

-- subject_type has to agree with the catalogue, or a reader joining on it gets
-- rows that look like one kind of thing and are not.
create or replace function public.organization_events_check_subject() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  expected text;
begin
  select t.subject_type into expected
    from public.organization_event_types t
   where t.event_type = new.event_type;

  if expected is null then
    raise exception 'Unknown event type %', new.event_type;
  end if;
  if new.subject_type is distinct from expected then
    raise exception 'Event % is about a %, not a %', new.event_type, expected, new.subject_type;
  end if;
  if expected = 'employee' and new.subject_employee is null then
    raise exception 'Event % must name the employee it is about', new.event_type;
  end if;
  return new;
end $$;

drop trigger if exists organization_events_subject on organization_events;
create trigger organization_events_subject
  before insert on organization_events
  for each row execute function public.organization_events_check_subject();

-- Append-only, and meant it. A stream that can be edited is a table with
-- extra steps: every derivation built on it becomes unreproducible the first
-- time somebody quietly corrects a row. Corrections are made by appending a
-- correcting event.
create or replace function public.organization_events_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'organization_events is append-only. Record a correcting event instead of a % .', tg_op;
end $$;

drop trigger if exists organization_events_no_update on organization_events;
create trigger organization_events_no_update
  before update or delete on organization_events
  for each row execute function public.organization_events_append_only();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Reading an event is gated on the same exposure the event carries. PHI events
-- need a clinical read; HR-confidential events need the HR boundary; the rest
-- are visible to anyone in the clinic, which is what makes a shared operational
-- timeline possible without leaking either.
--
-- Everyone can always read events about themselves. A person is entitled to
-- see their own record, and a stream they cannot inspect is exactly the
-- surveillance apparatus this is not supposed to be.
-- ---------------------------------------------------------------------------
alter table organization_event_types enable row level security;
alter table organization_events enable row level security;

drop policy if exists organization_event_types_read on organization_event_types;
create policy organization_event_types_read on organization_event_types for select
  using (auth.uid() is not null);

drop policy if exists organization_events_read on organization_events;
create policy organization_events_read on organization_events for select
  using (
    clinic_id = public.auth_clinic_id()
    and (
      subject_employee = auth.uid()
      or exists (
        select 1 from public.organization_event_types t
         where t.event_type = organization_events.event_type
           and (case
                  when t.exposes_phi then public.auth_can('clinical.client.read')
                  when t.exposes_hr_confidential then
                    coalesce(public.auth_may_read_hr_of(organization_events.subject_employee), false)
                  else true
                end)
      )
    )
  );

-- Writes come from the app acting as the signed-in person. The actor must be
-- the caller: an event stream whose actor field can say anyone is worthless as
-- an audit trail. Server-side jobs write with the service role, which bypasses
-- RLS, and record source = 'system'.
drop policy if exists organization_events_write on organization_events;
create policy organization_events_write on organization_events for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and actor_id = auth.uid()
    and source = 'app'
  );

-- No update or delete policy at all, so neither is permitted for any
-- authenticated role even before the trigger refuses. Two layers, on purpose:
-- the trigger also stops the service role, which RLS does not.

-- ---------------------------------------------------------------------------
-- A person's own timeline, which every portal can show without special-casing
-- the exposure rules.
-- ---------------------------------------------------------------------------
create or replace view my_organization_timeline as
select
  e.id,
  e.occurred_at,
  e.recorded_at,
  e.event_type,
  t.domain,
  t.label,
  t.description,
  e.actor_id,
  e.payload,
  e.correlation_id
from organization_events e
join organization_event_types t on t.event_type = e.event_type
where e.subject_employee = auth.uid()
order by e.occurred_at desc;
