-- ============================================================================
-- 0038 · Home-program activities — the "between-session homework" a
-- clinician assigns a client's family, tied to that client's existing goals
-- (`programs`, migration 0001) where relevant rather than a parallel goal
-- concept. Two-sided by design: apps/data gets a clinician-facing assignment
-- UI (built separately), apps/client gets the family-facing read/mark-
-- progress UI this migration ships alongside (see pages/activities.tsx) -
-- both read and write this same table, scoped by the same RLS below.
--
-- goal_id is nullable: not every assigned activity maps to one specific
-- goal (e.g. general "practice waiting your turn at dinner" homework), so
-- this is an optional relationship, not a required one - matching how this
-- clinic's own domain grouping on pages/progress.tsx already treats an
-- unset domain as "Other" rather than requiring one.
--
-- clinic_id is NOT NULL here, unlike 0023's client_budgets (nullable there) -
-- CLAUDE.md's hard constraint is "every PHI table carries clinic_id... no
-- exceptions", and this is a new table with no legacy rows to backfill, so
-- there is no reason to leave the door open the way 0023 did.
-- ============================================================================

create table if not exists home_program_activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null references clients(id),
  goal_id uuid references programs(id),        -- optional: not every activity ties to one goal

  title text not null,
  description text,

  assigned_by uuid not null references profiles(id),   -- the clinician who assigned it
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed')),

  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists home_program_activities_client_idx on home_program_activities(client_id);
create index if not exists home_program_activities_clinic_idx on home_program_activities(clinic_id);
create index if not exists home_program_activities_goal_idx on home_program_activities(goal_id);

-- A family account may only ever change `status` (and, indirectly,
-- `completed_at`) on their own child's rows - never the title, description,
-- goal link, who assigned it, or reassign it to a different child. RLS's
-- USING/WITH CHECK below scope which ROWS a client can touch; this trigger
-- is the column-level backstop, since this schema otherwise leaves table
-- privileges at Supabase's default (full grant to `authenticated`, RLS is
-- the enforcement layer - see: no `grant` statements anywhere else in this
-- migration history) rather than restricting by column grant. Also derives
-- completed_at server-side instead of trusting whatever timestamp the
-- client sends, and refuses to let a family "un-assign" a row back to
-- 'assigned' - staff can still do that via their own update policy below,
-- which this trigger does not touch (auth_role() <> 'client' short-circuits
-- it entirely for staff/admin writes).
create or replace function enforce_home_program_activity_client_edits() returns trigger
language plpgsql as $$
begin
  if public.auth_role() <> 'client' then
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id
     or new.client_id is distinct from old.client_id
     or new.goal_id is distinct from old.goal_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assigned_by is distinct from old.assigned_by
     or new.created_at is distinct from old.created_at then
    raise exception 'A family account may only update status on a home-program activity.';
  end if;

  if new.status not in ('in_progress', 'completed') then
    raise exception 'A family account may only mark an activity in_progress or completed.';
  end if;

  new.completed_at := case when new.status = 'completed' then coalesce(old.completed_at, now()) else null end;

  return new;
end;
$$;

drop trigger if exists home_program_activities_client_edit_guard on home_program_activities;
create trigger home_program_activities_client_edit_guard
  before update on home_program_activities
  for each row execute function enforce_home_program_activity_client_edits();

alter table home_program_activities enable row level security;

-- Staff: clinic-wide read/insert/update, same broad staff-clinic pattern
-- programs/session_notes/client_budgets already use (migrations 0001, 0023) -
-- not narrowed to "just this clinician's own caseload" because nothing else
-- in this schema draws that finer line at the RLS layer either. Per-command,
-- never `for all` - no delete policy, so deletes are denied by default,
-- matching every other table in this schema.
create policy home_program_activities_staff_read on home_program_activities for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
create policy home_program_activities_staff_write on home_program_activities for insert
  with check (clinic_id = auth_clinic_id() and auth_is_staff() and assigned_by = auth.uid());
create policy home_program_activities_staff_update on home_program_activities for update
  using (clinic_id = auth_clinic_id() and auth_is_staff());

-- Family: read and update (status only, enforced by the trigger above) their
-- own child's rows - same auth_client_row_id() path migration 0020
-- established for programs/session_notes and 0023 for client_budgets.
create policy home_program_activities_client_read on home_program_activities for select
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id());
create policy home_program_activities_client_update on home_program_activities for update
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id())
  with check (public.auth_role() = 'client' and client_id = public.auth_client_row_id());
