-- 0022 · Employee Hub admin console: let scheduler manage, not just view
--
-- apps/employee is gaining a top-nav Admin link for admin AND scheduler
-- (previously admin/supervisor only, at the app-router level). Widening the
-- app's own route gate is not enough on its own: the Admin console's queues
-- (pending sign-offs, certificates to issue, time-off requests, PD
-- verification) all read hub_task_progress/hub_certificates/etc. under
-- hub_can_manage() (migration 0006), which only recognises 'admin' or an
-- explicit profiles.supervisor_id link - never 'scheduler'. Without this,
-- the console would render for a scheduler and then show nothing, exactly
-- the "portal renders and then shows nothing" trap CLAUDE.md documents
-- (RLS returns empty sets, not errors) - same shape of gap that
-- auth_is_scheduling_staff() (migration 0013) was written to avoid for the
-- scheduling tables, just discovered on the Employee Hub side instead.
--
-- Deliberately its own `create or replace function`, not a rename or an
-- auth_is_staff()/auth_is_scheduling_staff() reuse: scheduler gaining
-- clinic-wide MANAGE access to onboarding/PD/time-off/certificate data is a
-- real, scoped grant on top of what schedulers could already do (invite
-- clinicians/clients, per invite-teammate's INVITE_MATRIX), not a side
-- effect of some other role check changing shape later.
create or replace function hub_can_manage(subject uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.auth_role() in ('admin', 'scheduler')
      or exists (
        select 1 from public.profiles p
        where p.id = subject and p.supervisor_id = auth.uid()
      );
$$;
