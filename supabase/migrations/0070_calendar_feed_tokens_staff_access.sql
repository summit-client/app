-- 0070 · calendar_feed_tokens: admit scheduling staff, not just families
--
-- Migration 0044 built calendar_feed_tokens (a revocable bearer-token
-- webcal:// subscription) for apps/client only - its own header says so
-- explicitly ("this feature has no staff side at all") and every policy
-- hardcodes `auth_role() = 'client'`. This migration is the deliberate,
-- approved close of that gap: clinician/scheduler/admin users get the same
-- feature in apps/scheduler (their own personal, upcoming-sessions-only
-- feed - see apps/scheduler/pages/api/calendar/feed/[token].ics.ts), not a
-- clinic-wide schedule. The family side is untouched: every existing
-- `auth_role() = 'client'` clause below is kept exactly as-is, only `or`-ed
-- with a second clause admitting staff, never narrowed or replaced.
--
-- WHICH HELPER, AND WHY NEITHER ONE ALONE WAS RIGHT
--
-- Two candidate helpers exist, and it would have been a mistake to reach for
-- either of them alone without reading both definitions first:
--
--   auth_is_staff()           (migration 0001) - auth_role() in
--                              ('admin','supervisor','clinician')
--                              NO 'scheduler'.
--   auth_is_scheduling_staff() (migration 0013) - auth_role() in
--                              ('admin','scheduler')
--                              NO 'supervisor', NO 'clinician'.
--
-- The feature this migration exists for is explicitly for "scheduler staff
-- (clinician/scheduler/admin)" - a set neither helper covers on its own.
-- auth_is_staff() would silently exclude scheduler (who very much books and
-- works sessions in this app); auth_is_scheduling_staff() would silently
-- exclude clinician (who, since migration 0046, has full read/write parity
-- in apps/scheduler for their own sessions) and supervisor (a clinical role,
-- also schedulable via employment_records/staff). Using ONE of these two
-- helpers here - matching either by name alone without checking what it
-- actually admits - would have reopened exactly the "renders and shows
-- nothing" trap CLAUDE.md warns about (RLS returns empty sets, not errors):
-- a clinician or scheduler would pass apps/scheduler's own role gate,
-- reach the "My calendar feed" panel, and have every insert/select silently
-- rejected by RLS with no error surfaced.
--
-- So: both, OR-ed together. auth_is_staff() OR auth_is_scheduling_staff()
-- is exactly the union {admin, supervisor, clinician, scheduler} - every
-- non-client role this schema currently has except hr_admin/payroll_admin
-- (migration 0024's HR-only roles, which have no scheduling concept and are
-- correctly still excluded). This also means a supervisor is admitted here
-- even though @summit/portals' ACCESS.scheduler does not currently route
-- supervisors into apps/scheduler at all - harmless (no route reaches this
-- table for them today) and arguably correct (a supervisor is exactly the
-- kind of clinical role that can hold a staff_id via employment_records),
-- but worth a human double-checking if apps/scheduler's own access list
-- ever changes.
--
-- create policy ... or replace is not valid Postgres, so each of the three
-- policies 0044 defined is dropped and recreated rather than altered in
-- place - same mechanics 0022's hub_can_manage() widening used for its own
-- role-admission change, just at the policy level instead of the function
-- level.
--
-- clinic_id scoping on insert is kept byte-for-byte as 0044 wrote it
-- (`clinic_id = public.auth_clinic_id()`) - this migration only widens WHO
-- may act, never how the row is scoped once they do.
--
-- NOT APPLIED as of this migration file being written - same as 0044 itself
-- (see that migration's own header): a human with database access needs to
-- run this, same read-only-MCP constraint as before.
-- ============================================================================

drop policy if exists calendar_feed_tokens_select on calendar_feed_tokens;
create policy calendar_feed_tokens_select on calendar_feed_tokens for select
  using (
    (public.auth_role() = 'client' or public.auth_is_staff() or public.auth_is_scheduling_staff())
    and user_id = auth.uid()
  );

drop policy if exists calendar_feed_tokens_insert on calendar_feed_tokens;
create policy calendar_feed_tokens_insert on calendar_feed_tokens for insert
  with check (
    (public.auth_role() = 'client' or public.auth_is_staff() or public.auth_is_scheduling_staff())
    and user_id = auth.uid()
    and clinic_id = public.auth_clinic_id()
  );

-- Revoking is still the only update this table ever needs (0044's header) -
-- unchanged reasoning, just widened the same way as select/insert above.
drop policy if exists calendar_feed_tokens_update on calendar_feed_tokens;
create policy calendar_feed_tokens_update on calendar_feed_tokens for update
  using (
    (public.auth_role() = 'client' or public.auth_is_staff() or public.auth_is_scheduling_staff())
    and user_id = auth.uid()
  )
  with check (
    (public.auth_role() = 'client' or public.auth_is_staff() or public.auth_is_scheduling_staff())
    and user_id = auth.uid()
  );

-- Still no delete policy - see 0044's header's "REVOKE IS AN UPDATE, NOT A
-- DELETE" (root CLAUDE.md: RLS policies are per-command, never `for all`;
-- deletes are denied by default across this schema and this migration does
-- not reopen that for either family or staff rows).
