-- ============================================================================
-- 0002 · Clinical knowledge graph — phases, decisions, modifications, Goal
-- Bank with typed relations, caregiver goals, assessments, and provenance.
-- Powers the deterministic analytics engine and explainable supervision.
-- ============================================================================

-- ---- provenance on programs: where did this goal come from? -----------------
alter table programs add column if not exists source text not null default 'clinician'
  check (source in ('goal_bank','clinician','ai','assessment','pathway'));
alter table programs add column if not exists goal_bank_id uuid;

-- ---- phases: baseline / intervention / maintenance / generalization ---------
create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null check (name in ('baseline','intervention','maintenance','generalization','probe')),
  label text,                                   -- e.g. "Intervention B: VR2 + gestural"
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  created_by uuid references profiles(id)
);
create index if not exists phases_program_idx on phases(program_id, started_at);

-- ---- treatment modifications: every program change, timestamped -------------
create table if not exists treatment_modifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  modified_at timestamptz not null default now(),
  kind text not null check (kind in
    ('prompt_fading','reinforcement_schedule','mastery_criteria','procedure',
     'materials','setting','discontinued','resumed','other')),
  before_value text,
  after_value text,
  rationale text not null,
  outcome text,                                  -- filled retrospectively
  outcome_recorded_at timestamptz,
  decided_by uuid references profiles(id)
);
create index if not exists treatment_mods_program_idx on treatment_modifications(program_id, modified_at);

-- ---- clinical decisions: the reviewed judgement + its outcome ---------------
create table if not exists clinical_decisions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null,
  program_id uuid references programs(id) on delete set null,
  decided_at timestamptz not null default now(),
  pattern text not null,                         -- what was observed (plateau, regression, ...)
  evidence jsonb,                                -- the analytics evidence packet reviewed
  options_considered jsonb,                      -- [{option, rationale}]
  decision text not null,
  remeasure_at date,
  outcome text,                                  -- e.g. "71% -> 91%"
  outcome_recorded_at timestamptz,
  decided_by uuid not null references profiles(id)
);
create index if not exists clinical_decisions_client_idx on clinical_decisions(client_id, decided_at desc);

-- ---- Goal Bank: the organization's accumulated clinical knowledge -----------
create table if not exists goal_bank_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),          -- null = shared across clinics
  name text not null,
  domain text not null,
  operational_definition text not null,
  default_measurement_mode text not null,
  default_mastery_criteria text not null default '80% across 3 consecutive sessions, 2 settings, 2 people',
  teaching_procedure text,
  common_modifications text,
  status text not null default 'approved' check (status in ('draft','approved','retired')),
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- typed relations are the knowledge network: prerequisites, next steps, ...
create table if not exists goal_bank_relations (
  id uuid primary key default gen_random_uuid(),
  from_entry uuid not null references goal_bank_entries(id) on delete cascade,
  to_entry uuid not null references goal_bank_entries(id) on delete cascade,
  kind text not null check (kind in ('prerequisite','next','related','generalization','maintenance')),
  note text,
  unique (from_entry, to_entry, kind)
);
create index if not exists goal_bank_relations_from_idx on goal_bank_relations(from_entry, kind);

alter table programs
  add constraint programs_goal_bank_fk foreign key (goal_bank_id)
  references goal_bank_entries(id) on delete set null;

-- ---- caregiver goals & reports (evidence-typed, never flattened) ------------
create table if not exists caregiver_goals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null,
  stated_at timestamptz not null default now(),
  priority text not null,                        -- the family's words
  evidence_type text not null default 'caregiver_report'
    check (evidence_type = 'caregiver_report'),  -- explicit by construction
  addressed_by_program uuid references programs(id) on delete set null,
  last_addressed_at timestamptz,
  status text not null default 'open' check (status in ('open','addressed','declined','superseded'))
);
create index if not exists caregiver_goals_client_idx on caregiver_goals(client_id, status);

