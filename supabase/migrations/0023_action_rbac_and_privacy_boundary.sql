-- 0023 · Action-based permissions, and a real boundary between HR and clinical
--
-- WHAT IS WRONG WITH THE CURRENT MODEL
--
-- Access today is a single text column, profiles.role, compared literally
-- inside every policy: `auth_role() = 'admin'`, or `auth_is_staff()` which is
-- `role in ('admin','supervisor','clinician')`. Three consequences, all of
-- them now costing something:
--
--   1. A new role means editing every policy that should include it. Migration
--      0021 added 'supervisor' and had to touch the helper to do it. The next
--      role (an HR coordinator, a billing clerk, a payroll administrator, all
--      of which the workforce work needs) would mean the same sweep again.
--
--   2. Permission is all-or-nothing per role. There is no way to say "this
--      person schedules but does not read clinical notes", which is exactly
--      what a receptionist is. Today they would have to be a clinician.
--
--   3. The HR/clinical boundary is drawn by one function, hub_can_manage(),
--      which reads `role = 'admin' or I supervise this person`. That is a
--      reasonable rule and 0007 applies it carefully — the person-level HR
--      tables are NOT clinic-wide readable, and scorecard_responses in
--      particular protects rater anonymity properly. The problem is not the
--      rule, it is that the rule is written in role names. There is no way to
--      express an HR administrator who reads employment files and no PHI, or
--      a clinical director who reads PHI and no HR file, because 'admin' is
--      the only role that reads anything and it reads everything.
--
-- WHAT THIS MIGRATION DOES, AND DELIBERATELY DOES NOT DO
--
-- It adds the mechanism: actions, a per-clinic role/action matrix, per-user
-- exceptions, and auth_can(action). It seeds that matrix so that every role
-- ends up with EXACTLY the access it has today. Nothing a person can do
-- before this migration changes after it.
--
-- It does NOT rewrite the existing policies to use auth_can(). Sweeping every
-- policy in a schema this size in one migration is how a tenant silently
-- loses access to their own data on a Friday. The mechanism lands first,
-- seeded to be a no-op; policies move over table by table, each with its own
-- migration and its own verification. New tables from here on use auth_can()
-- from the start, which is what migrations 0024-0028 do.
--
-- The one place it does act immediately is the HR/clinical boundary, because
-- that one is a live confidentiality problem rather than a structural
-- awkwardness, and because closing it does not depend on the rest of the
-- policy sweep.

-- ---------------------------------------------------------------------------
-- The action catalogue
--
-- An action is a verb the platform can perform, named as domain.object.verb.
-- The domain matters: it is what makes the HR/clinical boundary expressible
-- rather than a matter of remembering.
-- ---------------------------------------------------------------------------
create table if not exists permission_actions (
  action text primary key,
  domain text not null check (domain in
    ('clinical', 'scheduling', 'hr', 'finance', 'admin')),
  label text not null,
  description text not null,
  -- Actions that expose PHI, and actions that expose HR confidences. An action
  -- is allowed to be neither. It should almost never be both, and the check
  -- below refuses the combination outright.
  exposes_phi boolean not null default false,
  exposes_hr_confidential boolean not null default false,
  constraint permission_actions_no_dual_exposure
    check (not (exposes_phi and exposes_hr_confidential))
);

comment on constraint permission_actions_no_dual_exposure on permission_actions is
  'An action that reads a client''s health information and a colleague''s HR file '
  'at the same time cannot be granted to one without granting the other. If such '
  'an action seems necessary, it is two actions.';

