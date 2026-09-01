-- 0037 · One progress dataset, two ways of reading it
--
-- The brief asks for a Clinical view and a Journey view, and is explicit that
-- these must not become two conflicting representations of the same child. So
-- there is exactly one computation here — `client_goal_progress` — and both
-- modes read it. Clinical shows the numbers it contains; Journey shows the
-- milestones those same numbers produced. Neither has data the other lacks,
-- and a goal cannot be 72% in one tab and mastered in the other.
--
-- WHAT IS COMPUTED AND WHAT IS RECORDED
--
-- Computed, from session_program_summaries: current performance, the trend,
-- how many sessions contributed, when data last arrived. These are arithmetic
-- over observations that already exist, so they cannot drift from the clinical
-- record and there is nothing to keep in sync.
--
-- Recorded, because a human decided it: whether a milestone is shared with the
-- family, the plain-language reason a goal is being worked on, and any home
-- strategy. The brief is firm that these are clinician-approved rather than
-- generated, and it is right — turning a raw clinical recommendation into
-- parent instructions automatically is how a family ends up running a
-- procedure nobody approved.
--
-- NOTHING IS SHARED BY DEFAULT
--
-- A mastered goal does not appear in the family's timeline because it was
-- mastered. It appears because a clinician chose to share it. That is one
-- extra step for the clinician and the correct default for a record a family
-- reads without a clinician present.

-- ---------------------------------------------------------------------------
-- 1. Plain-language framing a clinician approves
--
-- On the program rather than in a separate table: it is one-to-one with the
-- goal, it is edited at the same time by the same person, and a join would
-- only create a way for the two to disagree about which goal they describe.
-- ---------------------------------------------------------------------------
alter table programs add column if not exists family_rationale text;
alter table programs add column if not exists family_home_strategy text;
alter table programs add column if not exists family_summary_approved_by uuid references profiles(id);
alter table programs add column if not exists family_summary_approved_at timestamptz;

comment on column programs.family_rationale is
  'Why this goal is being worked on, in language written for a parent. Shown '
  'in the portal as "Why we are working on this". Null means nothing is shown: '
  'an empty section is better than a clinical definition a family misreads.';
comment on column programs.family_home_strategy is
  'An approved way for the family to support this goal at home. Null means the '
  'portal shows nothing. Never derived from the operational definition — a '
  'generalization strategy is a clinical decision, not a rephrasing.';

-- ---------------------------------------------------------------------------
-- 2. Milestones: the achievements a clinician chose to share
--
-- Not a view over mastery_evaluations. A milestone is an editorial act — a
-- clinician deciding this moment is worth telling the family about, and how to
-- say it — and that cannot be computed from a criterion being met. Plenty of
-- mastered goals are not milestones, and some milestones are not masteries.
-- ---------------------------------------------------------------------------
create table if not exists family_milestones (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  client_id bigint not null references clients(id) on delete cascade,

  -- Optional: a milestone can be about a goal, or about the child.
  program_id uuid references programs(id) on delete set null,

  kind text not null check (kind in (
    'goal_mastered', 'new_skill', 'communication_win', 'independence',
    'participation', 'new_goal_started', 'streak', 'clinician_note')),

  title text not null,
  detail text,

  -- When it happened, which is not when it was recorded. A clinician writing
  -- up Friday's session on Monday should not have the family see Monday.
  occurred_on date not null default current_date,

  -- The whole point. False until a clinician decides otherwise.
  shared_with_family boolean not null default false,
  shared_at timestamptz,
  shared_by uuid references profiles(id),

  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),

  constraint family_milestones_shared_has_stamp
    check ((shared_with_family = false) or (shared_at is not null and shared_by is not null))
);
create index if not exists family_milestones_client_idx
  on family_milestones(client_id, occurred_on desc);
create index if not exists family_milestones_shared_idx
  on family_milestones(client_id, shared_with_family, occurred_on desc);

comment on table family_milestones is
  'Achievements a clinician chose to tell the family about. Not derived from '
  'mastery: sharing is an editorial decision, and nothing reaches a family '
  'because a threshold was crossed.';

