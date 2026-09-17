-- ============================================================================
-- 0080 · The two gaps production still carries after 0077/0078/0079
--
-- Both were found by introspecting the live database on 2026-09-18, not by
-- reading this repo's migration history - which, as 0077's and 0078's headers
-- now record, disagrees with what is deployed.
--
-- ----------------------------------------------------------------------------
-- 1. Clinicians and supervisors read ZERO clients.
-- ----------------------------------------------------------------------------
-- Migration 0014 was never applied to production. Its two policies -
-- clients_clinical_staff_select and sessions_clinical_staff_select - are both
-- absent from pg_policies, and nothing in this repo drops them.
--
-- 0077 has since handled `sessions`, deliberately and in a different shape
-- (own-rows plus a masked occupancy function, rather than 0014's blanket
-- clinic-wide read). `clients` still needs 0014's original grant, so this
-- restores THAT HALF AND ONLY THAT HALF.
--
-- DO NOT apply migration 0014 in full to fix this. Its sessions half would
-- hand every clinician clinic-wide SELECT on `sessions` again, silently
-- undoing 0077 - multiple permissive SELECT policies OR together, so the
-- narrow policy 0077 created would still be there, still correct, and
-- completely irrelevant. Nothing would visibly break to tell you.
--
-- Why clinic-wide rather than a caseload scope: unchanged from 0014's own
-- reasoning. This schema has no clinician-to-client assignment model, every
-- other clinical table (programs, session_records, session_notes,
-- behaviour_incidents - migration 0001) is already clinic-wide for any
-- auth_is_staff() role, and apps/data's getClients() must resolve ANY client
-- in the clinic (app/clients/[id]/layout.tsx). Inventing an assignment model
-- here would be an architectural decision, not a bug fix.
--
-- Read-only and additive. No write policy: apps/data only ever .select()s
-- this table.
--
-- ----------------------------------------------------------------------------
-- 2. staff.user_id is null for every existing staff member.
-- ----------------------------------------------------------------------------
-- 0075 added the column and invite-teammate sets it for people invited AFTER
-- that shipped. Nobody backfilled the people who were already there, so on
-- production it is null for all 13 staff accounts. Everything keyed on it is
-- therefore dead for every existing person:
--
--   * staff_self_select (0075)        - nobody can see their own staff row
--   * staff_availability own-row RLS  - nobody can edit their own availability
--   * the self-edit guard trigger     - nobody can edit their own contact
--     (0076)                            details
--   * "Staff can read own sessions"   - the pre-history policy matches nothing
--
-- 0075 declined to backfill, and was right to, because the backfill it had in
-- mind was matching a login to a pre-existing staff row BY NAME. This is not
-- that. `employment_records` already carries the link explicitly - it is the
-- same join 0046 uses to decide who may write a session and 0077's
-- auth_staff_id() uses to decide who may read one. Reading a relation that
-- already exists is not guesswork.
--
-- Written to refuse rather than guess wherever the link is not 1:1:
--
--   * only staff rows whose user_id is still null are touched;
--   * one candidate per user (latest open employment record wins) so a person
--     with two open records cannot produce two claims;
--   * any staff row that more than one user claims is SKIPPED entirely
--     rather than resolved arbitrarily;
--   * a user already attached to some other staff row is skipped.
--
-- Anything skipped stays null and keeps today's behaviour. It does not
-- half-link anyone. staff_user_id_unique (0075) is the backstop if this
-- reasoning is somehow wrong - the statement would fail rather than corrupt
-- the mapping.
--
-- Idempotent: re-running updates nothing, because every row it would touch
-- now has a non-null user_id.
--
-- AFTER RUNNING, check what it could not link:
--
--   select s.id, s.name from staff s where s.user_id is null;
--   select p.id, p.role from profiles p
--    where p.role in ('clinician','supervisor','admin','scheduler')
--      and not exists (select 1 from staff s where s.user_id = p.id);
--
-- Those people need an admin to link them by hand. Until then they can use
-- the portal but cannot edit their own profile or availability, and
-- sessions_visible() returns them fully masked occupancy.
--
-- ONE SIDE EFFECT, NAMED BECAUSE IT IS NOT OBVIOUS. Populating this column
-- also reactivates the pre-history policy "Staff can read own sessions", and
-- that policy has NO clinic predicate:
--
--   exists (select 1 from staff
--            where staff.id = sessions.employee_id
--              and staff.user_id = auth.uid())
--
-- So it returns a staff member's sessions by employee_id alone, across every
-- clinic. Today that is unreachable rather than safe: migration 0016's
-- enforce_sessions_clinic_consistency() trigger refuses to write a session
-- whose clinic_id disagrees with its staff member's, so no row can exist for
-- which the two differ. Confirmed in a scratch cluster by deliberately
-- creating such a row with the trigger absent - the clinician read it.
--
-- That makes a write-side trigger the only thing standing between this policy
-- and a cross-tenant read. It is not a tenant boundary, and it should not be
-- relied on as one. Narrowing the policy to add `clinic_id = auth_clinic_id()`
-- is the obvious fix and is deliberately NOT done here: it is a pre-history
-- policy this repo has never owned, this migration is already changing who
-- reads what, and the two changes should not land in one file where a
-- rollback of one is a rollback of both. Raised for its own change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. clients: 0014's grant, restored on its own
-- ---------------------------------------------------------------------------
drop policy if exists clients_clinical_staff_select on clients;
create policy clients_clinical_staff_select on clients for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

comment on policy clients_clinical_staff_select on clients is
  'Clinic-wide read of the client roster for admin, supervisor and clinician '
  '(auth_is_staff). Migration 0014 wrote this and was never applied to '
  'production; restored here on its own. 0014''s OTHER policy, '
  'sessions_clinical_staff_select, must NOT be applied - migration 0077 '
  'replaced it with a narrower own-rows policy plus sessions_visible(), and '
  'the blanket version would silently override that.';

-- ---------------------------------------------------------------------------
-- 2. staff.user_id: backfill from the employment_records link
-- ---------------------------------------------------------------------------
with candidate as (
  -- One per user: the most recent open, staff-linked employment record.
  select distinct on (er.user_id) er.user_id, er.staff_id
    from employment_records er
    join staff s on s.id = er.staff_id
   where er.end_date is null
     and er.staff_id is not null
     and er.user_id is not null
     and s.user_id is null
   order by er.user_id, er.start_date desc nulls last, er.id desc
),
unambiguous as (
  select c.user_id, c.staff_id
    from candidate c
   -- Refuse a staff row two different people claim.
   where (select count(*) from candidate c2 where c2.staff_id = c.staff_id) = 1
     -- Refuse a user already attached to some other staff row.
     and not exists (select 1 from staff s2 where s2.user_id = c.user_id)
)
update staff s
   set user_id = u.user_id
  from unambiguous u
 where s.id = u.staff_id
   and s.user_id is null;
