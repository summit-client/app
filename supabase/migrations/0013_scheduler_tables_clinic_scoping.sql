-- ============================================================================
-- Multi-tenant clinic scoping for the original scheduler tables.
--
-- clients, staff, sessions, calendars, locations, session_types,
-- client_availability and staff_availability predate this repo's migration
-- history entirely (confirmed live: querying clinic_id on any of them threw
-- `column "clinic_id" does not exist`, which is what actually caused the
-- admin "view as client" picker to show an empty list with real clients
-- populated - not an RLS-filtered empty set, a query against a column that
-- was never there). Every table added since (0001 onward) carries clinic_id
-- and a `clinic_id = auth_clinic_id() and auth_is_staff()`-shaped policy per
-- CLAUDE.md's "every PHI table carries clinic_id and RLS policies. No
-- exceptions" rule - these eight tables are the exceptions, because they
-- were built before that rule existed. Confirmed live via
-- `select policyname, cmd, qual from pg_policies where tablename = 'clients'`
-- (and the other seven): every one of them currently grants admin and/or
-- scheduler unconditional access with no clinic check anywhere, and every
-- one uses a single `for all` policy rather than this schema's usual
-- per-command split (deletes on all eight are currently wide open for
-- whichever role the old policy names, not merely a hypothetical - the
-- default posture everywhere else in this schema is delete-denied unless a
-- table deliberately adds it).
--
-- Single clinic today (`select id, name from clinics` returns exactly one
-- row, Mount Etna), so backfilling every existing row in these eight tables
-- to that clinic is unambiguous. Going forward this is not optional: the
-- product's actual objective is multi-tenant commercialization, not a
-- permanent Mount-Etna-only deployment, and every one of these tables is
-- reachable by an authenticated admin/scheduler account today with zero
-- tenant boundary. This migration is what makes that boundary real instead
-- of aspirational.
--
-- Not addressed here, flagged for later: no cross-table consistency check
-- (e.g. nothing stops a session row's clinic_id from being written to A
-- while its client_id points at a client whose clinic_id is B). RLS already
-- makes this hard in practice - an admin can't read another clinic's client
-- id to reference it in the first place - but it is not impossible, and a
-- trigger enforcing clinic_id agreement across client_id/employee_id/
-- calendar_id would close that residual gap properly. Left out of this
-- migration to keep it reviewable; worth doing before a second clinic goes
-- live for real.
-- ============================================================================

-- Mirrors auth_is_staff()'s hardening exactly (schema-qualified, pg_temp
-- named last - see migration 0009) but for the role set these eight tables
-- actually use: admin and scheduler, not the clinical admin/supervisor/
-- clinician set auth_is_staff() checks. Reusing auth_is_staff() here would
-- silently add clinician/supervisor access these tables never granted and
-- silently drop scheduler access every one of them currently relies on.
create or replace function auth_is_scheduling_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select public.auth_role() in ('admin','scheduler') $$;

-- ----------------------------------------------------------------------------
-- 1. Add clinic_id, backfill to Mount Etna, enforce not null, index it.
-- ----------------------------------------------------------------------------

alter table clients add column if not exists clinic_id uuid references public.clinics(id);
update clients set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table clients alter column clinic_id set not null;
create index if not exists clients_clinic_idx on clients(clinic_id);

alter table staff add column if not exists clinic_id uuid references public.clinics(id);
update staff set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table staff alter column clinic_id set not null;
create index if not exists staff_clinic_idx on staff(clinic_id);

alter table sessions add column if not exists clinic_id uuid references public.clinics(id);
update sessions set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table sessions alter column clinic_id set not null;
create index if not exists sessions_clinic_idx on sessions(clinic_id);

alter table calendars add column if not exists clinic_id uuid references public.clinics(id);
update calendars set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table calendars alter column clinic_id set not null;
create index if not exists calendars_clinic_idx on calendars(clinic_id);

alter table locations add column if not exists clinic_id uuid references public.clinics(id);
update locations set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table locations alter column clinic_id set not null;
create index if not exists locations_clinic_idx on locations(clinic_id);

alter table session_types add column if not exists clinic_id uuid references public.clinics(id);
update session_types set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table session_types alter column clinic_id set not null;
create index if not exists session_types_clinic_idx on session_types(clinic_id);

alter table client_availability add column if not exists clinic_id uuid references public.clinics(id);
update client_availability set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table client_availability alter column clinic_id set not null;
create index if not exists client_availability_clinic_idx on client_availability(clinic_id);

