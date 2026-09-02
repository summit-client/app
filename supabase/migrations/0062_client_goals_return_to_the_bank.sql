-- 0062 · A goal written for one client becomes a goal the clinic owns
--
-- Programs already point at the bank: `programs.goal_bank_id` records that a
-- program came from a bank entry. Nothing has ever gone the other way, so a
-- clinician who writes a good goal from scratch for one child writes it again
-- for the next, and the clinic's accumulated clinical knowledge stays in 554
-- rows imported once rather than growing with the work.
--
-- This closes that loop. A program created without a bank entry contributes
-- one back.
--
-- IT ARRIVES AS A DRAFT, ALWAYS
--
-- The bank populates other children's programs. A goal that lands in it
-- approved is a goal one clinician wrote for one child, offered to everybody
-- with the clinic's authority behind it. So a contributed entry is
-- status='draft': searchable and visible, flagged with where it came from, and
-- refused by the program picker until a supervisor approves it.
--
-- That is also why this is a trigger rather than a button. A button gets
-- pressed for the goals someone is proud of; the bank is more useful when it
-- reflects what the clinic actually does.
--
-- WHAT IT DOES NOT DO
--
--   * It does not copy a goal that came from the bank. `goal_bank_id` being
--     set means this program IS a bank entry already, and re-contributing it
--     would fill the bank with copies of itself.
--   * It does not carry the client's name, the client id, or anything else
--     specific to the child. A bank entry is a template; a definition reading
--     "Maya will request a break" is not reusable and puts one child's name
--     into every other child's goal picker.
--   * It does not deduplicate against existing entries. Near-duplicate
--     detection on clinical text is a judgement, and a trigger that silently
--     discards a clinician's goal because it looked similar to another is worse
--     than a short review list.

create or replace function public.programs_contribute_to_goal_bank()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entry uuid;
  v_name text;
  v_definition text;
begin
  -- Already from the bank: nothing to contribute.
  if new.goal_bank_id is not null then
    return new;
  end if;

  v_definition := btrim(coalesce(new.operational_definition, ''));
  v_name := btrim(coalesce(new.name, ''));

  -- Too thin to be worth reusing. A one-word goal in the bank is noise in
  -- every future search, and the clinician can still contribute it by editing
  -- the program into something replicable.
  if length(v_definition) < 25 or v_name = '' then
    return new;
  end if;

  insert into public.goal_bank_entries
    (clinic_id, name, domain, operational_definition, default_measurement_mode,
     default_mastery_criteria, default_prompt_level, status, assessment,
     assessment_source, needs_clinical_review, review_reason)
  values
    (new.clinic_id, v_name, coalesce(new.domain, 'Uncategorised'), v_definition,
     new.measurement_mode, new.mastery_criteria, new.prompt_level,
     'draft',
     'Mount Etna internal goal bank', 'internal',
     true,
     'contributed automatically from a client program; not yet reviewed for '
     || 'reuse across clients')
  returning id into v_entry;

  -- Point the program at what it produced, so the link reads the same way for
  -- a contributed goal as for one taken from the bank, and a supervisor
  -- reviewing the draft can see the program it came from.
  new.goal_bank_id := v_entry;
  return new;
end $$;

comment on function public.programs_contribute_to_goal_bank() is
  'A program written from scratch contributes a draft bank entry, so the '
  'clinic''s goal bank grows with the work instead of only at import. Draft, '
  'never approved: the bank populates other children''s programs, and one '
  'clinician''s goal for one child should not arrive there with the clinic''s '
  'authority behind it.';

drop trigger if exists programs_contribute_goal on programs;
create trigger programs_contribute_goal
  before insert on programs
  for each row execute function public.programs_contribute_to_goal_bank();

-- ---------------------------------------------------------------------------
-- The review queue for contributed goals
--
-- Without somewhere to see these, the trigger quietly grows a pile of drafts
-- nobody looks at, which is worse than not collecting them.
-- ---------------------------------------------------------------------------
create or replace view goal_bank_review_queue with (security_invoker = true) as
select
  e.id,
  e.clinic_id,
  e.code,
  e.name,
  e.domain,
  e.sub_domain,
  e.operational_definition,
  e.original_definition,
  e.default_mastery_criteria,
  e.review_reason,
  e.status,
  e.created_at,
  -- How many clients are already working on this, which is the strongest
  -- signal that a contributed goal is worth approving for everyone.
  (select count(*)::int from programs p where p.goal_bank_id = e.id) as programs_using
from goal_bank_entries e
where e.needs_clinical_review or e.status = 'draft';

comment on view goal_bank_review_queue is
  'Bank entries a supervisor still has to look at: contributed from client '
  'programs, drafted during import, or flagged because their definition is not '
  'observable or not replicable.';
