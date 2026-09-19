-- 0090: a manager cannot be their own manager
--
-- WHAT IS WRONG
--
-- hub_can_manage(subject) answers "may I act on this person's hub records" and
-- says yes when subject is the caller. Its first two branches match on
-- `p.id = subject and p.clinic_id = auth_clinic_id()`, which is trivially true
-- of the caller's own row, so anyone holding hr.hub.manage or hr.record.read
-- can act on themselves.
--
-- That is not theoretical. apps/employee/lib/hub-backend.ts's three Admin
-- console queues (listPendingTimeOffRequests, listPendingPdVerifications,
-- listPendingSignoffs) deliberately carry no user_id filter, with a comment
-- saying they rely on the hub_*_manage_select policies to scope them. So an
-- admin's or scheduler's own REQUESTED row appears in their own queue, and
-- hub_timeoff_manage / hub_pd_manage permit the update. An admin approves
-- their own time off, verifies their own professional development, and signs
-- off their own onboarding.
--
-- This is the doctrine migration 0086 already set for credentials: entering a
-- credential is yours, ASSERTING it is somebody else's, refused for every role
-- including admin. The same thing is true of approving your own leave.
--
-- WHAT THIS CHANGES
--
-- One predicate: the caller is never the subject. Nothing about reading or
-- writing your OWN rows moves - that is what the hub_*_own_* policies are for,
-- and they are untouched. A person still requests their own time off, records
-- their own PD, and completes their own onboarding. What they can no longer do
-- is be the second pair of eyes on it.
--
-- WHO LOSES SOMETHING
--
-- A clinic whose only admin is also its only employee. Their own requests will
-- sit in their queue unactionable, because there is nobody else to action
-- them. That is the honest consequence of the rule and it is the same
-- consequence 0086 accepted for credentials; the answer is a second admin, not
-- a self-approval.
--
-- HOW TO VERIFY
--
--   As an admin with a REQUESTED time-off row of your own:
--     select * from hub_time_off_requests where status = 'REQUESTED';
--   Your own row must be absent from what the manage policy admits and a
--   colleague's must still be present. The own-row policies still return it to
--   you on your own screens.
--
--   node supabase/tests/tenancy.mjs supabase/migrations
--   node apps/employee/qa.mjs

create or replace function public.hub_can_manage(subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- The whole point of this migration. Everything below describes who may
    -- act on SOMEBODY ELSE; none of it was ever meant to describe acting on
    -- yourself, and the branches simply did not say so.
    subject <> auth.uid()
    and (
      -- Whoever runs the hub's own queues — onboarding, PD, certificates, time
      -- off — for anyone in their clinic. This is the branch that carries
      -- migration 0022's grant to scheduler.
      (public.auth_can('hr.hub.manage')
       and exists (select 1 from public.profiles p
                    where p.id = subject and p.clinic_id = public.auth_clinic_id()))
      -- Or whoever administers HR records generally.
      or (public.auth_can('hr.record.read')
          and exists (select 1 from public.profiles p
                       where p.id = subject and p.clinic_id = public.auth_clinic_id()))
      -- Or this person's own supervisor. A supervisor reading their
      -- supervisee's development plan is the job; the same person reading a
      -- colleague's is not, and never was. Note this branch is about who
      -- reports to whom, not about holding the 'supervisor' ROLE: a clinician
      -- with someone reporting to them has always had this, and still does.
      -- It also now refuses a row where somebody is recorded as their own
      -- supervisor, which is bad data rather than a permission.
      or (public.auth_can('hr.performance.read')
          and exists (select 1 from public.profiles p
                       where p.id = subject and p.supervisor_id = auth.uid()))
    );
$$;

comment on function public.hub_can_manage(uuid) is
  'May the caller act on this person''s hub records. Never true of the caller '
  'themselves (0090): approving your own leave or verifying your own PD is the '
  'same self-assertion 0086 refused for credentials. Own-row access is the '
  'hub_*_own_* policies, not this.';
