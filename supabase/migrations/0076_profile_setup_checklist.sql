-- ============================================================================
-- 0076 · Profile-setup checklist - self-service contact info, emergency
-- contact and availability, for both staff-shaped roles and clients.
--
-- Builds on 0075's staff.user_id: with a real column to key a policy on,
-- "own row" for staff is now a direct check, the same shape as clients has
-- always had via clients.user_id - no more resolving it through
-- employment_records as a workaround for the missing column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. staff: phone, emergency contact. Self-service RLS is row-level, not
--    column-level, so a plain `user_id = auth.uid()` UPDATE policy would
--    also hand an employee write access to name/role/specialties/capacity/
--    location_id - fields the scheduler's admin page manages and a matching
--    tool relies on. Guarded the same way 0073 already guards households/
--    household_members self-edit: a BEFORE UPDATE trigger blocks the
--    admin-only fields from changing unless the actor is admin, so the RLS
--    policy itself can stay simple.
-- ---------------------------------------------------------------------------
alter table staff add column if not exists phone text;
alter table staff add column if not exists emergency_contact_name text;
alter table staff add column if not exists emergency_contact_phone text;

comment on column staff.phone is
  'Self-reported contact phone. Profile-setup checklist (0076).';
comment on column staff.emergency_contact_name is
  'Self-reported emergency contact name. Profile-setup checklist (0076).';
comment on column staff.emergency_contact_phone is
  'Self-reported emergency contact phone. Profile-setup checklist (0076).';

create or replace function public.staff_guard_admin_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.name is distinct from old.name
     or new.role is distinct from old.role
     or new.specialties is distinct from old.specialties
     or new.capacity is distinct from old.capacity
     or new.location_id is distinct from old.location_id
     or new.clinic_id is distinct from old.clinic_id
     or new.user_id is distinct from old.user_id
  then
    if public.auth_role() != 'admin' then
      raise exception 'Changing name, role, specialties, capacity, location or the linked login needs admin access, not a self-edit.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists staff_guard on staff;
create trigger staff_guard before update on staff
  for each row execute function public.staff_guard_admin_fields();

create policy staff_self_update on staff for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. staff_availability - a staff member may write their OWN linked row,
--    resolved directly through staff.user_id now that it exists (0075).
--    Replaces the employment_records-join version drafted and reverted
--    earlier - same intent, simpler now that the real column is there.
-- ---------------------------------------------------------------------------
create policy staff_availability_own_insert on staff_availability for insert
  with check (
    clinic_id = auth_clinic_id()
    and exists (select 1 from staff s where s.id = staff_availability.staff_id and s.user_id = auth.uid())
  );

create policy staff_availability_own_update on staff_availability for update
  using (exists (select 1 from staff s where s.id = staff_availability.staff_id and s.user_id = auth.uid()))
  with check (
    clinic_id = auth_clinic_id()
    and exists (select 1 from staff s where s.id = staff_availability.staff_id and s.user_id = auth.uid())
  );

create policy staff_availability_own_delete on staff_availability for delete
  using (exists (select 1 from staff s where s.id = staff_availability.staff_id and s.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. households.email, alongside the existing households.phone.
--    households_guardian_update (0073) is already unconditional on column
--    for a guardian who holds manage_household, so no new policy needed.
-- ---------------------------------------------------------------------------
alter table households add column if not exists email text;

comment on column households.email is
  'Contact email the clinic writes to, alongside the existing phone/mailing address. Profile-setup checklist (0076).';

-- ---------------------------------------------------------------------------
-- 4. client_availability - guardian may write their OWN accessible
--    children's availability, via auth_accessible_client_ids() (0047) -
--    the legacy clients.user_id link UNION guardian_relationships, same
--    function home_session_preferences' own guardian policies (0073) use.
--    Deliberately not gated behind manage_household: availability is a
--    scheduling fact about the child, same class as home-session
--    preference.
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
