-- ============================================================================
-- 0020 · Client (family) portal read access to their own child's clinical
-- data — the first RLS grant the `client` role has ever had on anything in
-- the clinical schema (0001-0003). Confirmed live before this migration:
-- every policy on programs/session_records/trial_events/session_notes/
-- behaviour_incidents/mastery_evaluations/clinical_reports/evidence_packets
-- checks auth_is_staff(), with no client-role condition anywhere - a family
-- account got zero rows from any of them regardless of what existed.
--
-- Scope, as confirmed with the product owner: families see their own
-- child's GOALS (programs) and their own child's SIGNED session notes
-- (session_notes, called "SOAP notes" in this clinic's own vocabulary) -
-- nothing else. Explicitly staying staff-only: trial_events and
-- mastery_evaluations (clinical detail, not family-facing), behaviour_
-- incidents (ABC data - never shown to families), clinical_reports and
-- evidence_packets/ai_requests (a separate, unrelated reporting concept -
-- not what this clinic means by "reports"; still entirely unbuilt/unused,
-- so left untouched here). A signed_at IS NOT NULL check on session_notes
-- guards the family read directly in the policy, not left to the app layer
-- to filter correctly - a draft or awaiting-countersign note must never be
-- selectable by a family account even if a future UI bug forgot to filter
-- for status client-side.
-- ============================================================================

-- The child a signed-in client-role user is linked to, once - reused by both
-- policies below rather than repeating the same subquery inline twice.
-- Matches auth_clinic_id()/auth_role()/auth_is_staff()'s hardened shape from
-- migration 0009 exactly: pg_temp named last, every reference schema-
-- qualified, so search_path is not load-bearing - a temp table named
-- `clients` in the caller's own session cannot shadow the real one here.
create or replace function auth_client_row_id() returns bigint
language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.clients where user_id = auth.uid() $$;

drop policy if exists programs_client_read on programs;
create policy programs_client_read on programs for select
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id());

drop policy if exists session_notes_client_read on session_notes;
create policy session_notes_client_read on session_notes for select
  using (
    public.auth_role() = 'client'
    and client_id = public.auth_client_row_id()
    and status in ('signed', 'countersigned')
  );
