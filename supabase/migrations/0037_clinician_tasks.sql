-- 0037 · Clinician task list (apps/data)
--
-- A clinician-facing worklist inside apps/data (the CLINICIAN portal — not
-- apps/employee/MySummitHR, whose hub_* tables from migration 0006 are HR/
-- onboarding-shaped: employee_number, vsc_status, template task keys tied to
-- a hire date). This is clinical-shaped instead: sign-offs owed on a session
-- note, a note due for a session just delivered, a PD requirement coming due
-- — each item optionally points at a row in a different table (sessions,
-- session_notes, hub_pd_records) depending on task_type, so related_id is
-- left as free text rather than a single foreign key that could only ever
-- point at one of them.
--
-- Deliberately NOT built on hub_task_progress: that table's primary key is
-- (user_id, task_key) against a fixed onboarding template defined in
-- apps/employee/lib/content.ts, and its status vocabulary
-- (NOT_STARTED/AWAITING_SIGNOFF/...) is the onboarding workflow's, not a
-- general to-do's. Reusing it would mean either polluting the onboarding
-- template with clinical task keys or fighting its primary key to allow
-- multiple sign-offs of the same type. A new, lighter table is the smaller
-- surface.
--
-- This is a personal worklist, not a manager queue: every policy below reads
-- only the caller's own rows (clinician_user_id = auth.uid()). Unlike the
-- Admin console queues catalogued as still-open in CLAUDE.md — which read
-- clinic-wide and depend on a "..._manage_select" policy that two of the
-- four hub tables never got — this table has no manage/clinic-wide read
-- policy at all yet, on purpose: nothing in this change needs one. If a
-- supervisor-facing "my team's outstanding tasks" view is ever built on
-- this table, add that policy explicitly then and verify it the same way
-- this migration's own header asks you to verify this one — its existence
-- elsewhere is not evidence it exists here.
--
-- NOT applied by this session — Supabase MCP access here is read-only. A
-- human needs to run this against the project before the apps/data UI in
-- this same change has anything to read.

create table if not exists clinician_tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  clinician_user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null
    check (task_type in ('sign_off', 'note_due', 'pd_requirement', 'other')),
  -- Points at whatever row generated the task (a sessions.id, a
  -- session_notes.id, a hub_pd_records.id, ...). Left untyped rather than a
  -- single FK because the referenced table varies by task_type; the app
  -- layer is responsible for resolving it against the right table.
  related_id text,
  title text not null,
  status text not null default 'open' check (status in ('open', 'completed', 'dismissed')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clinician_tasks_owner_idx
  on clinician_tasks(clinician_user_id, status, due_date);
create index if not exists clinician_tasks_clinic_idx on clinician_tasks(clinic_id);

alter table clinician_tasks enable row level security;

-- Per command, never `for all` (see CLAUDE.md's Hard constraints) — delete
-- is intentionally left ungranted, same as the rest of this schema; a task a
-- clinician no longer wants is dismissed (status = 'dismissed'), not deleted.
create policy clinician_tasks_own_select on clinician_tasks for select
  using (clinic_id = auth_clinic_id() and clinician_user_id = auth.uid());

create policy clinician_tasks_own_update on clinician_tasks for update
  using (clinic_id = auth_clinic_id() and clinician_user_id = auth.uid())
  with check (clinic_id = auth_clinic_id() and clinician_user_id = auth.uid());

-- No insert policy: tasks are generated server-side (a future trigger or
-- service-role job off session/PD state, e.g. "note_due" when a session is
-- marked delivered with no matching session_notes row yet) rather than
-- self-reported by the clinician, so writes go through the service role,
-- which bypasses RLS entirely, same as every other generated-queue table in
-- this schema. Seed/demo rows for the dry run also go in with the service
-- role, never the anon key.
