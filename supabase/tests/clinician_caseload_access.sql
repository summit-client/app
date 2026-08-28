-- Self-contained, same pattern as scheduler_clinic_scoping.sql: builds the
-- real pre-0013 shape for clients/sessions, applies 0013 then 0014
-- verbatim, and verifies the "empty caseload" fix - clinician/supervisor can
-- now read their own clinic's clients/sessions, still cannot write to
-- either, and still cannot see a second clinic's rows.

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
\i supabase/migrations/0014_clinician_caseload_read_access.sql

-- Second clinic, to prove the new policy is still clinic-scoped.
insert into clinics (id, name, slug) values ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');
insert into locations (id, name, clinic_id) values (2, 'Second Main', '22222222-2222-2222-2222-222222222222');
insert into clients (id, name, location_id, clinic_id) values (2, 'Second Kid', 2, '22222222-2222-2222-2222-222222222222');
insert into staff (id, name, role, location_id, clinic_id) values (2, 'Second RBT', 'RBT', 2, '22222222-2222-2222-2222-222222222222');
insert into sessions (id, client_id, employee_id, status, clinic_id) values (2, 2, 2, 'scheduled', '22222222-2222-2222-2222-222222222222');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'clinician-etna@x'),
  ('22222222-1111-1111-1111-111111111111', 'supervisor-etna@x'),
  ('33333333-1111-1111-1111-111111111111', 'clinician-second@x');
insert into profiles (id, role, clinic_id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'clinician', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Clinician Etna'),
  ('22222222-1111-1111-1111-111111111111', 'supervisor', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Supervisor Etna'),
  ('33333333-1111-1111-1111-111111111111', 'clinician', '22222222-2222-2222-2222-222222222222', 'Clinician Second');

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'clinician_etna') then create role clinician_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supervisor_etna') then create role supervisor_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'clinician_second') then create role clinician_second nologin; end if;
end $$;
grant usage on schema public, auth to clinician_etna, supervisor_etna, clinician_second;
grant select, insert, update, delete on all tables in schema public to clinician_etna, supervisor_etna, clinician_second;
grant usage on all sequences in schema public to clinician_etna, supervisor_etna, clinician_second;
grant select on auth.users to clinician_etna, supervisor_etna, clinician_second;

\i supabase/tests/_try.sql

-- ── The actual bug: clinician could read neither table before 0014 ─────────
set role clinician_etna;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select try('Clinician reads Etna client (expect 1 - was 0 before 0014)', $q$ select 1 from clients where id = 1 $q$);
select try('Clinician reads Etna session (expect 1 - was 0 before 0014)', $q$ select 1 from sessions where id = 1 $q$);
select try('Clinician still cannot write clients (expect BLOCKED)', $q$ update clients set name = 'Hacked' where id = 1 $q$);
select try('Clinician still cannot write sessions (expect BLOCKED)', $q$ update sessions set status = 'cancelled' where id = 1 $q$);
select try('Clinician still cannot insert a client (expect BLOCKED)', $q$ insert into clients (name, clinic_id) values ('Sneaky', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') $q$);
select try('Clinician reads Second clinic client (expect NO-OP - still clinic-scoped)', $q$ select 1 from clients where id = 2 $q$);
select try('Clinician reads Second clinic session (expect NO-OP)', $q$ select 1 from sessions where id = 2 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Supervisor: same fix applies (auth_is_staff() covers both roles) ───────
set role supervisor_etna;
set request.jwt.claim.sub = '22222222-1111-1111-1111-111111111111';
select try('Supervisor reads Etna client (expect 1)', $q$ select 1 from clients where id = 1 $q$);
select try('Supervisor reads Etna session (expect 1)', $q$ select 1 from sessions where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;

-- ── Second-clinic clinician: sees their own clinic, not Etna's ────────────
set role clinician_second;
set request.jwt.claim.sub = '33333333-1111-1111-1111-111111111111';
select try('Second clinician reads Second client (expect 1)', $q$ select 1 from clients where id = 2 $q$);
select try('Second clinician reads Etna client (expect NO-OP)', $q$ select 1 from clients where id = 1 $q$);
reset role;
reset request.jwt.claim.sub;