-- ---- assessments ------------------------------------------------------------
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null,
  tool text not null,                            -- MOTAS, VB-MAPP, ABLLS-R, AFLS, FBA, BAR
  administered_at date not null,
  administered_by uuid references profiles(id),
  summary text,
  next_due date
);
create index if not exists assessments_client_idx on assessments(client_id, administered_at desc);

-- ---- treatment integrity observations (fidelity checks) ---------------------
create table if not exists integrity_checks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  program_id uuid not null references programs(id) on delete cascade,
  session_record_id uuid references session_records(id) on delete set null,
  observed_by uuid not null references profiles(id),
  observed_at timestamptz not null default now(),
  steps_correct int not null,
  steps_total int not null,
  note text
);
create index if not exists integrity_program_idx on integrity_checks(program_id, observed_at desc);

-- ---- RLS: same clinic-scoped staff policies as 0001 -------------------------
do $$
declare t text;
begin
  foreach t in array array['phases','treatment_modifications','clinical_decisions',
    'caregiver_goals','assessments','integrity_checks'] loop
    execute format('alter table %I enable row level security;', t);
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

-- goal bank: readable by staff of the clinic or shared entries; writes by staff
alter table goal_bank_entries enable row level security;
alter table goal_bank_relations enable row level security;
drop policy if exists goal_bank_read on goal_bank_entries;
create policy goal_bank_read on goal_bank_entries for select
  using (auth_is_staff() and (clinic_id is null or clinic_id = auth_clinic_id()));
drop policy if exists goal_bank_write on goal_bank_entries;
create policy goal_bank_write on goal_bank_entries for insert
  with check (auth_is_staff() and clinic_id = auth_clinic_id());
drop policy if exists goal_bank_update on goal_bank_entries;
create policy goal_bank_update on goal_bank_entries for update
  using (auth_is_staff() and clinic_id = auth_clinic_id());
drop policy if exists goal_bank_rel_read on goal_bank_relations;
create policy goal_bank_rel_read on goal_bank_relations for select using (auth_is_staff());
drop policy if exists goal_bank_rel_write on goal_bank_relations;
create policy goal_bank_rel_write on goal_bank_relations for insert with check (auth_is_staff());

-- ---- seed: the Functional Requesting cluster (Mount Etna Goal Bank) ---------
insert into goal_bank_entries (id, clinic_id, name, domain, operational_definition, default_measurement_mode, teaching_procedure)
values
  ('00000000-0000-4000-a000-000000000001', null, 'Functional Requesting', 'Expressive communication',
   'Requests a preferred item using the established communication modality, without physical guidance.',
   'dtt', 'Most-to-least prompting; fade contingent on independent responding across 2 consecutive sessions.'),
  ('00000000-0000-4000-a000-000000000002', null, 'Request Help', 'Expressive communication',
   'Requests assistance when presented with a task that cannot be completed independently.', 'dtt', null),
  ('00000000-0000-4000-a000-000000000003', null, 'Request Break', 'Expressive communication',
   'Requests a break when presented with a non-preferred task, replacing escape-maintained behaviour.', 'dtt', null),
  ('00000000-0000-4000-a000-000000000004', null, 'Request Missing Item', 'Expressive communication',
   'Requests a needed item that is absent from the activity materials.', 'net', null),
  ('00000000-0000-4000-a000-000000000005', null, 'Communication Modality Established', 'Expressive communication',
   'Uses a consistent modality (vocal, sign, AAC) to communicate at least one message.', 'yni', null),
  ('00000000-0000-4000-a000-000000000006', null, 'Basic Discrimination', 'Receptive communication',
   'Discriminates between two or more stimuli when asked.', 'dtt', null),
  ('00000000-0000-4000-a000-000000000007', null, 'Communication-Partner Generalization', 'Expressive communication',
   'Emits mastered requests with at least two additional communication partners across settings.', 'net', null)
on conflict (id) do nothing;

insert into goal_bank_relations (from_entry, to_entry, kind) values
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000001', 'prerequisite'),
  ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000001', 'prerequisite'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'next'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'next'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'next'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000007', 'generalization')
on conflict do nothing;
