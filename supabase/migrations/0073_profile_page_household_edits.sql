-- ============================================================================
-- 0073 · Family self-service into households/household_members, plus a new
-- home_session_preferences table — backing the new centralized "Profile"
-- page in apps/web (family/guardian-role sections: mailing address,
-- emergency contacts, per-child home-session preference).
--
-- Two distinct changes, for two different reasons:
--
-- 1. households/household_members currently have ZERO guardian-write RLS
--    policies — only households_staff_update/household_members_staff_update
--    exist (migration 0047). The edit_demographics/manage_household
--    permission kinds were seeded there (is_default: false) but nothing
--    ever checked them. This migration is what actually wires them up: a
--    guardian who has been granted manage_household for at least one child
--    in the household can now edit the household's mailing address and its
--    plain (non-client, non-login) member rows — i.e. add/edit emergency
--    contacts. Nothing changes for a guardian who hasn't been granted it —
--    they still only read, same as before, and the app is expected to say
--    so explicitly (this codebase's "RLS returns empty sets, not errors"
--    trap applies here too).
--
--    RLS is row-level, not column-level, so the new guardian UPDATE policies
--    below are deliberately narrow (own row, or contact-only rows with no
--    client_id/user_id) AND backed by a BEFORE UPDATE trigger on each table
--    that blocks the handful of admin-only fields (household status/merge,
--    a member's client_id/user_id/household_id, either table's clinic_id)
--    from changing unless the actor holds clinical.client.write — the same
--    two-layer shape as profiles_guard_privileges (migration 0032).
--
-- 2. home_session_preference is a brand new concept (grepped: zero prior
--    matches anywhere in this schema). It is its OWN satellite table, not a
--    column on `clients` — `clients` has no non-staff RLS policy at all
--    today, and every other client-facing write in this schema
--    (client_budgets, session_change_requests, home_program_activities)
--    deliberately avoided writing to clients/sessions directly in favour of
--    a narrow satellite table; this follows the same precedent. It is also
--    deliberately NOT gated behind manage_household/edit_demographics: the
--    product intent (a setup-wizard nudge every family completes) only
--    works if it's available to any guardian with active access to the
--    child, not just households a staff member has separately opted in —
--    unlike the mailing-address/emergency-contact edits above, which
--    respect that existing staff-gated default. No default value on
--    `preference` is deliberate — the row simply does not exist until a
--    person chooses, which is what the wizard checks for.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. household_members.phone_secondary — the one net-new column emergency
--     contacts needed; email and a primary phone already existed.
-- ---------------------------------------------------------------------------
alter table household_members add column if not exists phone_secondary text;

comment on column household_members.phone_secondary is
  'Optional second phone number for this household member/emergency contact. Added for the profile page''s emergency-contact section (0073).';

-- ---------------------------------------------------------------------------
-- 1b. auth_can_manage_household() — household-grain version of
--     auth_guardian_can(), which is per-client. Mirrors its shape exactly.
-- ---------------------------------------------------------------------------
create or replace function public.auth_can_manage_household(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.guardian_relationships gr
      join public.relationship_permissions rp on rp.relationship_id = gr.id
     where gr.user_id = auth.uid()
       and gr.household_id = p_household_id
       and gr.status = 'ACTIVE'
       and (gr.starts_on is null or gr.starts_on <= current_date)
       and (gr.ends_on is null or gr.ends_on >= current_date)
       and rp.permission = 'manage_household'
       and rp.granted
  )
$$;

comment on function public.auth_can_manage_household(uuid) is
  'Whether the caller has been granted manage_household for at least one child in this household. Household-grain sibling of auth_guardian_can(), which is per-client.';

-- ---------------------------------------------------------------------------
-- 1c. Guard triggers — block the admin-only fields on households and
--     household_members from changing via a non-staff actor's UPDATE, since
--     the guardian RLS policies below are row-scoped, not column-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.households_guard_admin_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status
     or new.merged_into is distinct from old.merged_into
     or new.clinic_id is distinct from old.clinic_id
  then
    if not public.auth_can('clinical.client.write') then
      raise exception 'Merging, deactivating or reassigning a household needs staff administration, not a family self-edit.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists households_guard on households;
create trigger households_guard before update on households
  for each row execute function public.households_guard_admin_fields();

