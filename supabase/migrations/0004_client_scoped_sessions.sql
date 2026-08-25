-- 0004 · Client-scoped Run Sessions
--
-- Run Session lives inside the client record. A session is created FROM a
-- client and stays bound to it: planning → active → documentation → completed
-- → locked. Every tap during the active stage is one atomic row in
-- trial_events (source of truth); session_program_summaries is a DERIVED
-- rollup, recomputable from the raw observations at any time.

-- 1 · The session record --------------------------------------------------------
create table if not exists client_sessions (
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id),
  client_id bigint not null,
  clinician_id uuid references auth.users(id),

  status text not null default 'planning'
    check (status in ('planning', 'active', 'documentation', 'completed', 'locked')),

  start_time timestamptz,
  end_time timestamptz,
  planned_duration_min integer,
  actual_duration_min integer,

  location text,
  service_type text,
  focus text,

  plan jsonb,                          -- SessionPlanDraft: today's selection/organization, never the treatment plan itself
  program_version_snapshot jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);
create index if not exists client_sessions_client_idx on client_sessions(client_id, created_at desc);
create index if not exists client_sessions_status_idx on client_sessions(clinic_id, status);

-- Locked sessions are immutable (mirror of the signed-report trigger).
create or replace function forbid_locked_session_update() returns trigger
language plpgsql as $$
begin
  if old.status = 'locked' then
    raise exception 'Session % is locked; changes require an amendment record.', old.id;
  end if;
  -- the status machine only moves forward
  if array_position(array['planning','active','documentation','completed','locked'], new.status)
   < array_position(array['planning','active','documentation','completed','locked'], old.status) then
    raise exception 'Session status cannot move backwards (% -> %).', old.status, new.status;
  end if;
  return new;
end $$;
drop trigger if exists client_sessions_forbid_locked on client_sessions;
create trigger client_sessions_forbid_locked
  before update on client_sessions
  for each row execute function forbid_locked_session_update();

-- 2 · Targets: exemplars within a program --------------------------------------
create table if not exists program_targets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'mastered', 'on_hold')),
  position integer not null default 1,
  created_at timestamptz not null default now(),
  unique (program_id, name)
);
create index if not exists program_targets_program_idx on program_targets(program_id, position);

-- 3 · Atomic observations gain their session/target/activity context ------------
alter table trial_events add column if not exists client_session_id bigint references client_sessions(id) on delete set null;
alter table trial_events add column if not exists target text;
alter table trial_events add column if not exists activity_context text;
create index if not exists trial_events_session_idx on trial_events(client_session_id);

alter table session_records add column if not exists client_session_id bigint references client_sessions(id) on delete set null;

-- 4 · Derived per-program session rollups ---------------------------------------
-- Never store only the percentage: numerator/denominator/raw count ride along so
-- independence, prompt dependency, variability and trend all stay computable.
create table if not exists session_program_summaries (
  client_session_id bigint not null references client_sessions(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  clinic_id uuid references clinics(id),

  raw_observation_count integer not null,
  numerator numeric,
  denominator numeric,
  calculated_value numeric,
  metric_type text not null check (metric_type in
    ('percent_independent', 'count', 'rate_per_hour', 'total_seconds', 'percent_intervals', 'observations')),
  program_version_id text,

  computed_at timestamptz not null default now(),
  primary key (client_session_id, program_id)
);

-- 5 · RLS ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['client_sessions', 'program_targets', 'session_program_summaries'] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I_staff_read on %I for select using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format(
      'create policy %I_staff_write on %I for insert with check (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format(
      'create policy %I_staff_update on %I for update using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
  end loop;
end $$;