-- ---------------------------------------------------------------------------
-- 3. Family observations: what the parent tells the clinic
--
-- Deliberately its own table and never written into a session record. A
-- parent's report of a home win is real and useful and is not a clinical
-- measurement; folding it into session data would put unverified observations
-- into mastery arithmetic. Provenance stays visible on both sides.
-- ---------------------------------------------------------------------------
create table if not exists family_observations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  client_id bigint not null references clients(id) on delete cascade,

  author_user_id uuid not null references auth.users(id) on delete restrict,

  kind text not null default 'home_win' check (kind in (
    'home_win', 'concern', 'school_update', 'health_update',
    'behaviour_observation', 'general')),

  body text not null,
  occurred_on date not null default current_date,

  -- What the clinical team did with it. 'new' until someone looks.
  clinician_status text not null default 'new'
    check (clinician_status in ('new', 'acknowledged', 'referenced', 'not_clinically_relevant')),
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz,

  created_at timestamptz not null default now()
);
create index if not exists family_observations_client_idx
  on family_observations(client_id, occurred_on desc);
create index if not exists family_observations_status_idx
  on family_observations(clinic_id, clinician_status) where clinician_status = 'new';

comment on table family_observations is
  'What a family reports from home. Never merged into session data: a parent '
  'report is not a clinical measurement, and folding it in would put '
  'unverified observations into mastery arithmetic.';

-- ---------------------------------------------------------------------------
-- 4. The one progress computation both modes read
--
-- Trend compares the most recent three contributing sessions against the three
-- before them. Three because two is noise and five is slow to move; and it is
-- stated here rather than in two apps, so Clinical and Journey cannot disagree
-- about whether a goal is improving.
--
-- Every value is derived. Nothing about progress is stored, so nothing about
-- progress can be stale.
-- ---------------------------------------------------------------------------
create or replace view client_goal_progress as
with measured as (
  select
    sps.program_id,
    sps.calculated_value,
    cs.created_at,
    row_number() over (partition by sps.program_id order by cs.created_at desc) as recency
  from session_program_summaries sps
  join client_sessions cs on cs.id = sps.client_session_id
  where sps.calculated_value is not null
),
windows as (
  select
    program_id,
    avg(calculated_value) filter (where recency <= 3)                  as recent_avg,
    avg(calculated_value) filter (where recency > 3 and recency <= 6)  as prior_avg,
    max(calculated_value) filter (where recency = 1)                   as latest_value,
    max(created_at)                                                    as last_data_at,
    count(*)                                                           as session_count
  from measured
  group by program_id
)
select
  p.id                                   as program_id,
  p.client_id,
  p.clinic_id,
  p.name                                 as goal_name,
  p.domain,
  p.status,
  p.mastery_pct                          as target_pct,
  p.mastery_criteria,
  p.family_rationale,
  p.family_home_strategy,
  round(w.latest_value, 1)               as current_value,
  round(w.recent_avg, 1)                 as recent_average,
  round(w.prior_avg, 1)                  as prior_average,
  coalesce(w.session_count, 0)           as sessions_with_data,
  w.last_data_at,
  -- Approaching mastery, for the "2 goals are close" line the brief asks for.
  case when w.recent_avg is not null and p.mastery_pct is not null
            and w.recent_avg >= p.mastery_pct * 0.9
            and p.status not in ('mastered', 'archived')
       then true else false end          as approaching_mastery,
  -- The trend, named rather than numeric, because "improving" is what a parent
  -- reads and a percentage-point delta is what they have to interpret.
  -- 'not_enough_data' is a real answer and the brief insists on it: three
  -- sessions is the floor for saying anything at all.
  case
    when w.session_count is null or w.session_count < 3 then 'not_enough_data'
    when w.prior_avg is null                            then 'establishing'
    when w.recent_avg >= w.prior_avg + 5                then 'improving'
    when w.recent_avg <= w.prior_avg - 5                then 'declining'
    else 'steady'
  end                                    as trend
