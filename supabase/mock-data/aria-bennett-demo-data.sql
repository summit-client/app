-- ============================================================================
-- DEMO / MOCK DATA — not a schema migration, not numbered with the rest of
-- supabase/migrations/. This seeds fictional clinical content for exactly
-- one real client row (Aria Bennett, client_id = 1, Mount Etna) so the
-- client-portal work built against migration 0020 has something real to
-- render against. Clinic-specific and client-specific by design - do not
-- run this against a different environment without changing the client_id,
-- and do not treat this content as real: names, notes and progress figures
-- below are entirely invented for demonstration.
--
-- Depends on migration 0020 (client-scoped RLS on programs/session_notes)
-- to actually be visible from the client portal - run 0020 first.
--
-- Requires the clinic to have at least one profiles row with role =
-- 'clinician' to satisfy programs.created_by / session_notes.clinician_id's
-- not-null FK - the subquery below picks whichever one exists rather than
-- needing a specific id pasted in.
--
-- Originally also accepted 'supervisor' here - dropped after confirming
-- live that 'supervisor' is not actually a member of the user_role enum
-- (`select enumlabel from pg_enum where enumtypid = 'user_role'::regtype`
-- returns admin/scheduler/clinician/client/staff only), so `role in
-- ('clinician','supervisor')` raised 22P02 (invalid input value for enum)
-- before ever reaching a real row - not a "no supervisor exists" case, a
-- "that value can't exist yet" case. Separate, real gap from this script:
-- invite-teammate would fail the same way for an actual supervisor invite,
-- and every auth_role() = 'supervisor' check in this schema's RLS is
-- currently unreachable dead code, not merely unused. Not this script's
-- job to fix - flagged for the product owner to decide whether/when to
-- `alter type user_role add value 'supervisor'`.
-- ============================================================================

do $$
declare
  v_clinic_id uuid := 'ee78d13c-eec9-4512-98bc-d00bca2d08c9';
  v_client_id bigint := 1; -- Aria Bennett
  v_clinician_id uuid;
  v_session_signed bigint;
  v_session_countersigned bigint;
  v_session_draft bigint;
  v_program_requesting uuid;
  v_program_imitation uuid;
