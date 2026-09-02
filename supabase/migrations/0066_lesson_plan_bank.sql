-- 0066 · Lesson Plan Bank
--
-- The organization's group-programming library: 22 programs across 8 clusters,
-- with 66 supporting resources. Cooking groups, movement and music, executive
-- functioning, STEM, social play. Distinct from the goal bank, which holds
-- individual clinical targets - a lesson plan is what a group does for twelve
-- weeks, and a goal is what one child is measured on.
--
-- RESOURCES THAT CONTAIN CLIENT INFORMATION ARE MARKED
--
-- 11 of the 66 resources in the source library are flagged as containing
-- personal information - completed datasheets, filled worksheets with a child's
-- name on them. They are imported with that flag intact and a policy that gates
-- them on clinical.client.read, because "a lesson plan resource" and "a
-- document with a client's name in it" need different answers to "who may open
-- this", and the library is the only place that knows which is which.
--
-- Losing that flag on import would have turned a curated distinction into a
-- shared folder.

create table if not exists lesson_clusters (
  id text primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  name text not null,
  description text
);

create table if not exists lesson_programs (
  id text primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  cluster_id text references lesson_clusters(id) on delete set null,

  name text not null,
  slug text,
  focus text,
  description text,
  age_range text,
  format text,
  group_size text,
  setting text,
  duration text,
  weeks integer,
  model text,
  day_time text,

  status text not null default 'Approved',
  drive_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists lesson_programs_cluster_idx on lesson_programs(cluster_id);

create table if not exists lesson_resources (
  id text primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  program_id text references lesson_programs(id) on delete cascade,

  name text not null,
  kind text not null default 'other',
  note text,
  url text,
  keywords text,

  -- The flag that decides who may open it. See the header.
  contains_client_info boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lesson_resources_program_idx on lesson_resources(program_id);

comment on column lesson_resources.contains_client_info is
  'Marked in the source library: a completed datasheet or a worksheet with a '
  'child''s name on it, as opposed to a blank template. Gates the read policy, '
  'because "a lesson resource" and "a document naming a client" are not the '
  'same question.';

-- The goals the source library records against a program. Kept separate from
-- goal_bank_entries: these describe what a GROUP works on, and folding them
-- into the individual goal bank would put group objectives into a picker that
-- assigns targets to one child.
create table if not exists lesson_program_goals (
  id text primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  program_id text references lesson_programs(id) on delete cascade,
  goal text not null,
  target_behavior text,
  objective text,
  measurement text,
  data_collection_method text,
  frequency text,
  notes text
);
create index if not exists lesson_program_goals_program_idx on lesson_program_goals(program_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table lesson_clusters enable row level security;
alter table lesson_programs enable row level security;
alter table lesson_resources enable row level security;
alter table lesson_program_goals enable row level security;

drop policy if exists lesson_clusters_read on lesson_clusters;
create policy lesson_clusters_read on lesson_clusters for select
  using ((public.auth_is_staff() or public.auth_is_scheduling_staff())
         and (clinic_id is null or clinic_id = public.auth_clinic_id()));

drop policy if exists lesson_programs_read on lesson_programs;
create policy lesson_programs_read on lesson_programs for select
  using ((public.auth_is_staff() or public.auth_is_scheduling_staff())
         and (clinic_id is null or clinic_id = public.auth_clinic_id()));

drop policy if exists lesson_program_goals_read on lesson_program_goals;
create policy lesson_program_goals_read on lesson_program_goals for select
  using ((public.auth_is_staff() or public.auth_is_scheduling_staff())
         and (clinic_id is null or clinic_id = public.auth_clinic_id()));

-- A blank template is staff material. A resource carrying a child's
-- information is clinical record and needs the action that says so.
--
-- The reader set here is deliberately wider than auth_is_staff(). That helper
-- is admin/supervisor/clinician - all three of whom hold clinical.client.read,
-- which made the contains_client_info gate below match everyone who could
-- reach the table at all and therefore protect nothing. A gate that never
-- refuses anybody is worse than none: it reads like a boundary in review.
--
-- Schedulers book these groups and need to know what a programme is, and they
-- do not hold clinical.client.read. Admitting them is what makes the second
-- clause do work.
drop policy if exists lesson_resources_read on lesson_resources;
create policy lesson_resources_read on lesson_resources for select
  using (
    (public.auth_is_staff() or public.auth_is_scheduling_staff())
    and (clinic_id is null or clinic_id = public.auth_clinic_id())
    and (not contains_client_info or public.auth_can('clinical.client.read'))
  );

-- Writes are clinic administration: a lesson bank is curated, not edited in
-- passing during a session.
drop policy if exists lesson_programs_write on lesson_programs;
create policy lesson_programs_write on lesson_programs for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));
drop policy if exists lesson_programs_update on lesson_programs;
create policy lesson_programs_update on lesson_programs for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists lesson_resources_write on lesson_resources;
create policy lesson_resources_write on lesson_resources for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));
drop policy if exists lesson_resources_update on lesson_resources;
create policy lesson_resources_update on lesson_resources for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

-- ---------------------------------------------------------------------------
-- What the Lesson Plan Bank tab reads
-- ---------------------------------------------------------------------------
create or replace view lesson_plan_catalogue with (security_invoker = true) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.slug,
  p.focus,
  p.description,
  p.age_range,
  p.format,
  p.group_size,
  p.setting,
  p.duration,
  p.weeks,
  p.model,
  p.day_time,
  p.status,
  p.drive_url,
  c.id   as cluster_id,
  c.name as cluster_name,
  (select count(*)::int from lesson_resources r where r.program_id = p.id) as resource_count,
  (select count(*)::int from lesson_program_goals g where g.program_id = p.id) as goal_count,
  concat_ws(' ', p.name, p.focus, p.description, p.model, p.setting, c.name) as search_text
from lesson_programs p
left join lesson_clusters c on c.id = p.cluster_id;

comment on view lesson_plan_catalogue is
  'The Lesson Plan Bank tab''s list. Resource counts include resources the '
  'caller may not open - the count is of what the programme has, and hiding '
  'that would misrepresent the programme rather than protect anything.';