from programs p
left join windows w on w.program_id = p.id;

comment on view client_goal_progress is
  'The single progress computation. Clinical mode shows these numbers; Journey '
  'mode shows the milestones they produced. Both read this, so a goal cannot '
  'be 72% in one view and mastered in the other. trend is "not_enough_data" '
  'below three contributing sessions rather than a shape read into noise.';

-- ---------------------------------------------------------------------------
-- 5. What a family may read
-- ---------------------------------------------------------------------------
alter table family_milestones enable row level security;
alter table family_observations enable row level security;

-- Shared milestones only, and only for a child this guardian may see progress
-- for. An unshared milestone is invisible to the family by construction.
drop policy if exists family_milestones_family_read on family_milestones;
create policy family_milestones_family_read on family_milestones for select
  using (
    shared_with_family
    and public.auth_guardian_can(client_id, 'view_clinical_progress')
  );

drop policy if exists family_milestones_staff_read on family_milestones;
create policy family_milestones_staff_read on family_milestones for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists family_milestones_staff_write on family_milestones;
create policy family_milestones_staff_write on family_milestones for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.program.write'));

drop policy if exists family_milestones_staff_update on family_milestones;
create policy family_milestones_staff_update on family_milestones for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.program.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.program.write'));

-- A family reads their own observations back and writes new ones. Writing needs
-- message_clinic rather than a clinical permission: sharing an update is
-- communication, and a guardian who can message the clinic can tell them their
-- child ordered their own food.
drop policy if exists family_observations_family_read on family_observations;
create policy family_observations_family_read on family_observations for select
  using (public.auth_guardian_can(client_id, 'message_clinic'));

drop policy if exists family_observations_family_write on family_observations;
create policy family_observations_family_write on family_observations for insert
  with check (
    author_user_id = auth.uid()
    and public.auth_guardian_can(client_id, 'message_clinic')
  );

-- No family UPDATE policy. An observation is a statement someone made on a
-- date; editing it after a clinician has acted on it rewrites what they acted
-- on. A correction is another observation.

drop policy if exists family_observations_staff_read on family_observations;
create policy family_observations_staff_read on family_observations for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists family_observations_staff_update on family_observations;
create policy family_observations_staff_update on family_observations for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

-- ---------------------------------------------------------------------------
-- 6. The family's own progress, permission-filtered
-- ---------------------------------------------------------------------------
create or replace function public.my_goal_progress()
returns setof client_goal_progress
language sql stable security definer set search_path = public, pg_temp as $$
  select g.* from public.client_goal_progress g
   where public.auth_guardian_can(g.client_id, 'view_clinical_progress')
$$;

comment on function public.my_goal_progress() is
  'client_goal_progress filtered to children this guardian may see progress '
  'for. A guardian with appointments but not clinical access gets nothing.';

-- The timeline the brief calls Wins & Milestones: shared clinical moments and
-- the family's own observations in one chronology, with provenance kept
-- visible so a home report is never mistaken for a clinical finding.
create or replace view my_family_timeline as
select
  'milestone:' || m.id::text  as entry_id,
  m.client_id,
  m.occurred_on,
  'milestone'                 as source,
  m.kind,
  m.title,
  m.detail
from family_milestones m
where m.shared_with_family
  and public.auth_guardian_can(m.client_id, 'view_clinical_progress')
union all
select
  'observation:' || o.id::text,
  o.client_id,
  o.occurred_on,
  'family_observation',
  o.kind,
  case o.kind
    when 'home_win' then 'Home win'
    when 'concern' then 'Something you raised'
    when 'school_update' then 'School update'
    when 'health_update' then 'Health update'
    else 'Your update'
  end,
  o.body
from family_observations o
where public.auth_guardian_can(o.client_id, 'message_clinic');

comment on view my_family_timeline is
  'Shared clinical milestones and the family''s own observations in one '
  'chronology. `source` distinguishes them: a family observation is labelled '
  'as one everywhere it appears, and is never presented as a clinical finding.';
