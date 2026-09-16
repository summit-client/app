-- ============================================================================
-- 0075 · Profile-setup checklist — new self-service columns and the RLS
-- writes they need.
--
-- Backs a per-role "profile completion" checklist (nav bar ring), split into
-- critical vs. important items. Two things this migration deliberately does
-- NOT add, because they already exist:
--
--   - household_members.email/phone (a person's own contact info) — already
--     there since 0047. household_members_guardian_update (0073) already
--     lets a guardian self-edit their OWN member row (user_id = auth.uid()).
--   - home_session_preferences — already its own table (0073).
--
-- Staff-shaped contact info (phone, emergency contact) is NOT in this
-- migration. It was drafted here against `profiles` and reverted on
-- explicit direction: `profiles` carries role/clinic_id, the columns this
-- schema's entire RBAC/RLS posture reads (auth_role(), auth_clinic_id()),
-- and is not where plain contact fields belong regardless of how
-- convenient its existing unconditional self-update policy is. The
-- decision is: `staff`, with a `staff.user_id` column added and populated
-- automatically on user creation (removing today's admin-manual
-- employment_records.staff_id link as the blocker) — planned separately,
-- not yet built. See that plan before touching this area again.
--
-- What's actually missing here:
--
--   1. households has a phone column but no email - the guardian-facing
--      "contact" card already edits phone alongside the mailing address as
--      one bundled household-level record, so email joins it the same way.
--      households_guardian_update (0073) is already unconditional on
--      column, so no new policy, just the column.
--
--   2. Neither availability table has a self-service write path today.
--      client_availability's write policies (0013/0046) are staff-only;
--      staff_availability's are admin-only, with staff having only a
--      pre-existing READ of their own row. Both need a new, narrow,
--      command-scoped (never `for all`) own-row write policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. households.email, alongside the existing households.phone. No new RLS:
--    households_guardian_update (0073) is already unconditional on column
--    for a guardian who holds manage_household.
-- ---------------------------------------------------------------------------
alter table households add column if not exists email text;

comment on column households.email is
  'Contact email the clinic writes to, alongside the existing phone/mailing address. Profile-setup checklist (0075).';

-- ---------------------------------------------------------------------------
-- 2a. client_availability — guardian may write their OWN accessible
--     children's availability. Mirrors home_session_preferences' guardian
--     policies (0073) exactly: any guardian/self-logged-in client with
--     active access, via auth_accessible_client_ids() (the legacy
--     clients.user_id link UNION guardian_relationships - using only
--     clients.user_id here would silently drop any parent with more than
--     one child, which is the entire reason that function exists over a
--     hand-rolled check). Deliberately NOT gated behind manage_household:
--     availability is a scheduling fact about the child, same class as
--     home-session preference, not administrative household data.
-- ---------------------------------------------------------------------------
create policy client_availability_guardian_insert on client_availability for insert
  with check (
    client_id in (select public.auth_accessible_client_ids())
    and clinic_id = (select c.clinic_id from public.clients c where c.id = client_id)
  );

create policy client_availability_guardian_update on client_availability for update
  using (client_id in (select public.auth_accessible_client_ids()))
  with check (
    client_id in (select public.auth_accessible_client_ids())
    and clinic_id = (select c.clinic_id from public.clients c where c.id = client_id)
  );

create policy client_availability_guardian_delete on client_availability for delete
  using (client_id in (select public.auth_accessible_client_ids()));

-- ---------------------------------------------------------------------------
-- 2b. staff_availability — a staff member may write their OWN linked row.
--     staff has no user_id column today (see file header - a fix for that
--     is planned separately). Until it lands, "own row" is resolved the
--     same way 0046 already resolved "the caller's own staff row" for
--     sessions: through employment_records (staff_id -> user_id, filtered
--     to end_date is null for "currently employed"). No role check needed
--     alongside it - the exists() clause is already the real gate, and it
--     simply never matches for a role that (by design) has no linked
--     staff_id, same "correctly zero capability, not a bug" shape 0046's
--     own header calls out for the equivalent sessions case.
-- ---------------------------------------------------------------------------
create policy staff_availability_own_insert on staff_availability for insert
  with check (
    clinic_id = auth_clinic_id()
    and exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = staff_availability.staff_id
         and er.end_date is null
    )
  );

create policy staff_availability_own_update on staff_availability for update
  using (
    exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = staff_availability.staff_id
         and er.end_date is null
    )
  )
  with check (
    clinic_id = auth_clinic_id()
    and exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = staff_availability.staff_id
         and er.end_date is null
    )
  );

create policy staff_availability_own_delete on staff_availability for delete
  using (
    exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = staff_availability.staff_id
         and er.end_date is null
    )
  );