begin
  select id into v_clinician_id
  from profiles
  where clinic_id = v_clinic_id and role = 'clinician'
  limit 1;

  if v_clinician_id is null then
    raise exception 'No clinician profile found for clinic %; cannot seed demo data (session_notes.clinician_id and programs.created_by both require one).', v_clinic_id;
  end if;

  -- Three distinct real past sessions for Aria, oldest-picked-last so the
  -- "signed" one reads as the most recent write-up.
  select id into v_session_draft
  from sessions
  where client_id = v_client_id and status <> 'cancelled' and session_date <= current_date
  order by session_date desc, hour desc, minute desc
  offset 0 limit 1;

  select id into v_session_countersigned
  from sessions
  where client_id = v_client_id and status <> 'cancelled' and session_date <= current_date
  order by session_date desc, hour desc, minute desc
  offset 1 limit 1;

  select id into v_session_signed
  from sessions
  where client_id = v_client_id and status <> 'cancelled' and session_date <= current_date
  order by session_date desc, hour desc, minute desc
  offset 2 limit 1;

  if v_session_signed is null then
    raise exception 'Client % does not have 3 distinct past, non-cancelled sessions; cannot seed 3 session_notes rows (session_notes.session_id is unique per session).', v_client_id;
  end if;

  -- ---- Goals (programs) ----------------------------------------------------
  insert into programs (
    clinic_id, client_id, name, domain, measurement_mode, operational_definition,
    mastery_pct, mastery_consecutive, prompt_level, target_direction, status, created_by
  ) values (
    v_clinic_id, v_client_id, 'Requesting preferred items', 'Expressive communication', 'frequency',
    'Aria independently vocalizes or signs a request for a preferred item or activity within 5 seconds of it being visible/available.',
    80, 3, 'independent', 'increase', 'active', v_clinician_id
  ) returning id into v_program_requesting;

  insert into programs (
    clinic_id, client_id, name, domain, measurement_mode, operational_definition,
    mastery_pct, mastery_consecutive, prompt_level, target_direction, status, created_by
  ) values (
    v_clinic_id, v_client_id, 'Motor imitation (gross motor)', 'Imitation', 'dtt',
    'Aria imitates a modeled gross-motor action (clap, wave, stomp) within 3 seconds of the model.',
    80, 3, 'gestural', 'increase', 'mastered', v_clinician_id
  ) returning id into v_program_imitation;

  insert into programs (
    clinic_id, client_id, name, domain, measurement_mode, operational_definition,
    mastery_pct, mastery_consecutive, prompt_level, target_direction, status, created_by
  ) values (
    v_clinic_id, v_client_id, 'Turn-taking in a 2-person game', 'Social skills', 'task_analysis',
    'Aria waits for her turn and hands the item/game piece to her partner without physical prompting across the full sequence.',
    80, 3, 'model', 'increase', 'active', v_clinician_id
  );

  -- ---- SOAP notes (session_notes) - the family-facing "reports" ------------
  -- One draft (must NOT be visible via the new client-scoped policy - it
  -- exists on purpose to prove the status gate actually excludes it).
  insert into session_notes (
    clinic_id, session_id, client_id, clinician_id, status, body
  ) values (
    v_clinic_id, v_session_draft, v_client_id, v_clinician_id, 'draft',
    jsonb_build_object(
      'summary', 'Draft - session summary not yet finalized.',
      'perProgram', jsonb_build_array(),
      'abcNarrative', null,
      'familyUpdate', 'Draft - not yet reviewed.',
      'planNext', null
    )
  );

  -- One countersigned (supervisor-approved) - should be visible.
  insert into session_notes (
    clinic_id, session_id, client_id, clinician_id, status, signed_at,
    countersigned_by, countersigned_at, body
  ) values (
    v_clinic_id, v_session_countersigned, v_client_id, v_clinician_id, 'countersigned',
    now() - interval '5 days', v_clinician_id, now() - interval '4 days',
    jsonb_build_object(
      'summary', 'Good engagement throughout the session. Aria was regulated and participated in all planned activities.',
      'perProgram', jsonb_build_array(
        jsonb_build_object('program', 'Requesting preferred items', 'trials', 12, 'correct', 9, 'pct', 75),
        jsonb_build_object('program', 'Turn-taking in a 2-person game', 'trials', 6, 'correct', 4, 'pct', 67)
      ),
      'abcNarrative', null,
      'familyUpdate', 'Aria had a great session today! She is getting much more consistent at asking for the toys she wants using her words, and she practiced taking turns in a board game with her clinician.',
      'planNext', 'Continue targeting requesting across more novel items; introduce a second play partner for turn-taking.'
    )
  );

  -- One signed (clinician-signed, no countersign required for this note
  -- type) - should be visible, most recent.
  insert into session_notes (
    clinic_id, session_id, client_id, clinician_id, status, signed_at, body
  ) values (
    v_clinic_id, v_session_signed, v_client_id, v_clinician_id, 'signed',
    now() - interval '1 day',
    jsonb_build_object(
      'summary', 'Strong session. Gross motor imitation goal formally reviewed for mastery this session.',
      'perProgram', jsonb_build_array(
        jsonb_build_object('program', 'Motor imitation (gross motor)', 'trials', 10, 'correct', 9, 'pct', 90),
        jsonb_build_object('program', 'Requesting preferred items', 'trials', 10, 'correct', 8, 'pct', 80)
      ),
      'abcNarrative', null,
      'familyUpdate', 'Wonderful progress today - Aria has now met her mastery criteria for gross motor imitation across the last 3 sessions! We will be moving on to a new imitation target next week. Requesting also continues to improve.',
      'planNext', 'Retire gross motor imitation to maintenance; introduce fine motor imitation targets.'
    )
  );
end $$;
