-- 0061 · The goal bank gains codes, teaching steps and provenance
--
-- `goal_bank_entries` (0002) holds a name, a domain, an operational definition
-- and a teaching procedure. The organization's actual bank carries three more
-- things it has nowhere to put:
--
--   * a stable code (RC1.01) that clinicians use to refer to a goal in
--     conversation, in reports and on paper
--   * a teaching ladder - 541 of the 554 goals have exactly ten steps, a fixed
--     prompt-fading progression, and today they would be flattened into the
--     teaching_procedure paragraph and lost as structure
--   * where the goal came from
--
-- PROVENANCE IS TWO COLUMNS, NOT ONE
--
-- `assessment` alone cannot distinguish "this goal is from Zones of
-- Regulation" from "we do not know where this goal came from" from "we wrote
-- it ourselves" - and those are three different facts, one of which must never
-- be guessed. A goal's stated source travels into progress reports and funding
-- claims, so an inferred assessment is a claim the clinic did not make.
--
-- So `assessment` names the source and `assessment_source` says what kind of
-- claim that is: 'curriculum' where a published programme is named in the
-- goal's own domain, 'internal' for the organization's own bank, 'unknown'
-- where nobody has said. Only 'curriculum' asserts an external source.
alter table goal_bank_entries
  add column if not exists code text,
  add column if not exists sub_domain text,
  add column if not exists assessment text,
  add column if not exists assessment_source text not null default 'unknown'
    check (assessment_source in ('curriculum', 'internal', 'unknown')),
  add column if not exists default_prompt_level text
    check (default_prompt_level is null or default_prompt_level in
      ('physical', 'model', 'gestural', 'verbal', 'independent')),
  -- Whether an import rewrote the wording, and why. Kept so a supervisor can
  -- review exactly what changed rather than being asked to re-read 554 goals.
  add column if not exists needs_clinical_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists original_definition text;

comment on column goal_bank_entries.assessment_source is
  'What kind of claim `assessment` is. Only ''curriculum'' asserts a published '
  'source. ''internal'' means the organization''s own bank; ''unknown'' means '
  'nobody has said, and is deliberately not filled in by guessing - a goal''s '
  'stated source travels into reports and funding claims.';

comment on column goal_bank_entries.original_definition is
  'The wording an import replaced, where it replaced any. Null means the '
  'definition is as it was written. Kept so a reviewer can see the change '
  'rather than being asked to trust it.';

create unique index if not exists goal_bank_entries_code_idx
  on goal_bank_entries(clinic_id, code) where code is not null;

-- ---------------------------------------------------------------------------
-- The teaching ladder
--
-- A separate table rather than a jsonb array on the entry: a step is selected
-- individually (a client is working at step 4), counted, and eventually
-- referenced by a program's current target. An array would make "which step is
-- this child on" a scan through a document.
-- ---------------------------------------------------------------------------
create table if not exists goal_bank_steps (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references goal_bank_entries(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  description text not null,

  -- The prompt level this step teaches at, where the step says. The source
  -- bank writes these as abbreviations (FP, PP, GP, VP) that only a clinician
  -- who already knows the convention can read; the import expands them in the
  -- text and records the level here so it can be filtered and reported on.
  prompt_level text check (prompt_level is null or prompt_level in
    ('physical', 'model', 'gestural', 'verbal', 'independent')),

  unique (entry_id, step_number)
);
create index if not exists goal_bank_steps_entry_idx
  on goal_bank_steps(entry_id, step_number);

alter table goal_bank_steps enable row level security;

-- Same boundary as the entries they belong to: staff read the shared bank and
-- their own clinic's, and write only their own clinic's.
drop policy if exists goal_bank_steps_read on goal_bank_steps;
create policy goal_bank_steps_read on goal_bank_steps for select
  using (exists (
    select 1 from public.goal_bank_entries e
     where e.id = goal_bank_steps.entry_id
       and public.auth_is_staff()
       and (e.clinic_id is null or e.clinic_id = public.auth_clinic_id())));

drop policy if exists goal_bank_steps_write on goal_bank_steps;
create policy goal_bank_steps_write on goal_bank_steps for insert
  with check (exists (
    select 1 from public.goal_bank_entries e
     where e.id = goal_bank_steps.entry_id
       and public.auth_is_staff()
       and e.clinic_id = public.auth_clinic_id()));

drop policy if exists goal_bank_steps_update on goal_bank_steps;
create policy goal_bank_steps_update on goal_bank_steps for update
  using (exists (
    select 1 from public.goal_bank_entries e
     where e.id = goal_bank_steps.entry_id
       and public.auth_is_staff() and e.clinic_id = public.auth_clinic_id()))
  with check (exists (
    select 1 from public.goal_bank_entries e
     where e.id = goal_bank_steps.entry_id
       and public.auth_is_staff() and e.clinic_id = public.auth_clinic_id()));

drop policy if exists goal_bank_steps_delete on goal_bank_steps;
create policy goal_bank_steps_delete on goal_bank_steps for delete
  using (exists (
    select 1 from public.goal_bank_entries e
     where e.id = goal_bank_steps.entry_id
       and public.auth_is_staff() and e.clinic_id = public.auth_clinic_id()));

-- ---------------------------------------------------------------------------
-- Which step a client is currently working at
--
-- On `programs`, not on the bank entry: the ladder belongs to the goal, and
-- where a particular child is on it belongs to that child's program.
-- ---------------------------------------------------------------------------
alter table programs
  add column if not exists goal_bank_step integer;

comment on column programs.goal_bank_step is
  'Which step of the bank goal''s teaching ladder this client is working at. '
  'Null for a program with no ladder, or one not yet placed on it.';

-- ---------------------------------------------------------------------------
-- What the Goal Generator searches
--
-- One view so the search box, the domain filter and the client-program picker
-- all read the same rows, with the step count already counted rather than
--每 caller running its own aggregate.
-- ---------------------------------------------------------------------------
create or replace view goal_bank_catalogue with (security_invoker = true) as
select
  e.id,
  e.clinic_id,
  e.code,
  e.name,
  e.domain,
  e.sub_domain,
  e.operational_definition,
  e.default_mastery_criteria,
  e.default_measurement_mode,
  e.default_prompt_level,
  e.teaching_procedure,
  e.assessment,
  e.assessment_source,
  e.status,
  e.needs_clinical_review,
  e.review_reason,
  (select count(*)::int from goal_bank_steps s where s.entry_id = e.id) as step_count,
  -- One column to match against, so the search box is a single ILIKE rather
  -- than four ORs that each have to be kept in step with the others.
  concat_ws(' ', e.code, e.name, e.domain, e.sub_domain,
                 e.operational_definition, e.assessment) as search_text
from goal_bank_entries e;

comment on view goal_bank_catalogue is
  'What the Goal Generator searches and lists. security_invoker so the '
  'caller''s own policies apply - see 0052.';
