-- 0036 · hub_pd_records / hub_time_off_requests: manage-scoped SELECT
--
-- Migration 0006 gave hub_task_progress and hub_certificates a
-- "..._manage_select" SELECT policy (clinic-wide for admin, linked-team for a
-- supervisor, via hub_can_manage()) alongside their own-row SELECT policy -
-- but hub_pd_records and hub_time_off_requests only ever got the UPDATE half
-- of that pair (hub_pd_manage / hub_timeoff_manage). Neither table has ever
-- had a SELECT policy that lets a manager read someone else's row, only their
-- own (hub_pd_own / hub_timeoff_own). A supervisor or admin could therefore
-- already *decide* another employee's PD verification or time-off request
-- (the UPDATE policy allows it), but could never SEE one to decide on in the
-- first place - RLS returns an empty set, not an error, so a corrected client
-- query against either table would have silently shown nothing (CLAUDE.md's
-- "RLS returns empty sets, not errors" trap), which is exactly the bug this
-- was written to close before apps/employee's admin console queries either
-- table clinic-wide.
--
-- Shape matches hub_certs_manage_select / hub_progress_manage_select exactly:
-- one command (select, never `for all`), gated on
-- `clinic_id = auth_clinic_id() and hub_can_manage(user_id)`, using the same
-- hub_can_manage() helper (0006: admin sees the whole clinic, a supervisor
-- sees their linked team via profiles.supervisor_id) that the existing
-- UPDATE policies on these same two tables already use.
--
-- NOT YET APPLIED to the live database - the Supabase MCP configured for this
-- project is read-only by design (see CLAUDE.md's "Supabase access for
-- Claude sessions"). A human needs to run this migration.

create policy hub_pd_manage_select on hub_pd_records for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

create policy hub_timeoff_manage_select on hub_time_off_requests for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
