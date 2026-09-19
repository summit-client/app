-- ============================================================================
-- 0088 · A signed session note is what says a session happened
--
-- WHAT IS WRONG TODAY
--
-- Nothing in this system ever sets `sessions.status = 'completed'`. Measured
-- on production 2026-09-19: 2085 sessions, all `scheduled`, none completed,
-- none cancelled, none no-show.
--
-- Two things read that column and both are therefore dead:
--
--   * the scheduler Dashboard's "No-show rate" divides by `completed +
--     no_show`, so it divides by zero;
--   * `derive_pending_session_deliveries()` (0031, gated by 0081) only
--     processes `ses.status = 'completed'`, so it has never derived anything.
--     `time_entries` is empty - of any source, not just 'session'.
--
-- So the billing chain (session -> time entry -> budget charge -> the receipt
-- that carries a clinician's GOOD_STANDING credential number, 0034) has never
-- run, because its first link was never written.
--
-- THE DECISION (account owner, 2026-09-19)
--
--   "completed session notes are what mark a session as complete. Sessions
--    can be cancelled and marked no show, but notes on a session are the
--    final and true confirmation"
--
-- So completion is an explicit human act, and writing the note IS that act -
-- there is no separate button. The alternative considered and rejected was
-- deriving completion from the clock (end time passed, not cancelled), which
-- would have had the system assert that a session happened on a record that
-- later bills a family.
--
--   "Signing alone releases billing. That may change in the future but for
--    now it's the right decision."
--
-- So this fires on `signed`, not on `countersigned`. Countersigning is a
-- supervision control over the note's CONTENT (0043 gates that transition to
-- supervisor/admin); it is not a second opinion on whether the session
-- occurred, and not every note gets one - gating on it would leave a senior
-- clinician's sessions never completing at all.
--
-- WHAT THIS DOES
--
--   1. A note entering a confirmed state (signed / awaiting_countersign /
--      countersigned) marks its session `completed`.
--   2. A note leaving that state - back to draft, or `returned` by a
--      supervisor, or deleted - puts the session back to `scheduled`. A
--      returned note is the supervisor saying the record is not right yet,
--      and a session should not stay billable on a withdrawn note.
--   3. `cancelled` and `no_show` are never overwritten. Those are deliberate
--      human statements that the session did not happen. A note on such a
--      session is REFUSED, not silently reclassified.
--   4. The note's clinic must equal the session's. Every step checks the
--      clinic; that is doctrine here, not a precaution.
--
-- APPLIED LIVE 2026-09-19, on the account owner's approval. Inert on arrival:
-- zero notes exist, so no session changed status and nothing became
-- derivable. Exercised against production inside rolled-back transactions
-- rather than reasoned about - signing a note on a real scheduled session set
-- it to `completed` and made it selectable by 0031's own predicate; returning
-- the note put it back to `scheduled`; signing against a cancelled session was
-- refused with '23514: session 2514 is marked cancelled'. Afterwards: 0 notes,
-- 0 non-scheduled sessions, 0 time entries - production untouched.
--
-- ONE PERSON, ONE NOTE: `session_notes_session_id_key` is unique on
-- `session_id`, so a session has at most one note and the reversal in (2)
-- never has to ask whether some other note still confirms it. If that index
-- is ever dropped, this function needs to change with it.
--
-- WHO CAN MAKE A SESSION BILLABLE, stated plainly because this migration is
-- what gives it consequence: `session_notes_staff_write` admits any staff
-- member of the clinic writing a note for any `session_id`, and
-- `session_notes_staff_update` lets any staff member of the clinic update any
-- note. That is within a clinic, not across clinics - the tenancy boundary
-- holds - but "which staff member may confirm which session" is not
-- constrained today. Raised separately rather than widened here.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- security definer, deliberately.
--
-- The alternative is letting this UPDATE run as the caller, under the
-- `sessions` policies. That fails in the worst available way: RLS filters
-- rather than raising, so a blocked update would change zero rows, the note
-- would sign happily, and the session would silently never complete. Nobody
-- would see it - which is this schema's oldest trap.
--
-- The boundary is therefore inside the function: it only ever touches the one
-- session the note names, and only after the clinic check below. Schema-
-- qualified throughout with pg_temp named last, per 0009.
-- ---------------------------------------------------------------------------
create or replace function public.apply_session_note_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note        record;
  v_session     record;
  v_now_conf    boolean;
  v_was_conf    boolean;
begin
  -- The row that matters: NEW on insert/update, OLD on delete.
  if tg_op = 'DELETE' then v_note := old; else v_note := new; end if;

  -- A note with no session to point at confirms nothing. There is no foreign
  -- key on session_notes.session_id (checked 2026-09-19), so this is reachable.
  if v_note.session_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_now_conf := tg_op <> 'DELETE'
                and new.status in ('signed', 'awaiting_countersign', 'countersigned');
  v_was_conf := tg_op = 'UPDATE'
                and old.status in ('signed', 'awaiting_countersign', 'countersigned');
  if tg_op = 'DELETE' then
    v_was_conf := old.status in ('signed', 'awaiting_countersign', 'countersigned');
  end if;

  -- Nothing crossed the line: draft -> draft, or signed -> countersigned.
  -- Leave the session alone rather than rewriting it to the value it holds.
  if v_now_conf = v_was_conf then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select s.id, s.status, s.clinic_id
    into v_session
    from public.sessions s
   where s.id = v_note.session_id;

  if not found then
    raise exception 'session note % points at session %, which does not exist',
      v_note.id, v_note.session_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Doctrine: every step names the clinic.
  if v_session.clinic_id is distinct from v_note.clinic_id then
    raise exception 'a session note cannot confirm a session in another clinic'
      using errcode = 'insufficient_privilege';
  end if;

  if v_now_conf then
    -- A human already said this session did not happen. Refuse rather than
    -- quietly turning their statement into a billable delivery.
    if v_session.status in ('cancelled', 'no_show') then
      raise exception
        'session % is marked %, so a note cannot confirm it happened',
        v_session.id, v_session.status
        using errcode = 'check_violation';
    end if;
    update public.sessions set status = 'completed' where id = v_session.id;
  else
    -- Only undo what this mechanism did. A session someone has since
    -- cancelled stays cancelled.
    if v_session.status = 'completed' then
      update public.sessions set status = 'scheduled' where id = v_session.id;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

comment on function public.apply_session_note_completion() is
  'A signed session note marks its session completed; withdrawing the note '
  'reverses it. See 0088 - this is the first link of the billing chain.';

drop trigger if exists session_notes_complete_session on public.session_notes;
create trigger session_notes_complete_session
  after insert or update or delete on public.session_notes
  for each row execute function public.apply_session_note_completion();

commit;

-- ============================================================================
-- NOT DONE HERE, deliberately:
--
--   * The 47 sessions already in the past (earliest 2026-09-17) will never
--     get a note and stay `scheduled` forever. Left as-is on the account
--     owner's instruction - they are dummy entries.
--   * `session_notes.session_id` has no foreign key to `sessions`, so a note
--     can name a session that does not exist. The function above refuses that
--     case rather than ignoring it, but the constraint belongs in the schema.
--   * `sessions.status` has no CHECK constraint, so any string is writable.
--     'completed' needed no migration for that reason, and the same gap means
--     a typo elsewhere would go in silently.
-- ============================================================================