create or replace function public.household_members_guard_admin_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.client_id is distinct from old.client_id
     or new.user_id is distinct from old.user_id
     or new.household_id is distinct from old.household_id
     or new.clinic_id is distinct from old.clinic_id
  then
    if not public.auth_can('clinical.client.write') then
      raise exception 'Relinking a household member to a different client, login or household needs staff administration.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists household_members_guard on household_members;
create trigger household_members_guard before update on household_members
  for each row execute function public.household_members_guard_admin_fields();

-- ---------------------------------------------------------------------------
-- 1d. The new guardian write policies themselves.
-- ---------------------------------------------------------------------------
drop policy if exists households_guardian_update on households;
create policy households_guardian_update on households for update
  using (id = public.auth_household_id() and public.auth_can_manage_household(id))
  with check (id = public.auth_household_id() and public.auth_can_manage_household(id));

-- Guardian may touch their OWN member row (their own phone/email), or a
-- plain contact row that is neither a client link nor a login — never a
-- child's client-linked row or another adult's login-linked row.
drop policy if exists household_members_guardian_update on household_members;
create policy household_members_guardian_update on household_members for update
  using (
    household_id = public.auth_household_id()
    and public.auth_can_manage_household(household_id)
    and (user_id = auth.uid() or (client_id is null and user_id is null))
  )
  with check (
    household_id = public.auth_household_id()
    and public.auth_can_manage_household(household_id)
    and (user_id = auth.uid() or (client_id is null and user_id is null))
    and clinic_id = (select h.clinic_id from public.households h where h.id = household_id)
  );

-- Adding a NEW emergency contact is an insert of a plain contact row only —
-- never one that links a client or grants a login, both of which stay
-- staff-only (the invite/guardian_relationships path).
drop policy if exists household_members_guardian_insert on household_members;
create policy household_members_guardian_insert on household_members for insert
  with check (
    household_id = public.auth_household_id()
    and public.auth_can_manage_household(household_id)
    and client_id is null
    and user_id is null
    and clinic_id = (select h.clinic_id from public.households h where h.id = household_id)
  );

-- ---------------------------------------------------------------------------
-- 2. home_session_preferences — one row per client, created on first choice.
-- ---------------------------------------------------------------------------
create table if not exists home_session_preferences (
  client_id bigint primary key references clients(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete restrict,
  preference text not null check (preference in ('only', 'if_required', 'never')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table home_session_preferences is
  'Whether in-home sessions are wanted for this client: only / if_required / never. No default — absence of a row means the family has not chosen yet, which the profile page''s setup wizard checks for.';

create index if not exists home_session_preferences_clinic_idx
  on home_session_preferences(clinic_id);

alter table home_session_preferences enable row level security;

drop policy if exists home_session_preferences_staff_read on home_session_preferences;
create policy home_session_preferences_staff_read on home_session_preferences for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists home_session_preferences_staff_write on home_session_preferences;
create policy home_session_preferences_staff_write on home_session_preferences for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

drop policy if exists home_session_preferences_staff_update on home_session_preferences;
create policy home_session_preferences_staff_update on home_session_preferences for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

-- Deliberately NOT gated behind manage_household/edit_demographics — see
-- the file header. Any guardian (or self-logged-in client) with active
-- access to this child can set their own preference.
drop policy if exists home_session_preferences_guardian_read on home_session_preferences;
create policy home_session_preferences_guardian_read on home_session_preferences for select
  using (client_id in (select public.auth_accessible_client_ids()));

drop policy if exists home_session_preferences_guardian_write on home_session_preferences;
create policy home_session_preferences_guardian_write on home_session_preferences for insert
  with check (
    client_id in (select public.auth_accessible_client_ids())
    and updated_by = auth.uid()
    and clinic_id = (select c.clinic_id from public.clients c where c.id = client_id)
  );

drop policy if exists home_session_preferences_guardian_update on home_session_preferences;
create policy home_session_preferences_guardian_update on home_session_preferences for update
  using (client_id in (select public.auth_accessible_client_ids()))
  with check (
    client_id in (select public.auth_accessible_client_ids())
    and updated_by = auth.uid()
    and clinic_id = (select c.clinic_id from public.clients c where c.id = client_id)
  );

-- No delete policy on either table's new grants, and none at all on
-- home_session_preferences — consistent with this schema's "deletes denied
-- by default" rule. A changed mind is a new UPDATE, not a removed row.