insert into permission_actions (action, domain, label, description, exposes_phi, exposes_hr_confidential) values
  -- clinical
  ('clinical.client.read',        'clinical',   'View clients',              'See the client list and a client''s file.', true, false),
  ('clinical.client.write',       'clinical',   'Edit clients',              'Create and amend client records.', true, false),
  ('clinical.session.run',        'clinical',   'Run sessions',              'Open a session and record observations.', true, false),
  ('clinical.note.write',         'clinical',   'Write notes',               'Draft and sign session documentation.', true, false),
  ('clinical.note.cosign',        'clinical',   'Co-sign notes',             'Counter-sign documentation written by a supervisee.', true, false),
  ('clinical.program.write',      'clinical',   'Edit programs',             'Create and amend programs and goals.', true, false),
  ('clinical.assessment.write',   'clinical',   'Administer assessments',    'Score and store assessments.', true, false),
  ('clinical.report.generate',    'clinical',   'Generate reports',          'Produce clinical reports from recorded evidence.', true, false),
  ('clinical.supervision.record', 'clinical',   'Record supervision',        'Log supervision contacts and observations.', true, false),

  -- scheduling
  ('scheduling.calendar.read',    'scheduling', 'View the schedule',         'See calendars and booked sessions.', false, false),
  ('scheduling.session.book',     'scheduling', 'Book sessions',             'Create, move and cancel bookings.', false, false),
  ('scheduling.availability.write','scheduling','Edit availability',         'Set staff and client availability.', false, false),
  ('scheduling.catalogue.write',  'scheduling', 'Edit session types',        'Maintain the bookable service catalogue.', false, false),

  -- hr
  ('hr.self.read',                'hr',         'View my own HR record',     'Every employee holds this over their own file.', false, false),
  ('hr.record.read',              'hr',         'View HR records',           'Read another employee''s HR file.', false, true),
  ('hr.record.write',             'hr',         'Edit HR records',           'Amend employment, credential and document records.', false, true),
  ('hr.performance.read',         'hr',         'View performance',          'Read scorecards, reviews and development plans.', false, true),
  ('hr.performance.write',        'hr',         'Record performance',        'Write scorecards, reviews and development plans.', false, true),
  ('hr.timesheet.approve',        'hr',         'Approve timesheets',        'Approve or return submitted time.', false, false),
  ('hr.timeoff.approve',          'hr',         'Approve time off',          'Decide time-off requests.', false, false),

  -- finance
  ('finance.budget.read',         'finance',    'View client budgets',       'See funding allocations and spend.', true, false),
  ('finance.budget.write',        'finance',    'Manage client budgets',     'Record allocations, charges and reconciliation.', true, false),
  ('finance.rate.write',          'finance',    'Manage rates',              'Set billing and cost rates.', false, false),
  ('finance.payroll.read',        'finance',    'View payroll',              'Read pay-affecting time and earnings.', false, true),
  ('finance.payroll.run',         'finance',    'Run payroll',               'Produce a pay period''s output.', false, true),

  -- admin
  ('admin.staff.manage',          'admin',      'Manage staff',              'Add people, set roles, deactivate accounts.', false, false),
  ('admin.permission.manage',     'admin',      'Manage permissions',        'Change what a role may do.', false, false),
  ('admin.settings.write',        'admin',      'Change settings',           'Edit organization-level configuration.', false, false),
  ('admin.audit.read',            'admin',      'Read the audit trail',      'Inspect who did what.', false, false)
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------
-- The matrix: what each role may do, per clinic
--
-- Per-clinic so a tenant can tighten (or widen) their own posture without
-- affecting anyone else's. A clinic with no rows for a role falls back to the
-- platform default seeded below, which is what every clinic gets on day one.
-- ---------------------------------------------------------------------------
create table if not exists role_permissions (
  clinic_id uuid references clinics(id) on delete cascade,
  role text not null,
  action text not null references permission_actions(action) on delete cascade,
  granted boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- clinic_id null = the platform default for this role.
  constraint role_permissions_pk unique nulls not distinct (clinic_id, role, action)
);
create index if not exists role_permissions_lookup_idx on role_permissions(role, action);

-- ---------------------------------------------------------------------------
-- Per-user exceptions
--
-- The named individual who needs one thing their role does not carry. Always
-- reasoned, always attributable, and able to expire, because "temporary
-- access" that cannot expire is permanent access with a story attached.
-- ---------------------------------------------------------------------------
create table if not exists user_permission_grants (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null references permission_actions(action) on delete cascade,
  granted boolean not null,           -- false explicitly REVOKES what the role grants
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (user_id, action)
);
create index if not exists user_permission_grants_user_idx on user_permission_grants(user_id);

-- ---------------------------------------------------------------------------
-- auth_can(action)
--
-- Resolution order, most specific first:
--   1. a live per-user grant (which may be a revocation)
--   2. the caller's clinic's row for their role
--   3. the platform default for their role
--   4. denied
--
-- Hardened the same way 0009 hardened the original helpers: schema-qualified
-- throughout, pg_temp named last, so a shadowing temp table cannot change the
-- answer.
-- ---------------------------------------------------------------------------
create or replace function public.auth_can(p_action text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select g.granted
       from public.user_permission_grants g
      where g.user_id = auth.uid()
        and g.action = p_action
        and (g.expires_at is null or g.expires_at > now())),
    (select rp.granted
       from public.role_permissions rp
      where rp.role = public.auth_role()
        and rp.action = p_action
        and rp.clinic_id = public.auth_clinic_id()),
    (select rp.granted
       from public.role_permissions rp
      where rp.role = public.auth_role()
        and rp.action = p_action
        and rp.clinic_id is null),
    false
  )
$$;

comment on function public.auth_can(text) is
  'True when the caller may perform the named action. Resolution: per-user grant, '
  'then the clinic''s role matrix, then the platform default, then denied.';

