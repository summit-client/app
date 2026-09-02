-- Self-contained, same pattern as clinician_caseload_access.sql: builds the
-- real pre-0013 shape for the eight scheduler tables plus a minimal
-- employment_records table (0026's shape, only the columns 0046 reads),
-- applies 0013, 0014, 0039 and 0046 verbatim, and verifies:
--
--   1. Read parity: a clinician (any clinician, linked or not) can now read
--      session_types, locations, calendars, client_availability and
--      staff_availability clinic-wide - the five tables that had zero
--      clinician read before 0046 - and still cannot see a second clinic's
--      rows.
--   2. Write scoping: a clinician linked (via employment_records) to a staff
--      row can insert/update ONLY a session whose employee_id is their own
--      linked staff row - not a colleague's, not by leaving employee_id
--      pointed at someone else after an update.
--   3. An unlinked clinician (no employment_records row at all) can read
--      everything the same way but cannot write ANY session, including one
--      naming a real staff_id that isn't linked to them.
--   4. admin/scheduler keep full, unscoped read/write exactly as before -
--      0046 does not touch auth_is_scheduling_staff() or its policies.

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table clinics (id uuid primary key, name text, slug text);
create table profiles (id uuid primary key references auth.users(id), role text, clinic_id uuid references clinics(id), full_name text);

create or replace function auth_clinic_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as
$$ select clinic_id from public.profiles where id = auth.uid() $$;
create or replace function auth_role() returns text
language sql stable security definer set search_path = public, pg_temp as
$$ select role from public.profiles where id = auth.uid() $$;
create or replace function auth_is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select public.auth_role() in ('admin','supervisor','clinician') $$;

create table clients (id bigserial primary key, name text, location_id bigint, user_id uuid references auth.users(id));
create table staff (id bigserial primary key, name text, role text, location_id bigint, user_id uuid references auth.users(id));
create table sessions (id bigserial primary key, client_id bigint references clients(id), employee_id bigint references staff(id), calendar_id bigint, status text default 'scheduled', session_date date default current_date, hour int default 9, minute int default 0, type text);
create table calendars (id bigserial primary key, name text, status text);
create table locations (id bigserial primary key, name text);
create table session_types (id bigserial primary key, name text);
create table client_availability (id bigserial primary key, client_id bigint references clients(id), day text);
create table staff_availability (id bigserial primary key, staff_id bigint references staff(id), day text);

alter table clients enable row level security;
alter table staff enable row level security;
alter table sessions enable row level security;
alter table calendars enable row level security;
alter table locations enable row level security;
alter table session_types enable row level security;
alter table client_availability enable row level security;
alter table staff_availability enable row level security;

create policy "Admins and schedulers have full access to clients" on clients for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','scheduler')));
create policy "Clients can read own record" on clients for select using (user_id = auth.uid());

create policy "Admins have full access to staff" on staff for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Schedulers can read staff" on staff for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'scheduler'));
create policy "Staff can read own record" on staff for select using (user_id = auth.uid());

create policy "Admins and schedulers have full access to sessions" on sessions for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','scheduler')));
create policy "Staff can read own sessions" on sessions for select
  using (exists (select 1 from staff where staff.id = sessions.employee_id and staff.user_id = auth.uid()));
create policy "Clients can read own sessions" on sessions for select
  using (exists (select 1 from clients where clients.id = sessions.client_id and clients.user_id = auth.uid()));

create policy "Admins have full access to calendars" on calendars for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Schedulers can read calendars" on calendars for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'scheduler'));

create policy "Admins have full access to locations" on locations for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Schedulers, staff and clients can read locations" on locations for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('scheduler','client')));

create policy "Admins have full access to session_types" on session_types for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Schedulers, staff and clients can read session_types" on session_types for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('scheduler','client')));

create policy "Admins and schedulers have full access to client_availability" on client_availability for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','scheduler')));
create policy "Clients can read own availability" on client_availability for select
  using (exists (select 1 from clients where clients.id = client_availability.client_id and clients.user_id = auth.uid()));

create policy "Admins have full access to staff_availability" on staff_availability for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Staff can read own availability" on staff_availability for select
  using (exists (select 1 from staff where staff.id = staff_availability.staff_id and staff.user_id = auth.uid()));
create policy "Schedulers can read staff_availability" on staff_availability for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'scheduler'));

