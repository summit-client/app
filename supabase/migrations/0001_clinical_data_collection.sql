-- ============================================================================
-- Clinical data collection (apps/data) — first checked-in schema for Summit.
-- Attaches to the scheduler's existing tables (clients, sessions, profiles)
-- WITHOUT modifying scheduler behaviour. Adds tenancy + roles + RLS.
-- Apply with: supabase db push   (or paste into the SQL editor).
-- ============================================================================

-- ---- tenancy + roles foundation --------------------------------------------
create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- profiles exists already (id = auth.uid(), role text, full_name).
-- Additive columns only; scheduler reads are unaffected.
alter table profiles add column if not exists clinic_id uuid references clinics(id);
alter table profiles add column if not exists supervisor_id uuid references profiles(id);

comment on column profiles.role is
  'admin | supervisor | clinician | scheduler | client — three clinical levels mirror the MEGBA model';

-- helper: the caller''s clinic + role, used by every policy
create or replace function auth_clinic_id() returns uuid
language sql stable security definer set search_path = public as
$$ select clinic_id from profiles where id = auth.uid() $$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function auth_is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select auth_role() in ('admin','supervisor','clinician') $$;

-- ---- programs (goals) -------------------------------------------------------
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null,                         -- scheduler clients.id
  name text not null,
  domain text,                                       -- expressive comm, self-help, ...
  measurement_mode text not null check (measurement_mode in
    ('dtt','task_analysis','frequency','duration','interval','abc','net','yni')),
  operational_definition text not null,
  mastery_criteria text not null
    default '80% across 3 consecutive sessions, 2 settings, 2 people',
  mastery_pct int not null default 80,
  mastery_consecutive int not null default 3,
  prompt_level text not null default 'independent' check (prompt_level in
    ('physical','model','gestural','verbal','independent')),
  reinforcement_schedule text default 'FR1',
  sd text,                                           -- discriminative stimulus, for DTT
  target_direction text not null default 'increase' check (target_direction in ('increase','decrease')),
  status text not null default 'active' check (status in
    ('draft','pending_signoff','active','on_hold','mastered','maintenance','archived')),
  interval_seconds int default 30,                   -- interval mode block length
  daily_target_minutes numeric(6,2),                 -- duration mode target
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists programs_client_idx on programs(client_id);
create index if not exists programs_clinic_idx on programs(clinic_id);

-- task-analysis steps / chain steps (ordered)
create table if not exists program_steps (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  position int not null,
  description text not null,
  status text not null default 'teaching' check (status in ('teaching','independent','mastered')),
  unique (program_id, position)
);

-- ---- session-level records --------------------------------------------------
-- One per (scheduler session × program) actually run.
create table if not exists session_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  session_id bigint not null,                        -- scheduler sessions.id
  client_id bigint not null,
  program_id uuid not null references programs(id),
  clinician_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary_pct numeric(5,2),                          -- computed on close, mode-dependent
  summary_count int,
  summary_seconds int,
  created_at timestamptz not null default now(),
  unique (session_id, program_id)
);
create index if not exists session_records_client_idx on session_records(client_id, started_at desc);

-- Every atomic observation, all 8 modes share this event stream.
create table if not exists trial_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  session_record_id uuid not null references session_records(id) on delete cascade,
  mode text not null,
  code text not null,        -- dtt/ta: Y|P|N · freq: +|- · interval: hit|miss ·
                             -- net: spont|prompted · yni: yes|no|inc · duration: start|stop
  step_position int,         -- task-analysis step, interval block index
  prompt_level text,         -- prompt used, when prompted
  note text,
  occurred_at timestamptz not null default now()
);
create index if not exists trial_events_record_idx on trial_events(session_record_id, occurred_at);

-- ABC / behaviour incidents (own shape; escalates at thresholds)
create table if not exists behaviour_incidents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  session_record_id uuid references session_records(id) on delete set null,
  client_id bigint not null,
  clinician_id uuid not null references profiles(id),
  occurred_at timestamptz not null default now(),
  antecedent text not null,
  behaviour text not null,   -- operationally defined
  consequence text not null,
  suspected_function text check (suspected_function in
    ('escape_avoidance','attention','tangible','sensory_automatic','unclear')),
  needs_supervisor_review boolean not null default false,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);
create index if not exists behaviour_incidents_client_idx on behaviour_incidents(client_id, occurred_at desc);

-- ---- session notes (draft → signed → amended) -------------------------------
create table if not exists session_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  session_id bigint not null unique,
  client_id bigint not null,
  clinician_id uuid not null references profiles(id),
  body jsonb not null,                 -- {summary, perProgram[], abcNarrative, familyUpdate, planNext}
  billable_code text check (billable_code in ('97153','97155','97156')),
  status text not null default 'draft' check (status in
    ('draft','signed','awaiting_countersign','countersigned','returned')),
  signed_at timestamptz,
  countersigned_by uuid references profiles(id),
  countersigned_at timestamptz,
  return_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Signed notes are immutable; changes append amendments.
create table if not exists note_amendments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  note_id uuid not null references session_notes(id) on delete cascade,
  amended_by uuid not null references profiles(id),
  amendment text not null,
  created_at timestamptz not null default now()
);

-- ---- mastery + audit --------------------------------------------------------
create table if not exists mastery_evaluations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  window_pcts numeric(5,2)[] not null,   -- the qualifying consecutive-session percentages
  criterion_met boolean not null,
  settings_confirmed boolean not null default false,   -- 2 settings
  people_confirmed boolean not null default false,     -- 2 people
  confirmed_by uuid references profiles(id),           -- supervisor confirmation
  confirmed_at timestamptz
);

create table if not exists clinical_audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  actor_id uuid references profiles(id),
  client_id bigint,
  action text not null,                  -- note.signed, note.countersigned, program.created, ...
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists clinical_audit_clinic_idx on clinical_audit_events(clinic_id, created_at desc);

-- ---- RLS: clinic isolation + role rules, enforced at the database -----------
do $$
declare t text;
begin
  foreach t in array array['clinics','programs','program_steps','session_records',
    'trial_events','behaviour_incidents','session_notes','note_amendments',
    'mastery_evaluations','clinical_audit_events'] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- clinics: staff can read their own clinic row
drop policy if exists clinics_read on clinics;
create policy clinics_read on clinics for select
  using (id = auth_clinic_id());

-- generic clinic-scoped read/write for staff, per table
do $$
declare t text;
begin
  foreach t in array array['programs','program_steps','session_records','trial_events',
    'behaviour_incidents','session_notes','note_amendments','mastery_evaluations'] loop
    execute format('drop policy if exists %I_staff_read on %I;', t, t);
    execute format(
      'create policy %I_staff_read on %I for select using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format('drop policy if exists %I_staff_write on %I;', t, t);
    execute format(
      'create policy %I_staff_write on %I for insert with check (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format('drop policy if exists %I_staff_update on %I;', t, t);
    execute format(
      'create policy %I_staff_update on %I for update using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
  end loop;
end $$;

-- audit: staff read own clinic; inserts by any authenticated staff
drop policy if exists audit_read on clinical_audit_events;
create policy audit_read on clinical_audit_events for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
drop policy if exists audit_write on clinical_audit_events;
create policy audit_write on clinical_audit_events for insert
  with check (clinic_id = auth_clinic_id() and auth_is_staff());

-- Countersigning and note immutability are enforced in the app layer
-- (status machine) and recorded in note_amendments + clinical_audit_events;
-- a stricter column-level trigger can follow once the flows settle.
