-- ---------------------------------------------------------------------------
-- 0084 — let scheduling staff READ a family's guardians and permissions.
--
-- NOT APPLIED. Written for a human to run; nothing here has been executed.
--
-- The Admin console's "Clients & Families" tab is offered to admin and
-- scheduler. Admin can read it; scheduler cannot, because every guardian
-- read policy in 0047 requires `auth_can('clinical.client.read')` and
-- 0024's seed does not grant a scheduler that action. The result is not an
-- error: a scheduler reads an empty set from guardian_relationships,
-- relationship_permissions and household_members, so a family with three
-- guardians renders as a family with none. That is the RLS-returns-empty
-- trap this repo has been bitten by before.
--
-- The obvious fix is the wrong one. Granting a scheduler
-- `clinical.client.read` would open far more than this screen: it is one of
-- 0024's nine clinical actions, every one flagged `exposes_phi`, and it
-- gates client records, session notes, programs and assessments across the
-- schema. A scheduler needs to know WHO may see a child's information, not
-- to read the child's clinical record.
--
-- So the narrow thing is granted instead: three additional SELECT policies,
-- keyed on auth_is_scheduling_staff() (admin + scheduler, 0013), sitting
-- beside the existing clinical ones rather than replacing them. Policies of
-- the same command are OR'd, so admin and supervisor keep exactly the reach
-- they have and scheduler gains only these three tables.
--
-- WRITES ARE UNCHANGED. Every ..._staff_write and ..._staff_update policy
-- still requires `admin.staff.manage`, which a scheduler does not hold, so a
-- scheduler can see a family's permissions and change none of them. That
-- matches the console, where the switches are disabled for anyone but an
-- admin.
--
-- Supervisor is deliberately not mentioned here: they already hold
-- clinical.client.read and so already read these tables. Whether the console
-- offers them the tab is an application decision, and the answer there is no
-- - a supervisor is a clinician, not an app administrator.
--
-- Verify, signed in as a scheduler:
--   select count(*) from guardian_relationships;      -- expect > 0
--   select count(*) from relationship_permissions;    -- expect > 0
--   select count(*) from household_members;           -- expect > 0
--   update relationship_permissions set granted = true;  -- expect 0 rows
--   select count(*) from session_notes;               -- expect 0, unchanged
--   select count(*) from programs;                    -- expect 0, unchanged
-- and as an admin, that the same three counts are what they were before.
-- ---------------------------------------------------------------------------

drop policy if exists guardian_relationships_scheduling_read on guardian_relationships;
create policy guardian_relationships_scheduling_read on guardian_relationships for select
  using (clinic_id = public.auth_clinic_id() and public.auth_is_scheduling_staff());

comment on policy guardian_relationships_scheduling_read on guardian_relationships is
  'Scheduling staff (admin, scheduler) read who is linked to which child, for '
  'the Admin console''s Clients & Families tab. Read only: the write policies '
  'still require admin.staff.manage.';

drop policy if exists relationship_permissions_scheduling_read on relationship_permissions;
create policy relationship_permissions_scheduling_read on relationship_permissions for select
  using (exists (select 1 from public.guardian_relationships gr
                  where gr.id = relationship_permissions.relationship_id
                    and gr.clinic_id = public.auth_clinic_id()
                    and public.auth_is_scheduling_staff()));

comment on policy relationship_permissions_scheduling_read on relationship_permissions is
  'The permission switches behind the Clients & Families tab. Scoped through '
  'the parent relationship''s clinic, since this table carries no clinic_id '
  'of its own - same shape as relationship_permissions_staff_read.';

-- Names for the guardians above. Without this the tab can list a family's
-- permissions but not say whose they are.
drop policy if exists household_members_scheduling_read on household_members;
create policy household_members_scheduling_read on household_members for select
  using (clinic_id = public.auth_clinic_id() and public.auth_is_scheduling_staff());

comment on policy household_members_scheduling_read on household_members is
  'Scheduling staff read household members so the Clients & Families tab can '
  'name a guardian rather than showing a bare user id.';

notify pgrst, 'reload schema';
