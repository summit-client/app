-- ============================================================================
-- 0075 · staff.user_id — the missing link from a scheduler resource to the
-- login that owns it.
--
-- `staff` has never had this column. Two migrations disagree about that in
-- their own comments, and it's worth settling which one is right before
-- adding it:
--
--   - 0013's comment says `"Staff can read own record" (user_id =
--     auth.uid()) is untouched` - implying a real policy on `staff` already
--     used this column.
--   - 0046's header says the opposite, and shows its work: "'The caller's
--     own staff row' is NOT staff.user_id - that column does not exist
--     (confirmed against 0000's reconstruction of `staff`)."
--
-- 0046 is right. `0000_baseline_core_tables.sql`'s reconstruction of `staff`
-- has no `user_id` column, and neither 0013 nor anything after it ever adds
-- one - 0013's own comment names no CREATE POLICY for it, only mentions it
-- as pre-existing and untouched. That claim was never actually true against
-- this schema; it's stale carried-forward text, the same shape of gap
-- 0046 already corrected once for the sessions/employment_records case.
-- Recorded here rather than silently fixed, since two prior migrations
-- asserted it as fact.
--
-- WHY THIS MATTERS NOW: it's the blocker for automating "invite someone ->
-- their staff-side rows exist" without the risky part (matching a new login
-- to a PRE-EXISTING staff row by name). A brand-new `staff` row created *at
-- invite time*, with `user_id` set to that same new login's id, has nothing
-- to match - it's the row created for that person. See invite-teammate's
-- extension in this same change for where this is actually used.
-- ============================================================================

alter table staff add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column staff.user_id is
  'The portal login this scheduler resource belongs to, if any - set automatically when invite-teammate creates a staff row for a new hire. Nullable: a staff row can exist with no login (a contractor never invited to the portal), same reasoning as employment_records.staff_id being nullable in the other direction. On offboarding, unlink (set null) rather than delete the staff row - same "unlink, don''t delete" pattern CLAUDE.md documents for clients.user_id.';

-- One login, at most one staff row - mirrors employment_records_staff_unique
-- (one open employment per staff row) from the other direction.
create unique index if not exists staff_user_id_unique on staff(user_id) where user_id is not null;

-- The read half of the policy 0013's comment assumed already existed. Own
-- row only, select only - staff_admin_*/staff_scheduler_read (0013) and
-- staff_scheduler_read/staff_clinical_staff_select (0039/0046) already
-- cover every write path and every clinic-wide read; this just lets the
-- person the row is *about* see it too, which nothing granted them before
-- since the column itself didn't exist to key a policy on.
create policy staff_self_select on staff for select
  using (user_id = auth.uid());
