-- Self-contained: does not use _harness.sql's minimal clients/staff/sessions
-- stubs (other tests depend on that exact minimal shape and its lack of
-- policies - extending it here would risk changing their behavior). Builds
-- its own realistic pre-migration shape for the eight legacy scheduler
-- tables, including their real live policies, then applies migration 0013
-- verbatim and verifies clinic isolation actually holds across two clinics.

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

-- The eight legacy tables, pre-migration: real columns needed to exercise
-- the policies (own-record joins, availability joins), their real live
-- policies exactly as queried from pg_policies on the actual project.

create table clients (id bigserial primary key, name text, location_id bigint, user_id uuid references auth.users(id));
create table staff (id bigserial primary key, name text, role text, location_id bigint, user_id uuid references auth.users(id));
create table sessions (id bigserial primary key, client_id bigint references clients(id), employee_id bigint references staff(id), calendar_id bigint, status text default 'scheduled');
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

-- Pre-migration fixtures: Mount Etna already has data (the real id, matching
-- what the migration's backfill targets) before a second clinic ever
-- existed - exactly today's live situation.
insert into clinics (id, name, slug) values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Mount Etna', 'mount-etna');
insert into locations (id, name) values (1, 'Etna Main');
insert into clients (id, name, location_id) values (1, 'Etna Kid', 1);
insert into staff (id, name, role, location_id) values (1, 'Etna RBT', 'RBT', 1);
insert into sessions (id, client_id, employee_id, status) values (1, 1, 1, 'scheduled');
insert into calendars (id, name, status) values (1, 'Etna Calendar', 'active');
insert into session_types (id, name) values (1, 'Direct Therapy');
insert into client_availability (id, client_id, day) values (1, 1, 'Mon');
insert into staff_availability (id, staff_id, day) values (1, 1, 'Mon');

\i supabase/migrations/0013_scheduler_tables_clinic_scoping.sql

-- Now a second clinic shows up - the actual point of this migration.
insert into clinics (id, name, slug) values ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');
insert into locations (id, name, clinic_id) values (2, 'Second Main', '22222222-2222-2222-2222-222222222222');
insert into clients (id, name, location_id, clinic_id) values (2, 'Second Kid', 2, '22222222-2222-2222-2222-222222222222');
insert into staff (id, name, role, location_id, clinic_id) values (2, 'Second RBT', 'RBT', 2, '22222222-2222-2222-2222-222222222222');
insert into sessions (id, client_id, employee_id, status, clinic_id) values (2, 2, 2, 'scheduled', '22222222-2222-2222-2222-222222222222');
insert into calendars (id, name, status, clinic_id) values (2, 'Second Calendar', 'active', '22222222-2222-2222-2222-222222222222');
insert into session_types (id, name, clinic_id) values (2, 'Assessment', '22222222-2222-2222-2222-222222222222');
insert into client_availability (id, client_id, day, clinic_id) values (2, 2, 'Tue', '22222222-2222-2222-2222-222222222222');
insert into staff_availability (id, staff_id, day, clinic_id) values (2, 2, 'Tue', '22222222-2222-2222-2222-222222222222');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin-etna@x'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'sched-etna@x'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin-second@x'),
  ('dddddddd-0000-0000-0000-00000000000d', 'client-etna@x');
insert into profiles (id, role, clinic_id, full_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Admin Etna'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'scheduler', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Sched Etna'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin', '22222222-2222-2222-2222-222222222222', 'Admin Second'),
  ('dddddddd-0000-0000-0000-00000000000d', 'client', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Client Etna');
update clients set user_id = 'dddddddd-0000-0000-0000-00000000000d' where id = 1;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'admin_etna') then create role admin_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'sched_etna') then create role sched_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'admin_second') then create role admin_second nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'client_etna') then create role client_etna nologin; end if;
end $$;
grant usage on schema public, auth to admin_etna, sched_etna, admin_second, client_etna;
grant select, insert, update, delete on all tables in schema public to admin_etna, sched_etna, admin_second, client_etna;
grant usage on all sequences in schema public to admin_etna, sched_etna, admin_second, client_etna;
grant select on auth.users to admin_etna, sched_etna, admin_second, client_etna;

