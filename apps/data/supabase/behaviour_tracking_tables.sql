
create table if not exists public.behaviour_events (
  id text primary key,
  behaviour_id text not null,
  behaviour_name text not null,
  event_timestamp timestamptz not null,
  appointment_id text not null,
  client_id text not null,
  clinician_id text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.on_off_task_intervals (
  id text primary key,
  status text not null check (status in ('on_task', 'off_task')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  appointment_id text not null,
  client_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_tracking_items (
  id text primary key,
  task_name text not null,
  prompt_level text not null check (
    prompt_level in (
      'independent',
      'verbal_prompt',
      'gestural_prompt',
      'model_prompt',
      'physical_prompt',
      'not_completed'
    )
  ),
  completed boolean not null,
  event_timestamp timestamptz not null,
  appointment_id text not null,
  client_id text not null,
  clinician_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clinician_goals (
  id text primary key,
  client_id text not null,
  clinician_id text not null,
  title text not null,
  description text,
  target_date date,
  status text not null check (status in ('not_started', 'in_progress', 'completed', 'on_hold')),
  priority text not null check (priority in ('low', 'medium', 'high')),
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  ai_suggested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_progress_entries (
  id text primary key,
  goal_id text not null references public.clinician_goals(id) on delete cascade,
  note text not null,
  progress_delta integer not null,
  progress_percent integer not null check (progress_percent >= 0 and progress_percent <= 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_behaviour_events_client on public.behaviour_events (client_id);
create index if not exists idx_behaviour_events_appointment on public.behaviour_events (appointment_id);
create index if not exists idx_on_off_task_intervals_client on public.on_off_task_intervals (client_id);
create index if not exists idx_task_tracking_items_client on public.task_tracking_items (client_id);
create index if not exists idx_clinician_goals_client on public.clinician_goals (client_id);
create index if not exists idx_clinician_goals_updated on public.clinician_goals (updated_at desc);
create index if not exists idx_goal_progress_entries_goal on public.goal_progress_entries (goal_id);

alter table public.behaviour_events enable row level security;
alter table public.on_off_task_intervals enable row level security;
alter table public.task_tracking_items enable row level security;
alter table public.clinician_goals enable row level security;
alter table public.goal_progress_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'behaviour_events'
      and policyname = 'behaviour_events_authenticated_all'
  ) then
    create policy behaviour_events_authenticated_all
      on public.behaviour_events
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'on_off_task_intervals'
      and policyname = 'on_off_task_intervals_authenticated_all'
  ) then
    create policy on_off_task_intervals_authenticated_all
      on public.on_off_task_intervals
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_tracking_items'
      and policyname = 'task_tracking_items_authenticated_all'
  ) then
    create policy task_tracking_items_authenticated_all
      on public.task_tracking_items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clinician_goals'
      and policyname = 'clinician_goals_authenticated_all'
  ) then
    create policy clinician_goals_authenticated_all
      on public.clinician_goals
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'goal_progress_entries'
      and policyname = 'goal_progress_entries_authenticated_all'
  ) then
    create policy goal_progress_entries_authenticated_all
      on public.goal_progress_entries
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