-- Minimal employment_records - only the columns 0046's new sessions policies
-- and this test read (0026's real table has far more; irrelevant here).
create table employment_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  user_id uuid not null references auth.users(id),
  staff_id bigint references staff(id),
  end_date date
);

insert into clinics (id, name, slug) values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Mount Etna', 'mount-etna');
insert into locations (id, name) values (1, 'Etna Main');
insert into clients (id, name, location_id) values (1, 'Etna Kid', 1);
-- Two staff members in the same clinic: staff 1 will be linked to clinician1,
-- staff 2 to clinician2. Neither is used for the third, deliberately-unlinked
-- clinician.
insert into staff (id, name, role, location_id) values (1, 'Etna RBT One', 'RBT', 1), (2, 'Etna RBT Two', 'RBT', 1);
insert into sessions (id, client_id, employee_id, status) values (1, 1, 1, 'scheduled'), (2, 1, 2, 'scheduled');
-- Explicit ids above don't advance the identity sequence - bump it so the
-- later "clinician books a new session" test doesn't collide with id 1/2.
select setval(pg_get_serial_sequence('sessions', 'id'), 2, true);
insert into calendars (id, name, status) values (1, 'Etna Calendar', 'active');
insert into session_types (id, name) values (1, 'Direct Therapy');
insert into client_availability (id, client_id, day) values (1, 1, 'Mon');
insert into staff_availability (id, staff_id, day) values (1, 1, 'Mon');

\i supabase/migrations/0013_scheduler_tables_clinic_scoping.sql
\i supabase/migrations/0014_clinician_caseload_read_access.sql
\i supabase/migrations/0039_scheduler_staff_roster_read_access.sql
\i supabase/migrations/0046_clinician_scheduler_access.sql

-- Second clinic, to prove every new policy stays clinic-scoped.
insert into clinics (id, name, slug) values ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');
insert into locations (id, name, clinic_id) values (2, 'Second Main', '22222222-2222-2222-2222-222222222222');
insert into session_types (id, name, clinic_id) values (2, 'Second Type', '22222222-2222-2222-2222-222222222222');
insert into calendars (id, name, status, clinic_id) values (2, 'Second Calendar', 'active', '22222222-2222-2222-2222-222222222222');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'clinician1@x'),   -- linked to staff 1
  ('22222222-1111-1111-1111-111111111111', 'clinician2@x'),   -- linked to staff 2
  ('33333333-1111-1111-1111-111111111111', 'clinician-unlinked@x'), -- no employment_records row
  ('44444444-1111-1111-1111-111111111111', 'admin@x'),
  ('55555555-1111-1111-1111-111111111111', 'scheduler@x');
insert into profiles (id, role, clinic_id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'clinician', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Clinician One'),
  ('22222222-1111-1111-1111-111111111111', 'clinician', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Clinician Two'),
  ('33333333-1111-1111-1111-111111111111', 'clinician', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Clinician Unlinked'),
  ('44444444-1111-1111-1111-111111111111', 'admin', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Admin'),
  ('55555555-1111-1111-1111-111111111111', 'scheduler', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Scheduler');

insert into employment_records (clinic_id, user_id, staff_id, end_date) values
  ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', '11111111-1111-1111-1111-111111111111', 1, null),
  ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', '22222222-1111-1111-1111-111111111111', 2, null);
-- clinician-unlinked deliberately gets NO employment_records row at all.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'clinician1') then create role clinician1 nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'clinician2') then create role clinician2 nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'clinician_unlinked') then create role clinician_unlinked nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'schedadmin') then create role schedadmin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'schedsched') then create role schedsched nologin; end if;
end $$;
grant usage on schema public, auth to clinician1, clinician2, clinician_unlinked, schedadmin, schedsched;
grant select, insert, update, delete on all tables in schema public to clinician1, clinician2, clinician_unlinked, schedadmin, schedsched;
grant usage on all sequences in schema public to clinician1, clinician2, clinician_unlinked, schedadmin, schedsched;
grant select on auth.users to clinician1, clinician2, clinician_unlinked, schedadmin, schedsched;

\i supabase/tests/_try.sql