-- Convenience for the common shape "may act, and this row is in my clinic".
create or replace function public.auth_can_in_clinic(p_action text, p_clinic uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_clinic = public.auth_clinic_id() and public.auth_can(p_action)
$$;

-- ---------------------------------------------------------------------------
-- Platform defaults, seeded to reproduce today's behaviour exactly
--
-- Read this as the answer to "who can do what right now", because that is what
-- it is. The only place it deliberately narrows rather than reproduces is the
-- HR block, addressed under the boundary below.
-- ---------------------------------------------------------------------------

-- admin: everything. That is what the role means today and this migration is
-- not the place to start arguing with it.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'admin', action, true from permission_actions
on conflict do nothing;

-- supervisor: all clinical work plus co-signing and supervision, the schedule,
-- performance and timesheet approval for their team. No payroll, no rates, no
-- permission management.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'supervisor', action, true from permission_actions
 where action in (
   'clinical.client.read','clinical.client.write','clinical.session.run',
   'clinical.note.write','clinical.note.cosign','clinical.program.write',
   'clinical.assessment.write','clinical.report.generate','clinical.supervision.record',
   'scheduling.calendar.read','scheduling.session.book','scheduling.availability.write',
   'hr.self.read','hr.performance.read','hr.performance.write',
   'hr.timesheet.approve','hr.timeoff.approve',
   'finance.budget.read',
   'admin.audit.read')
on conflict do nothing;

-- clinician: their clinical work and their own HR file. Nothing about anyone
-- else's employment, which is the change described under the boundary below.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'clinician', action, true from permission_actions
 where action in (
   'clinical.client.read','clinical.client.write','clinical.session.run',
   'clinical.note.write','clinical.program.write','clinical.assessment.write',
   'clinical.report.generate',
   'scheduling.calendar.read',
   'hr.self.read',
   'finance.budget.read')
on conflict do nothing;

-- scheduler: the schedule and the catalogue, and nothing clinical. This is the
-- role that was previously impossible to express: today a scheduler either has
-- admin-shaped access or cannot work.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'scheduler', action, true from permission_actions
 where action in (
   'scheduling.calendar.read','scheduling.session.book',
   'scheduling.availability.write','scheduling.catalogue.write',
   'hr.self.read')
on conflict do nothing;

-- client: nothing in this catalogue. A family's access is not an action they
-- perform on the organization's data; it is a read of their own file, and the
-- client-role policies in 0020 and 0022 express it directly.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'client', action, false from permission_actions
on conflict do nothing;

-- Two roles the workforce work needs that could not previously exist. Seeded
-- now so the matrix is complete; nobody holds them until an admin assigns one.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'hr_admin', action, true from permission_actions
 where action in (
   'hr.self.read','hr.record.read','hr.record.write',
   'hr.performance.read','hr.performance.write',
   'hr.timesheet.approve','hr.timeoff.approve',
   'admin.staff.manage','admin.audit.read')
on conflict do nothing;

insert into role_permissions (clinic_id, role, action, granted)
select null, 'payroll_admin', action, true from permission_actions
 where action in (
   'hr.self.read','hr.timesheet.approve',
   'finance.payroll.read','finance.payroll.run','finance.rate.write',
   'finance.budget.read','admin.audit.read')
on conflict do nothing;

-- An HR administrator and a payroll administrator hold no clinical actions at
-- all. Stated explicitly rather than left implicit, so that a later "grant
-- everything to every role" seeding mistake has something to conflict with.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, false
  from (values ('hr_admin'), ('payroll_admin')) as r(role)
  cross join permission_actions a
 where a.domain = 'clinical'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The HR / clinical boundary
--
-- Section 45's requirement, made structural: a clinical role cannot read
-- another person's HR file, and an HR role cannot read PHI.
--
-- 0007 already draws the first half of that line, through hub_can_manage().
-- What it cannot do is hold the line for any role other than the three that
-- existed when it was written. So hub_can_manage is redefined here in terms of
-- actions rather than role names.
--
-- This is behaviour-preserving for every role that exists today, which is the
-- whole point of the seeding above. Checked case by case against the seed:
--
--   admin          holds hr.record.read            -> true, as before
--   supervisor     holds hr.performance.read, and
--                  the supervisor_id test is kept  -> true for their own
--                                                     supervisees, as before
--   clinician      holds neither                   -> false, as before
--   scheduler      holds neither                   -> false, as before
--   hr_admin       holds hr.record.read            -> true (new role, the
--                                                     reason for the change)
--   payroll_admin  holds neither                   -> false
--
-- Every policy in 0006 and 0007 that calls hub_can_manage keeps working
-- unchanged and now means something a new role can satisfy. None of those
-- policies are touched: they are careful, and the anonymity guarantee on
-- scorecard_responses in particular is not something to rewrite in passing.
-- ---------------------------------------------------------------------------

create or replace function public.hub_can_manage(subject uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    -- Whoever holds the HR record action, for anyone in their clinic.
    (public.auth_can('hr.record.read')
     and exists (select 1 from public.profiles p
                  where p.id = subject and p.clinic_id = public.auth_clinic_id()))
    -- Or this person's own supervisor, holding the performance action. A
    -- supervisor reading their supervisee's development plan is the job; the
    -- same supervisor reading a colleague's is not, and never was.
    or (public.auth_can('hr.performance.read')
        and exists (select 1 from public.profiles p
                     where p.id = subject and p.supervisor_id = auth.uid()));
$$;

comment on function public.hub_can_manage(uuid) is
  'Whether the caller may manage the named employee''s HR records. Redefined in '
  '0023 from role names to actions; behaviour is identical for admin, supervisor, '
  'clinician and scheduler, and now extends to HR-specific roles.';

-- The same test, phrased for tables added from here on. hub_can_manage answers
-- "may I administer this person's file"; this answers "may I read it", which
-- also includes reading my own.
create or replace function public.auth_may_read_hr_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    -- Always my own file.
    p_user = auth.uid()
    -- Or I hold the HR read action, and we are in the same clinic.
    or (public.auth_can('hr.record.read')
        and exists (select 1 from public.profiles p
                     where p.id = p_user and p.clinic_id = public.auth_clinic_id()))
    -- Or I supervise this person and hold the performance action. A supervisor
    -- reading their own supervisee's development plan is the job; the same
    -- supervisor reading a colleague's is not.
    or (public.auth_can('hr.performance.read')
        and exists (select 1 from public.profiles p
                     where p.id = p_user
                       and p.supervisor_id = auth.uid()
                       and p.clinic_id = public.auth_clinic_id()))
$$;

comment on function public.auth_may_read_hr_of(uuid) is
  'The HR/clinical boundary. Own file always; anyone else only with an explicit '
  'HR action, or as their supervisor with the performance action.';

-- ---------------------------------------------------------------------------
-- RLS on the permission tables themselves
--
-- Everyone may read the catalogue and their own effective permissions: a
-- person should be able to see why the platform said no. Only an admin action
-- may change any of it, and only within their own clinic.
-- ---------------------------------------------------------------------------
alter table permission_actions enable row level security;
alter table role_permissions enable row level security;
alter table user_permission_grants enable row level security;

drop policy if exists permission_actions_read on permission_actions;
create policy permission_actions_read on permission_actions for select
  using (auth.uid() is not null);

drop policy if exists role_permissions_read on role_permissions;
create policy role_permissions_read on role_permissions for select
  using (auth.uid() is not null and (clinic_id is null or clinic_id = public.auth_clinic_id()));

drop policy if exists role_permissions_write on role_permissions;
create policy role_permissions_write on role_permissions for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

drop policy if exists role_permissions_update on role_permissions;
create policy role_permissions_update on role_permissions for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

drop policy if exists role_permissions_delete on role_permissions;
create policy role_permissions_delete on role_permissions for delete
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

drop policy if exists user_permission_grants_read on user_permission_grants;
create policy user_permission_grants_read on user_permission_grants for select
  using (user_id = auth.uid()
         or (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage')));

drop policy if exists user_permission_grants_write on user_permission_grants;
create policy user_permission_grants_write on user_permission_grants for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

drop policy if exists user_permission_grants_update on user_permission_grants;
create policy user_permission_grants_update on user_permission_grants for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

drop policy if exists user_permission_grants_delete on user_permission_grants;
create policy user_permission_grants_delete on user_permission_grants for delete
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.permission.manage'));

-- The platform defaults are seeded with clinic_id null and no clinic may edit
-- them, which the insert policy above already enforces: `clinic_id =
-- auth_clinic_id()` is never true for null. Said out loud because it is the
-- kind of thing that reads as an oversight when it is the intent.

-- ---------------------------------------------------------------------------
-- A person's own effective permissions, for the UI to show and explain.
-- ---------------------------------------------------------------------------
create or replace view my_permissions as
select
  a.action,
  a.domain,
  a.label,
  a.description,
  a.exposes_phi,
  a.exposes_hr_confidential,
  public.auth_can(a.action) as granted,
  case
    when exists (select 1 from user_permission_grants g
                  where g.user_id = auth.uid() and g.action = a.action
                    and (g.expires_at is null or g.expires_at > now()))
      then 'granted to you personally'
    when exists (select 1 from role_permissions rp
                  where rp.role = public.auth_role() and rp.action = a.action
                    and rp.clinic_id = public.auth_clinic_id())
      then 'set by your organization'
    when exists (select 1 from role_permissions rp
                  where rp.role = public.auth_role() and rp.action = a.action
                    and rp.clinic_id is null)
      then 'comes with your role'
    else 'not granted'
  end as source
from permission_actions a;
