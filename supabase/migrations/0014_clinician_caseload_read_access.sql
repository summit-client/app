-- ============================================================================
-- Clinician/supervisor read access to clients + sessions - the "empty
-- caseload" gap.
--
-- apps/data (the clinician portal) reads `clients` and `sessions` directly
-- for the caseload list and today's schedule
-- (apps/data/lib/data.ts getClients() / getTodaySessions(), plus
-- apps/data/lib/server/retriever.ts's single-client lookup). Migration 0013
-- added clinic_id + RLS to both tables but deliberately preserved their
-- *existing* access exactly - which was admin/scheduler only
-- (auth_is_scheduling_staff()) - because that migration's scope was the
-- clinic-boundary retrofit, not a permissions redesign. The practical effect:
-- clinician and supervisor accounts have never had any database access to
-- either table. `select policyname, roles, cmd from pg_policies where
-- tablename in ('clients','sessions')` shows only admin/scheduler
-- (*_staff_select, via auth_is_scheduling_staff()) and each person's own row
-- (clients: user_id = auth.uid(); sessions: a staff/clients join, both
-- untouched from before 0013). Nothing there admits clinician or supervisor.
-- A clinician's getClients() call therefore returns a plain, RLS-filtered
-- empty array - indistinguishable in the UI from "no clients", which is
-- exactly the reported "empty caseload" symptom.
--
-- Every other clinical table clinician/supervisor already read
-- (programs, session_records, session_notes, behaviour_incidents, ... - see
-- migration 0001) is clinic-wide for any auth_is_staff() role, not scoped to
-- a specific clinician's assigned clients: there is no clinician-to-client
-- assignment concept anywhere in this schema to scope to instead. This
-- migration adds the same clinic-wide, read-only shape to clients and
-- sessions rather than inventing a caseload/assignment model unilaterally.
-- If per-clinician caseload restriction becomes a real product requirement,
-- it needs its own assignment table and is a bigger change than an RLS
-- policy add - flagged in docs/context/product.md, not attempted here.
--
-- Read-only and additive: apps/data never inserts/updates/deletes `clients`
-- or `sessions` (only .select() calls against either table, grep-confirmed),
-- so no write policy is added. Multiple permissive select policies on the
-- same table OR together in Postgres, so this does not touch or narrow the
-- admin/scheduler policies migration 0013 already created.
-- ============================================================================

create policy clients_clinical_staff_select on clients for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy sessions_clinical_staff_select on sessions for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
