-- 0091: an audit row must name the person who wrote it
--
-- WHAT IS WRONG
--
-- Three audit tables accept an INSERT on the clinic alone and never check who
-- the row claims to be from. Live policies today:
--
--   hub_audit_events.hub_audit_write        with check (clinic_id = auth_clinic_id())
--   hr_audit_log.hr_audit_write             with check (clinic_id = auth_clinic_id())
--   clinical_audit_events.audit_write       with check (clinic_id = auth_clinic_id() and auth_is_staff())
--
-- Each table carries an actor column. Nothing ties it to the caller, so any
-- member of the clinic can file an audit event under a colleague's name — and
-- an audit log that can be written in somebody else's name is worse than no
-- audit log, because it is believed.
--
-- The precedent is already in this schema. Migration 0012 gave settings_audit
-- `with check (clinic_id = auth_clinic_id() and actor = auth.uid())` for
-- exactly this reason. These three never got the same treatment.
--
-- clinical_audit_events is included although no investigator flagged it: it
-- has the same gap, names its column actor_id, and holds zero rows today.
--
-- WHAT THIS CHANGES
--
-- One conjunct per policy. Everything else is preserved exactly, including
-- clinical_audit_events' auth_is_staff() requirement.
--
-- The actor columns are all NULLABLE, so a strict `actor = auth.uid()` also
-- refuses an insert that omits the actor entirely. That is deliberate — an
-- unattributed audit row is not much of an audit row — and it is safe here:
-- production holds 237 rows across the three tables and NOT ONE has a null
-- actor, so nothing that writes today is relying on omitting it. A future
-- writer that does will fail loudly at the insert rather than quietly file an
-- anonymous row.
--
-- WHAT DOES NOT CHANGE
--
-- Reading. These are write policies only; who may read the audit trail is
-- untouched.
--
-- HOW TO VERIFY
--
--   As a non-admin clinic member, with <colleague> some other user's id:
--     insert into hub_audit_events (clinic_id, actor, subject, ...)
--     values (auth_clinic_id(), '<colleague>', ..., ...);
--   Succeeds today. Must fail with 42501 after this runs.
--
--   The same insert naming yourself as actor must still succeed, and the
--   Admin console's own writes (apps/employee/lib/hub-backend.ts and
--   lib/hr-backend.ts both already set actor to the caller) must be unaffected.
--
--   node supabase/tests/tenancy.mjs supabase/migrations
--   node apps/employee/qa.mjs

drop policy if exists hub_audit_write on public.hub_audit_events;
create policy hub_audit_write on public.hub_audit_events
  for insert
  with check (clinic_id = public.auth_clinic_id() and actor = auth.uid());

drop policy if exists hr_audit_write on public.hr_audit_log;
create policy hr_audit_write on public.hr_audit_log
  for insert
  with check (clinic_id = public.auth_clinic_id() and actor = auth.uid());

drop policy if exists audit_write on public.clinical_audit_events;
create policy audit_write on public.clinical_audit_events
  for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and public.auth_is_staff()
    and actor_id = auth.uid()
  );

comment on policy hub_audit_write on public.hub_audit_events is
  'An audit row names the caller (0091). Filing one under a colleague''s name '
  'was possible on the clinic check alone, which makes the log unreliable '
  'exactly where it matters. Mirrors settings_audit_write (0012).';