\i supabase/tests/_try.sql

-- ── Etna admin: full access to Etna's own rows ──────────────────────────────
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin reads Etna client (expect 1)', $q$ select 1 from clients where id = 1 $q$);
select try('Etna admin reads Etna staff (expect 1)', $q$ select 1 from staff where id = 1 $q$);
select try('Etna admin reads Etna session (expect 1)', $q$ select 1 from sessions where id = 1 $q$);
select try('Etna admin updates Etna client (expect 1)', $q$ update clients set name = 'Etna Kid Renamed' where id = 1 $q$);
select try('Etna admin deletes Etna staff_availability (expect 1)', $q$ delete from staff_availability where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Etna admin: the actual point - zero visibility into the second clinic ──
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin reads Second client (expect NO-OP, 0 rows)', $q$ select 1 from clients where id = 2 $q$);
select try('Etna admin reads Second staff (expect NO-OP)', $q$ select 1 from staff where id = 2 $q$);
select try('Etna admin reads Second session (expect NO-OP)', $q$ select 1 from sessions where id = 2 $q$);
select try('Etna admin reads Second calendar (expect NO-OP)', $q$ select 1 from calendars where id = 2 $q$);
select try('Etna admin reads Second location (expect NO-OP)', $q$ select 1 from locations where id = 2 $q$);
select try('Etna admin reads Second session_type (expect NO-OP)', $q$ select 1 from session_types where id = 2 $q$);
select try('Etna admin reads Second client_availability (expect NO-OP)', $q$ select 1 from client_availability where id = 2 $q$);
select try('Etna admin reads Second staff_availability (expect NO-OP)', $q$ select 1 from staff_availability where id = 2 $q$);
-- Can an Etna admin even write into the second clinic by naming its id?
select try('Etna admin inserts a client INTO Second clinic (expect BLOCKED)',
  $q$ insert into clients (name, clinic_id) values ('Sneaky', '22222222-2222-2222-2222-222222222222') $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Second-clinic admin: symmetric isolation the other direction ──────────
set role admin_second;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-00000000000c';
select try('Second admin reads Second client (expect 1)', $q$ select 1 from clients where id = 2 $q$);
select try('Second admin reads Etna client (expect NO-OP)', $q$ select 1 from clients where id = 1 $q$);
select try('Second admin reads Etna session (expect NO-OP)', $q$ select 1 from sessions where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── scheduler role: full access within own clinic, read-only on
--    admin-managed tables, exactly as before - just clinic-scoped now ──────
set role sched_etna;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
select try('Etna scheduler reads Etna client (expect 1)', $q$ select 1 from clients where id = 1 $q$);
select try('Etna scheduler updates Etna client (expect 1 - equal access preserved)', $q$ update clients set name = 'Renamed by Sched' where id = 1 $q$);
select try('Etna scheduler reads Etna staff (expect 1 - read-only preserved)', $q$ select 1 from staff where id = 1 $q$);
select try('Etna scheduler updates Etna staff (expect BLOCKED - read-only preserved)', $q$ update staff set name = 'Hacked' where id = 1 $q$);
select try('Etna scheduler reads Second client (expect NO-OP)', $q$ select 1 from clients where id = 2 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── "own record" policies still work, untouched by clinic scoping ─────────
set role client_etna;
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-00000000000d';
select try('Client reads own client record (expect 1)', $q$ select 1 from clients where id = 1 $q$);
select try('Client reads own sessions (expect 1)', $q$ select 1 from sessions where client_id = 1 $q$);
select try('Client reads Second client (expect NO-OP)', $q$ select 1 from clients where id = 2 $q$);
reset role;
reset request.jwt.claim.sub;
