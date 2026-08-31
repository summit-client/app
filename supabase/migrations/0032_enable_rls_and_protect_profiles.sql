-- 0032 · Enable RLS where policies were written but row security never turned on
--
-- WHAT WAS FOUND
--
-- Running the whole migration history against an empty database and then
-- querying pg_class exposed two things no amount of reading had:
--
--   1. Eight tables carry 39 policies between them and have
--      relrowsecurity = false. calendars, client_availability, clients,
--      locations, session_types, sessions, staff, staff_availability.
--      Migration 0013 writes every one of those policies. It never runs
--      `alter table ... enable row level security`. A policy on a table
--      without row security is inert: it is not consulted, and every row is
--      readable and writable by anyone holding the table GRANT.
--
--   2. `profiles` has no policies at all and row security off. profiles holds
--      `role` and `clinic_id` — the two columns every auth helper in this
--      schema reads. Writable by any authenticated user, that is straight
--      privilege escalation: `update profiles set role = 'admin' where id =
--      auth.uid()`.
--
-- WHAT THIS PROBABLY MEANS ON PRODUCTION, STATED HONESTLY
--
-- Almost certainly production is NOT open, and this is schema drift rather
-- than a live hole. The evidence is migration 0014's own header: it reports a
-- clinician's `getClients()` returning "a plain, RLS-filtered empty array",
-- which is the reported "empty caseload" symptom it was written to fix. That
-- symptom is only possible if row security IS active on `clients` there. The
-- same reasoning applies to profiles: if it were readable by everyone, several
-- things would look different than they do.
--
-- The likely history: these tables and their original policies were created by
-- hand in the Supabase dashboard, which enables row security for you when you
-- add a policy through the UI. 0013 later dropped and replaced the policies —
-- which does not touch the row-security flag — so production kept it and the
-- repo never recorded it.
--
-- So the real defect is that THE REPOSITORY DOES NOT REPRODUCE PRODUCTION.
-- Every database built from these migrations — a developer's, a staging
-- environment, a disaster-recovery restore — has thirty-nine inert policies
-- and a writable profiles table. That is only newly possible to notice because
-- migration 0000 made building one possible at all.
--
-- BEFORE APPLYING THIS TO PRODUCTION
--
-- Run this and read it, rather than assuming either way:
--
--   select relname, relrowsecurity from pg_class
--    where relname in ('clients','staff','sessions','calendars','locations',
--                      'session_types','staff_availability','client_availability','profiles');
--   select tablename, policyname, cmd, qual from pg_policies
--    where tablename = 'profiles';
--
-- If row security is already on, the first half of this migration is a no-op.
-- If profiles already has policies, compare them with the ones below before
-- letting these run: this file cannot see production's, and it would rather be
-- read than trusted.
--
-- THE RISK, NAMED
--
-- Enabling row security on a table that genuinely had none is the one change
-- in this migration that can take access away. If production's profiles has no
-- policies today, then every portal's auth gate reads profiles unrestricted,
-- and the moment row security comes on, only what the policies below permit
-- keeps working. They are written to cover every read the applications
-- actually make — own row, and clinic peers for the team screens — but this is
-- the statement to check in staging first, not after.

-- ---------------------------------------------------------------------------
-- 1. The eight scheduler tables. Policies already exist; this makes them mean
--    something. Idempotent: enabling row security twice is not an error.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  n int;
begin
  foreach t in array array[
    'clients', 'staff', 'sessions', 'calendars', 'locations',
    'session_types', 'staff_availability', 'client_availability'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, not present', t;
      continue;
    end if;

    -- Refuse to lock a table that has no policies at all. Turning row security
    -- on with nothing to permit access denies everyone everything, and doing
    -- that silently to a live table during a deploy is worse than leaving it.
    select count(*) into n from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t;

    if n = 0 then
      raise exception
        'Refusing to enable row security on % : it has no policies, so this would deny all access.', t;
    end if;

    execute format('alter table public.%I enable row level security', t);
    raise notice 'row security on % (% policies)', t, n;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles
--
-- Read: your own row always, and your clinic's other profiles. The second is
-- not optional — the employee hub's team screen, the supervisor pickers and
-- every "who wrote this" lookup read colleagues' names and roles, and they are
-- not confidential within an organization.
--
-- No recursion, though it looks like there should be: these policies call
-- auth_clinic_id(), which selects from profiles. It is SECURITY DEFINER and
-- owned by the schema owner, so it runs with the definer's rights and row
-- security does not apply inside it. That is precisely why every helper in
-- this schema is written that way, and the tests assert it rather than trust
-- it.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid());

drop policy if exists profiles_clinic_read on profiles;
create policy profiles_clinic_read on profiles for select
  using (clinic_id is not null and clinic_id = public.auth_clinic_id());

-- Update your own row, or anyone in your clinic with the staff action. Which
-- COLUMNS may be changed is a separate question, handled by the trigger below,
-- because row security checks rows and this is a column problem.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'));

-- Creating a profile is provisioning. Normally done by the signup trigger or
-- the service role, both of which bypass row security; an administrator adding
-- a colleague by hand needs the action.
drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'));

-- No delete policy, so nobody deletes a profile through the API. Deactivation
-- is an employment record ending, not a row disappearing.

-- ---------------------------------------------------------------------------
-- The escalation guard
--
-- role, clinic_id and supervisor_id decide what every other policy in this
-- schema permits. profiles_self_update has to exist so a person can change
-- their own name, and without this trigger that same policy lets them change
-- their own role.
--
-- auth.uid() being null means no signed-in user: the service role, a migration,
-- or the signup trigger. Those are allowed through, or provisioning breaks.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_privileges() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;                      -- service role, migration, signup trigger
  end if;

  if new.role is distinct from old.role
     or new.clinic_id is distinct from old.clinic_id
     or new.supervisor_id is distinct from old.supervisor_id
  then
    if not public.auth_can('admin.staff.manage') then
      raise exception
        'Changing a role, clinic or supervisor needs staff administration. Your other changes were not saved either.';
    end if;

    -- Even an administrator does not silently move someone between clinics.
    if new.clinic_id is distinct from old.clinic_id then
      raise exception
        'Moving a person between clinics is not an edit. End their employment and provision them in the new clinic.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function public.profiles_guard_privileges();

comment on function public.profiles_guard_privileges() is
  'Stops self-service privilege escalation. profiles_self_update must allow a '
  'person to edit their own row; this stops that from including their own role.';

-- ---------------------------------------------------------------------------
-- 3. A standing check, so this class of defect is caught rather than found
--
-- Any table with policies and row security off is inert. Any table with
-- neither, in a schema whose stated rule is that every PHI table carries
-- clinic_id and RLS, is worth looking at too.
-- ---------------------------------------------------------------------------
create or replace view rls_coverage as
select
  c.relname                                  as table_name,
  c.relrowsecurity                           as row_security_enabled,
  count(p.polname)::int                      as policy_count,
  case
    when count(p.polname) > 0 and not c.relrowsecurity
      then 'POLICIES INERT — row security is off'
    when count(p.polname) = 0 and not c.relrowsecurity
      then 'no policies and no row security'
    when count(p.polname) = 0 and c.relrowsecurity
      then 'row security on with no policies — denies everyone'
    else 'ok'
  end                                        as status
from pg_class c
join pg_namespace ns on ns.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where ns.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity;

comment on view rls_coverage is
  'Every table''s row-security posture. Anything not "ok" is worth a sentence of '
  'explanation. Migration 0013 wrote 39 policies across 8 tables and enabled row '
  'security on none of them; this view is what would have said so.';
