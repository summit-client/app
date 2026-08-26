-- 0007 · My HR / My Documents
--
-- Ecosystem Tracker, credential compliance, recognition, goals, policies and
-- team collaboration. Extends the existing Summit tenancy model: every table
-- carries clinic_id and is governed by the same RLS helpers, and identity comes
-- from profiles (role and supervisor_id) rather than a parallel user table.
--
-- Regulatory rules are DATA, never constants in code. Rule versions are
-- date-aware and carry their source status so a seeded rule can be marked
-- REQUIRES_ADMINISTRATOR_VERIFICATION until the official handbook is attached.

/* ---- credential rule engine ------------------------------------------------ */

create table if not exists credential_rule_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),          -- null: platform default available to every tenant
  credential text not null,
  issuer text not null,
  label text not null,
  version text not null,
  effective_date date not null,
  end_date date,
  cycle_years integer not null default 2,
  total_required numeric not null,
  unit text not null check (unit in ('CEU', 'PDU', 'CPD_HOUR')),
  categories jsonb not null default '[]'::jsonb,  -- [{category, minimum, conditional, withinTotal}]
  notes jsonb not null default '[]'::jsonb,
  source_status text not null default 'REQUIRES_ADMINISTRATOR_VERIFICATION'
    check (source_status in ('VERIFIED', 'REQUIRES_ADMINISTRATOR_VERIFICATION')),
  source_document text,
  source_url text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, credential, version)
);

-- Proposed rule changes from an uploaded regulatory PDF. An administrator
-- reviews and approves; nothing here becomes active on its own.
create table if not exists credential_rule_proposals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  credential text not null,
  proposed jsonb not null,
  existing jsonb,
  source_document text not null,
  confidence text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists employee_credentials (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential text not null,
  credential_number text,
  cycle_start date not null,
  cycle_end date not null,
  status text not null default 'GOOD_STANDING' check (status in ('GOOD_STANDING', 'PENDING', 'LAPSED')),
  supervisor_status boolean not null default false,   -- provides qualifying supervision
  created_at timestamptz not null default now()
);

-- The universal professional development record: one activity, stored once.
create table if not exists pd_activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  provider text,
  instructor text,
  completion_date date not null,
  duration_hours numeric not null check (duration_hours > 0),  -- unique hours, never inflated
  format text,
  categories jsonb not null default '[]'::jsonb,
  ace_provider text,
  course_number text,
  certificate_file text,
  extracted jsonb,                                   -- what the reader found, for review before saving
  verification text not null default 'VERIFICATION_REQUIRED'
    check (verification in ('VERIFIED', 'VERIFICATION_REQUIRED')),
  verified_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

-- Credential-specific allocation of one activity. amount <= activity hours is
-- enforced by trigger; category overlap is permitted only where the credential
-- rule allows it (CPBAO), which the application layer validates.
create table if not exists pd_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  activity_id uuid not null references pd_activities(id) on delete cascade,
  employee_credential_id uuid not null references employee_credentials(id) on delete cascade,
  amount numeric not null check (amount > 0),
  by_category jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (activity_id, employee_credential_id)
);

create or replace function forbid_over_allocation() returns trigger
language plpgsql as $$
declare hours numeric;
begin
  select duration_hours into hours from pd_activities where id = new.activity_id;
  if new.amount > hours then
    raise exception 'Allocation (%) exceeds the activity''s % unique hours.', new.amount, hours;
  end if;
  return new;
end $$;
drop trigger if exists pd_alloc_guard on pd_credit_allocations;
create trigger pd_alloc_guard before insert or update on pd_credit_allocations
  for each row execute function forbid_over_allocation();

/* ---- Ecosystem Tracker ------------------------------------------------------ */

create table if not exists scorecard_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  metric_key text not null,
  domain text not null,
  behaviour text not null,                          -- observable behaviour, never a trait
  source text not null check (source in ('SELF', 'PEER', 'SUPERVISOR', 'OBJECTIVE', 'PD', 'COMPLIANCE')),
  weight numeric not null default 1,
  applies_to_roles jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  unique (clinic_id, metric_key)
);

create table if not exists scorecard_cycles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle text not null,                              -- YYYY-MM
  score numeric,
  breakdown jsonb,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  closed_at timestamptz,
  unique (user_id, cycle)
);

create table if not exists scorecard_responses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  cycle_id uuid not null references scorecard_cycles(id) on delete cascade,
  metric_key text not null,
  source text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  rater uuid references auth.users(id),             -- null for objective sources
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists recognitions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  category text not null,
  points integer not null check (points > 0),
  message text not null,
  flagged text,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)                      -- no self-recognition, enforced by the database
);

create table if not exists bonus_results (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle text not null,
  status text not null check (status in ('QUALIFIED', 'NOT_QUALIFIED', 'PENDING', 'NOT_ENABLED')),
  reasons jsonb not null default '[]'::jsonb,       -- every line explained, no black box
  computed_at timestamptz not null default now(),
  unique (user_id, cycle)
);

create table if not exists development_goals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  behaviour text not null,
  target text,
  measurement text,
  support text,
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'MET', 'CARRIED_FORWARD')),
  created_at timestamptz not null default now()
);

