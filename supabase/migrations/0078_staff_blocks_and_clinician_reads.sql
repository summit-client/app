-- ============================================================================
-- 0078 · Staff-only calendar blocks, and the two reads a clinician was never
--        granted.
--
-- Two unrelated-looking changes that are really the same story: things the
-- scheduler portal's UI offers, that the database refuses.
--
-- ----------------------------------------------------------------------------
-- 1. A clinician cannot read `locations` or `session_types` at all.
-- ----------------------------------------------------------------------------
-- Migration 0013 replaced this schema's old blanket policies with per-command
-- ones and, for these two tables, wrote the non-admin read as:
--
--     auth_role() in ('scheduler','client')
--
-- which was correct at the time: `ACCESS.scheduler` admitted admin and
-- scheduler only, so no clinician could reach the portal that reads them.
-- Migration 0046 then admitted clinicians to the scheduler portal without
-- revisiting these two policies, and nothing since has widened them.
--
-- THAT LAST SENTENCE IS WRONG, and was found to be wrong by introspecting
-- production on 2026-09-18, after this file had already been applied there.
-- 0046 DID widen them - not by editing `locations_read`/`session_types_read`,
-- which is where this file looked, but by adding a second policy to each
-- table (`locations_clinical_staff_select` and
-- `session_types_clinical_staff_select`, both `clinic_id = auth_clinic_id()
-- and auth_is_staff()`, at 0046 lines 122-126). Permissive SELECT policies OR
-- together, so clinicians and supervisors could already read both tables.
--
-- What that means for section 1 below: it is REDUNDANT, not harmful. The
-- widened `locations_read`/`session_types_read` is a strict superset of what
-- 0013 wrote, so applying it takes nothing away, and it overlaps a grant that
-- was already there. The symptom described below - a clinician's empty
-- location and session-type filters - was therefore NOT caused by these
-- policies on this database, and if that symptom is still being reported the
-- cause is somewhere else and this file is not the fix. Section 2 is the part
-- of this migration that does real work.
--
-- Recorded rather than deleted, for the same reason 0077 carries the same
-- kind of note: this is the second time in one evening that a migration in
-- this repo reasoned from the migration history instead of from the deployed
-- schema and got the premise wrong. Read `pg_policies` first.
--
-- The result is the failure mode CLAUDE.md warns about by name - RLS returns
-- empty sets, not errors. A clinician opening the Calendar tab gets zero
-- locations and zero session types back, so the location filter is empty, the
-- session-type filter is empty, every session's location renders as "—", and
-- every duration lookup silently falls back to the hardcoded 60-minute
-- default. Nothing errors. It reads as "the calendar is broken for me".
--
-- Supervisor is included here for the same reason 0046's own policies name
-- it: supervisory read is clinic-wide everywhere else in this schema, and a
-- supervisor who is later admitted to this portal should not rediscover this
-- bug. Neither role gains any WRITE access - the admin-only insert/update/
-- delete policies from 0013 are untouched.
--
-- ----------------------------------------------------------------------------
-- 2. A session with no client cannot be inserted, so Break/Lunch/Meeting are
--    uncreatable.
-- ----------------------------------------------------------------------------
-- Migration 0019 added `session_types.is_client_optional` and seeded Break,
-- Lunch and Meeting per clinic, describing them in its own header as
-- "clinician-only blocks on the calendar, not client sessions". `sessions
-- .client_id` is nullable precisely so those can exist.
--
-- They have never been insertable. 0016's clinic-consistency trigger reads:
--
--     select clinic_id into v_client_clinic from clients where id = new.client_id;
--     if v_client_clinic is distinct from new.clinic_id then raise ...
--
-- With a null client_id the SELECT matches no row, v_client_clinic stays
-- null, and `null is distinct from <a real uuid>` is TRUE - so the trigger
-- raises on exactly the rows it was never meant to police. The employee_id
-- and calendar_id branches immediately below it already guard for null; the
-- client branch simply never got the same guard. This adds it, leaving the
-- actual cross-clinic check identical for every row that HAS a client.
--
-- This is what makes a staff-only block bookable, and it is a prerequisite
-- for the scheduler's new "Block time" flow. Reverting it makes that flow
-- fail at the database with a confusing clinic-mismatch error rather than a
-- "you cannot do that" - which is how it read before.
--
-- Deliberately NOT done here: nothing forces a clientless session to BE a
-- client-optional type. The database now permits any session to omit a
-- client; the app is what only offers it for types flagged
-- is_client_optional. A constraint tying the two together would also have to
-- account for `sessions.type` being a denormalized text copy of
-- session_types.name (0000), which can disagree with the catalogue after a
-- rename - a footgun worth more than the invariant is.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clinician/supervisor reads
-- ---------------------------------------------------------------------------
drop policy if exists locations_read on locations;
create policy locations_read on locations for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('scheduler', 'client', 'clinician', 'supervisor'));

drop policy if exists session_types_read on session_types;
create policy session_types_read on session_types for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('scheduler', 'client', 'clinician', 'supervisor'));

-- ---------------------------------------------------------------------------
-- 2. Allow a session with no client
--
-- Replaces 0016's function in place. Every other branch is byte-identical to
-- 0016's - only the client branch gains the `is not null` guard its two
-- siblings already had. `set search_path = public, pg_temp` is carried over
-- unchanged and pg_temp stays LAST (CLAUDE.md: `set search_path = public`
-- alone does not exclude pg_temp, and temp-table shadowing was a real
-- exploit on this schema, fixed in 0009).
-- ---------------------------------------------------------------------------
create or replace function enforce_sessions_clinic_consistency() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_client_clinic uuid;
declare v_staff_clinic uuid;
declare v_calendar_clinic uuid;
begin
  if new.client_id is not null then
    select clinic_id into v_client_clinic from clients where id = new.client_id;
    if v_client_clinic is distinct from new.clinic_id then
      raise exception 'session clinic_id (%) does not match its client''s clinic (%)', new.clinic_id, v_client_clinic;
    end if;
  end if;

  if new.employee_id is not null then
    select clinic_id into v_staff_clinic from staff where id = new.employee_id;
    if v_staff_clinic is distinct from new.clinic_id then
      raise exception 'session clinic_id (%) does not match its staff member''s clinic (%)', new.clinic_id, v_staff_clinic;
    end if;
  end if;

  if new.calendar_id is not null then
    select clinic_id into v_calendar_clinic from calendars where id = new.calendar_id;
    if v_calendar_clinic is distinct from new.clinic_id then
      raise exception 'session clinic_id (%) does not match its calendar''s clinic (%)', new.clinic_id, v_calendar_clinic;
    end if;
  end if;

  return new;
end $$;