alter table staff_availability add column if not exists clinic_id uuid references public.clinics(id);
update staff_availability set clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' where clinic_id is null;
alter table staff_availability alter column clinic_id set not null;
create index if not exists staff_availability_clinic_idx on staff_availability(clinic_id);

-- ----------------------------------------------------------------------------
-- 2. clients - admin and scheduler had equal, unconditional "for all" access.
--    Preserved exactly (including delete - the scheduler admin page's
--    remove-client button uses it), clinic-scoped, split per command.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins and schedulers have full access to clients" on clients;
-- "Clients can read own record" (user_id = auth.uid()) is untouched: a
-- client's own user_id is already unique to them, so there is nothing a
-- clinic_id check would additionally exclude.

create policy clients_staff_select on clients for select
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy clients_staff_insert on clients for insert
  with check (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy clients_staff_update on clients for update
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy clients_staff_delete on clients for delete
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());

-- ----------------------------------------------------------------------------
-- 3. staff - admin had full "for all" access; scheduler was read-only.
--    Preserved exactly, clinic-scoped, split per command.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins have full access to staff" on staff;
drop policy if exists "Schedulers can read staff" on staff;
-- "Staff can read own record" (user_id = auth.uid()) is untouched.

create policy staff_admin_select on staff for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_admin_insert on staff for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_admin_update on staff for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_admin_delete on staff for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_scheduler_read on staff for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'scheduler');

-- ----------------------------------------------------------------------------
-- 4. sessions - admin and scheduler had equal, unconditional "for all"
--    access. Preserved exactly, clinic-scoped, split per command.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins and schedulers have full access to sessions" on sessions;
-- "Staff can read own sessions" and "Clients can read own sessions" (both
-- via a user_id = auth.uid() join through staff/clients) are untouched.

create policy sessions_staff_select on sessions for select
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy sessions_staff_insert on sessions for insert
  with check (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy sessions_staff_update on sessions for update
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy sessions_staff_delete on sessions for delete
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());

-- ----------------------------------------------------------------------------
-- 5. calendars - admin had full "for all" access; scheduler was read-only.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins have full access to calendars" on calendars;
drop policy if exists "Schedulers can read calendars" on calendars;

create policy calendars_admin_select on calendars for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy calendars_admin_insert on calendars for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy calendars_admin_update on calendars for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy calendars_admin_delete on calendars for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy calendars_scheduler_read on calendars for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'scheduler');

-- ----------------------------------------------------------------------------
-- 6. locations - admin had full "for all" access; scheduler and client were
--    read-only. The old read policy also named a 'staff'::user_role branch -
--    profiles.role has never had that value (see CLAUDE.md's "no staff role"
--    note), so it was always a no-op and is simply not carried forward.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins have full access to locations" on locations;
drop policy if exists "Schedulers, staff and clients can read locations" on locations;

create policy locations_admin_select on locations for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy locations_admin_insert on locations for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy locations_admin_update on locations for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy locations_admin_delete on locations for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy locations_read on locations for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('scheduler','client'));

-- ----------------------------------------------------------------------------
-- 7. session_types - identical shape to locations, same dead 'staff' branch
--    dropped for the same reason.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins have full access to session_types" on session_types;
drop policy if exists "Schedulers, staff and clients can read session_types" on session_types;

create policy session_types_admin_select on session_types for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy session_types_admin_insert on session_types for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy session_types_admin_update on session_types for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy session_types_admin_delete on session_types for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy session_types_read on session_types for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('scheduler','client'));

-- ----------------------------------------------------------------------------
-- 8. client_availability - admin and scheduler had equal "for all" access.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins and schedulers have full access to client_availability" on client_availability;
-- "Clients can read own availability" (via a clients.user_id = auth.uid()
-- join) is untouched.

create policy client_availability_staff_select on client_availability for select
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy client_availability_staff_insert on client_availability for insert
  with check (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy client_availability_staff_update on client_availability for update
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());
create policy client_availability_staff_delete on client_availability for delete
  using (clinic_id = auth_clinic_id() and auth_is_scheduling_staff());

-- ----------------------------------------------------------------------------
-- 9. staff_availability - admin had full "for all" access; scheduler was
--    read-only.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins have full access to staff_availability" on staff_availability;
drop policy if exists "Schedulers can read staff_availability" on staff_availability;
-- "Staff can read own availability" (via a staff.user_id = auth.uid() join)
-- is untouched.

create policy staff_availability_admin_select on staff_availability for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_availability_admin_insert on staff_availability for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_availability_admin_update on staff_availability for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_availability_admin_delete on staff_availability for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy staff_availability_scheduler_read on staff_availability for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'scheduler');