/* ---- policies, forum, audit -------------------------------------------------- */

create table if not exists hr_policies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  name text not null,
  version text not null,
  effective_date date not null,
  owner text,
  document_url text,
  required boolean not null default true,
  superseded_by uuid references hr_policies(id),
  created_at timestamptz not null default now(),
  unique (clinic_id, name, version)
);

create table if not exists policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  policy_id uuid not null references hr_policies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  unique (policy_id, user_id, version)
);

create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  author uuid not null references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists forum_comments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  post_id uuid not null references forum_posts(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Immutable audit history for the actions that matter.
create table if not exists hr_audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id),
  actor uuid references auth.users(id),
  subject uuid references auth.users(id),
  action text not null,
  previous_value text,
  new_value text,
  reason text,
  source text,
  at timestamptz not null default now()
);
create index if not exists hr_audit_idx on hr_audit_log(clinic_id, at desc);

create or replace function forbid_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit history is immutable.';
end $$;
drop trigger if exists hr_audit_immutable on hr_audit_log;
create trigger hr_audit_immutable before update or delete on hr_audit_log
  for each row execute function forbid_audit_mutation();

-- A closed cycle changes only through an audited administrative override.
create or replace function forbid_closed_cycle_edit() returns trigger
language plpgsql as $$
begin
  if old.status = 'CLOSED' and new.status = 'CLOSED' and
     (new.score is distinct from old.score or new.breakdown is distinct from old.breakdown) then
    raise exception 'Cycle % is closed; changes require an audited administrative override.', old.cycle;
  end if;
  return new;
end $$;
drop trigger if exists scorecard_cycle_guard on scorecard_cycles;
create trigger scorecard_cycle_guard before update on scorecard_cycles
  for each row execute function forbid_closed_cycle_edit();

/* ---- RLS ---------------------------------------------------------------------- */

do $$
declare t text;
begin
  foreach t in array array['credential_rule_versions', 'credential_rule_proposals', 'employee_credentials',
    'pd_activities', 'pd_credit_allocations', 'scorecard_metrics', 'scorecard_cycles', 'scorecard_responses',
    'recognitions', 'bonus_results', 'development_goals', 'hr_policies', 'policy_acknowledgements',
    'forum_posts', 'forum_comments', 'hr_audit_log'] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- Rules and policies: readable across the clinic, written by administrators.
create policy rule_versions_read on credential_rule_versions for select
  using (clinic_id is null or clinic_id = auth_clinic_id());
create policy rule_versions_admin on credential_rule_versions for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy rule_proposals_admin on credential_rule_proposals for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy policies_read on hr_policies for select using (clinic_id = auth_clinic_id());
create policy policies_admin on hr_policies for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');

-- Own records; managers reach their linked team through hub_can_manage().
create policy credentials_own on employee_credentials for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy credentials_manage on employee_credentials for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy activities_own on pd_activities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy activities_manage on pd_activities for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy allocations_own on pd_credit_allocations for all
  using (exists (select 1 from pd_activities a where a.id = activity_id and a.user_id = auth.uid()))
  with check (exists (select 1 from pd_activities a where a.id = activity_id and a.user_id = auth.uid()));
create policy goals_own on development_goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_manage on development_goals for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy acks_own on policy_acknowledgements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy acks_manage on policy_acknowledgements for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

-- Scorecards: the employee sees their own cycle; managers see their team.
create policy cycles_own on scorecard_cycles for select using (user_id = auth.uid());
create policy cycles_manage on scorecard_cycles for all
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

-- Peer feedback confidentiality: a rater reads back only their own submission;
-- the subject never selects rows that would reveal an identified rater.
create policy responses_rater on scorecard_responses for all
  using (rater = auth.uid()) with check (rater = auth.uid());
create policy responses_subject on scorecard_responses for select
  using (
    exists (select 1 from scorecard_cycles c where c.id = cycle_id and c.user_id = auth.uid())
    and (anonymous = false or rater is null)
  );
create policy responses_manage on scorecard_responses for select
  using (exists (select 1 from scorecard_cycles c where c.id = cycle_id
                 and c.clinic_id = auth_clinic_id() and hub_can_manage(c.user_id)));

-- Recognition is team-visible inside the clinic; bonus results stay private.
create policy recognition_read on recognitions for select using (clinic_id = auth_clinic_id());
create policy recognition_write on recognitions for insert
  with check (clinic_id = auth_clinic_id() and from_user = auth.uid());
create policy bonus_own on bonus_results for select using (user_id = auth.uid());
create policy bonus_manage on bonus_results for all
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

create policy forum_read on forum_posts for select using (clinic_id = auth_clinic_id());
create policy forum_write on forum_posts for insert with check (clinic_id = auth_clinic_id() and author = auth.uid());
create policy comments_read on forum_comments for select using (clinic_id = auth_clinic_id());
create policy comments_write on forum_comments for insert with check (clinic_id = auth_clinic_id() and author = auth.uid());

create policy hr_audit_read on hr_audit_log for select
  using (clinic_id = auth_clinic_id() and (actor = auth.uid() or subject = auth.uid() or auth_role() = 'admin'));
create policy hr_audit_write on hr_audit_log for insert with check (clinic_id = auth_clinic_id());