-- ── Read parity: clinician1 can now read the five previously-empty tables ──
set role clinician1;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select try('Clinician reads Etna session_types (expect 1 - was 0 before 0046)', $q$ select 1 from session_types where id = 1 $q$);
select try('Clinician reads Etna locations (expect 1 - was 0 before 0046)', $q$ select 1 from locations where id = 1 $q$);
select try('Clinician reads Etna calendars (expect 1 - was 0 before 0046)', $q$ select 1 from calendars where id = 1 $q$);
select try('Clinician reads Etna client_availability (expect 1 - was 0 before 0046)', $q$ select 1 from client_availability where id = 1 $q$);
select try('Clinician reads Etna staff_availability (expect 1 - was 0 before 0046)', $q$ select 1 from staff_availability where id = 1 $q$);
select try('Clinician still sees full staff roster (expect 1 - 0039)', $q$ select 1 from staff where id = 2 $q$);
select try('Clinician reads Second-clinic session_types (expect NO-OP - still clinic-scoped)', $q$ select 1 from session_types where id = 2 $q$);
select try('Clinician reads Second-clinic calendars (expect NO-OP)', $q$ select 1 from calendars where id = 2 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Write scoping: clinician1 (linked to staff 1) ──────────────────────────
set role clinician1;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select try('Clinician1 inserts a session for THEMSELVES (staff 1) (expect ALLOWED)',
  $q$ insert into sessions (client_id, employee_id, status, clinic_id) values (1, 1, 'scheduled', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Clinician1 reschedules THEIR OWN session 1 (expect ALLOWED)',
  $q$ update sessions set hour = 10 where id = 1 $q$);
select try('Clinician1 cancels THEIR OWN session 1 (expect ALLOWED)',
  $q$ update sessions set status = 'cancelled' where id = 1 $q$);
select try('Clinician1 inserts a session for COLLEAGUE (staff 2) (expect BLOCKED)',
  $q$ insert into sessions (client_id, employee_id, status, clinic_id) values (1, 2, 'scheduled', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Clinician1 updates COLLEAGUE''s session 2 (expect NO-OP - not visible to this policy''s USING)',
  $q$ update sessions set hour = 11 where id = 2 $q$);
select try('Clinician1 cannot reassign their own session TO a colleague (expect NO-OP - WITH CHECK rejects the new row)',
  $q$ update sessions set employee_id = 2 where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Write scoping: clinician2 (linked to staff 2) - the mirror case ────────
set role clinician2;
set request.jwt.claim.sub = '22222222-1111-1111-1111-111111111111';
select try('Clinician2 reschedules THEIR OWN session 2 (expect ALLOWED)',
  $q$ update sessions set hour = 13 where id = 2 $q$);
select try('Clinician2 updates clinician1''s session 1 (expect NO-OP)',
  $q$ update sessions set hour = 14 where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── The unlinked clinician: full read, zero write ──────────────────────────
set role clinician_unlinked;
set request.jwt.claim.sub = '33333333-1111-1111-1111-111111111111';
select try('Unlinked clinician reads Etna session_types (expect 1 - read parity is unconditional)', $q$ select 1 from session_types where id = 1 $q$);
select try('Unlinked clinician reads Etna sessions (expect >=1 - clinic-wide read via 0014, unaffected by the link)', $q$ select 1 from sessions where id = 1 $q$);
select try('Unlinked clinician inserts a session naming a REAL staff_id (1) they are not linked to (expect BLOCKED)',
  $q$ insert into sessions (client_id, employee_id, status, clinic_id) values (1, 1, 'scheduled', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Unlinked clinician updates session 1 (expect NO-OP - no employment_records row to match at all)',
  $q$ update sessions set hour = 15 where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── admin/scheduler: unchanged, full clinic-wide read/write ────────────────
set role schedadmin;
set request.jwt.claim.sub = '44444444-1111-1111-1111-111111111111';
select try('Admin still has full write on ANY session regardless of employee_id (expect ALLOWED)',
  $q$ update sessions set status = 'cancelled' where id = 2 $q$);
select try('Admin still has full write on session_types (expect ALLOWED)',
  $q$ update session_types set name = 'Renamed' where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

set role schedsched;
set request.jwt.claim.sub = '55555555-1111-1111-1111-111111111111';
select try('Scheduler still has full write on ANY session regardless of employee_id (expect ALLOWED)',
  $q$ update sessions set status = 'cancelled' where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;
