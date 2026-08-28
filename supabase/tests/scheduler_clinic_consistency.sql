-- Self-contained, same harness pattern as scheduler_clinic_scoping.sql.
-- Verifies migration 0016's actual point: RLS alone lets an admin insert a
-- same-clinic-tagged row that cross-references ANOTHER clinic's client/
-- staff by guessable numeric id (sessions.client_id etc are plain bigints,
-- not filtered by the insert policy - only the row's own clinic_id column
-- is). 0016 closes that with a trigger; this proves it was open before and
-- closed after, not just that valid same-clinic writes still work.

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

create policy "Admins and schedulers have full access to client_availability" on client_availability for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','scheduler')));
create policy "Admins and schedulers have full access to staff_availability" on staff_availability for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','scheduler')));

insert into clinics (id, name, slug) values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Mount Etna', 'mount-etna');
insert into clients (id, name) values (1, 'Etna Kid');
insert into staff (id, name, role) values (1, 'Etna RBT', 'RBT');
insert into sessions (id, client_id, employee_id, status) values (1, 1, 1, 'scheduled');
insert into client_availability (id, client_id, day) values (1, 1, 'Mon');
insert into staff_availability (id, staff_id, day) values (1, 1, 'Mon');

\i supabase/migrations/0013_scheduler_tables_clinic_scoping.sql
\i supabase/migrations/0016_scheduler_tables_clinic_consistency.sql

insert into clinics (id, name, slug) values ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');
insert into clients (id, name, clinic_id) values (2, 'Second Kid', '22222222-2222-2222-2222-222222222222');
insert into staff (id, name, role, clinic_id) values (2, 'Second RBT', 'RBT', '22222222-2222-2222-2222-222222222222');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin-etna@x'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin-second@x');
insert into profiles (id, role, clinic_id, full_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Admin Etna'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin', '22222222-2222-2222-2222-222222222222', 'Admin Second');

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'admin_etna') then create role admin_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'admin_second') then create role admin_second nologin; end if;
end $$;
grant usage on schema public, auth to admin_etna, admin_second;
grant select, insert, update, delete on all tables in schema public to admin_etna, admin_second;
grant usage on all sequences in schema public to admin_etna, admin_second;
grant select on auth.users to admin_etna, admin_second;

\i supabase/tests/_try.sql

-- ── Legitimate same-clinic writes still work ────────────────────────────────
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin books a session for Etna client+staff (expect 1)',
  $q$ insert into sessions (id, client_id, employee_id, status, clinic_id) values (100, 1, 1, 'scheduled', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Etna admin adds Etna client_availability (expect 1)',
  $q$ insert into client_availability (id, client_id, day, clinic_id) values (100, 1, 'Tue', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Etna admin adds Etna staff_availability (expect 1)',
  $q$ insert into staff_availability (id, staff_id, day, clinic_id) values (100, 1, 'Tue', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
reset role;
reset request.jwt.claim.sub;

-- ── The actual gap: a same-clinic-tagged row cross-referencing another
--    clinic's client/staff by guessed id. RLS's insert check only looks at
--    the row's own clinic_id column, which is (legitimately) the writer's
--    own clinic - it says nothing about what client_id/employee_id points
--    at. Before 0016 every one of these would have been ALLOWED. ────────────
set role admin_second;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-00000000000c';
select try('Second admin books own-clinic session but against Etna''s client (expect BLOCKED)',
  $q$ insert into sessions (id, client_id, employee_id, status, clinic_id) values (101, 1, 2, 'scheduled', '22222222-2222-2222-2222-222222222222') $q$);
select try('Second admin books own-clinic session but against Etna''s staff (expect BLOCKED)',
  $q$ insert into sessions (id, client_id, employee_id, status, clinic_id) values (102, 2, 1, 'scheduled', '22222222-2222-2222-2222-222222222222') $q$);
select try('Second admin adds own-clinic availability against Etna''s client (expect BLOCKED)',
  $q$ insert into client_availability (id, client_id, day, clinic_id) values (101, 1, 'Wed', '22222222-2222-2222-2222-222222222222') $q$);
select try('Second admin adds own-clinic availability against Etna''s staff (expect BLOCKED)',
  $q$ insert into staff_availability (id, staff_id, day, clinic_id) values (101, 1, 'Wed', '22222222-2222-2222-2222-222222222222') $q$);
-- Legitimate second-clinic write for comparison, in the same session:
select try('Second admin books a session for Second client+staff (expect 1)',
  $q$ insert into sessions (id, client_id, employee_id, status, clinic_id) values (103, 2, 2, 'scheduled', '22222222-2222-2222-2222-222222222222') $q$);
reset role;
reset request.jwt.claim.sub;
