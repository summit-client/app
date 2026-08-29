-- Self-contained, same harness pattern as scheduler_clinic_scoping.sql:
-- builds the real pre-0013 shape, applies 0013 (the actual clinic-scoping
-- migration) then 0018 verbatim, so this tests against the real current RLS
-- shape rather than a hand-copied approximation of it.

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
create table sessions (id bigserial primary key, client_id bigint references clients(id), employee_id bigint references staff(id), calendar_id bigint, session_date date, hour int, minute int, status text default 'scheduled');
create table calendars (id bigserial primary key, name text, status text);
create table locations (id bigserial primary key, name text, address text);
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

create policy "Admins have full access to staff_availability" on staff_availability for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Schedulers can read staff_availability" on staff_availability for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'scheduler'));

-- Pre-migration fixtures: Mount Etna already has data, matching the real
-- id migration 0013's backfill targets - exactly today's live situation.
insert into clinics (id, name, slug) values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Mount Etna', 'mount-etna');
insert into locations (id, name, address) values (1, 'Etna Main', '100 Etna Rd');
insert into clients (id, name, location_id) values (1, 'Etna Kid', 1);
insert into staff (id, name, role, location_id) values (1, 'Etna RBT', 'RBT', 1);
insert into sessions (id, client_id, employee_id, status) values (1, 1, 1, 'scheduled');
insert into calendars (id, name, status) values (1, 'Etna Calendar', 'active');
insert into session_types (id, name) values (1, 'Direct Therapy');
insert into client_availability (id, client_id, day) values (1, 1, 'Mon');
insert into staff_availability (id, staff_id, day) values (1, 1, 'Mon');

\i supabase/migrations/0013_scheduler_tables_clinic_scoping.sql
\i supabase/migrations/0018_session_location_and_client_address.sql

-- ── Backfill correctness ─────────────────────────────────────────────────
do $$
declare v_loc bigint;
begin
  select location_id into v_loc from sessions where id = 1;
  if v_loc is distinct from 1 then raise exception 'Etna session backfilled to wrong location: %', v_loc; end if;
  raise notice 'Backfill correctness: PASS (session 1 -> location 1)';
end $$;

-- Second clinic, to prove the new columns don't open a cross-clinic hole.
insert into clinics (id, name, slug) values ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');
insert into locations (id, name, address, clinic_id) values (2, 'Second Main', '200 Second Ave', '22222222-2222-2222-2222-222222222222');
insert into clients (id, name, location_id, clinic_id) values (2, 'Second Kid', 2, '22222222-2222-2222-2222-222222222222');
insert into staff (id, name, role, location_id, clinic_id) values (2, 'Second RBT', 'RBT', 2, '22222222-2222-2222-2222-222222222222');
insert into sessions (id, client_id, employee_id, status, clinic_id) values (2, 2, 2, 'scheduled', '22222222-2222-2222-2222-222222222222');

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

-- ── The new columns don't open a new cross-clinic path - RLS still blocks
--    reading/writing another clinic's session/client rows. ─────────────────
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin reads Etna session incl. new columns (expect 1)',
  $q$ select 1 from sessions where id = 1 and location_id = 1 $q$);
select try('Etna admin sets a home visit on own session (expect 1)',
  $q$ update sessions set is_home_visit = true, location_id = null, home_address = '123 Fake St' where id = 1 $q$);
select try('Etna admin reads Second clinic session (expect NO-OP)',
  $q$ select 1 from sessions where id = 2 $q$);
select try('Etna admin sets an address on their own client (expect 1)',
  $q$ update clients set address = '456 Real Ave' where id = 1 $q$);
select try('Etna admin cannot set an address on Second clinic''s client (expect NO-OP)',
  $q$ update clients set address = 'sneaky' where id = 2 $q$);
reset role;
reset request.jwt.claim.sub;
