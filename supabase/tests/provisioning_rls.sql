-- Self-contained, same harness pattern as scheduler_clinic_scoping.sql.
-- Confirms platform_operators and provisioning_audit grant nothing to any
-- client-role connection beyond provisioning_audit's one admin-read policy -
-- every write (and platform_operators' one read) is service-role only, by
-- design, exercised by the Edge Functions rather than by RLS.

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

\i supabase/migrations/0017_provisioning_tables.sql

insert into clinics (id, name, slug) values
  ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Mount Etna', 'mount-etna'),
  ('22222222-2222-2222-2222-222222222222', 'Second Clinic', 'second-clinic');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin-etna@x'),
  ('11111111-1111-1111-1111-111111111111', 'clinician-etna@x'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin-second@x');
insert into profiles (id, role, clinic_id, full_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Admin Etna'),
  ('11111111-1111-1111-1111-111111111111', 'clinician', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Clinician Etna'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin', '22222222-2222-2222-2222-222222222222', 'Admin Second');

insert into platform_operators (user_id, note) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'test operator');

-- Rows an Edge Function's service-role client would have written.
insert into provisioning_audit (actor_id, actor_clinic_id, action, target_user_id, target_clinic_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'invite', '11111111-1111-1111-1111-111111111111', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'),
  ('cccccccc-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222', 'invite', 'cccccccc-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222');

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'admin_etna') then create role admin_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'clinician_etna') then create role clinician_etna nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'admin_second') then create role admin_second nologin; end if;
end $$;
grant usage on schema public, auth to admin_etna, clinician_etna, admin_second;
grant select, insert, update, delete on all tables in schema public to admin_etna, clinician_etna, admin_second;
grant usage on all sequences in schema public to admin_etna, clinician_etna, admin_second;
grant select on auth.users to admin_etna, clinician_etna, admin_second;

\i supabase/tests/_try.sql

-- ── platform_operators: nobody reads or writes it via RLS, not even an
--    operator reading their own row - the Edge Function checks membership
--    with its service-role client, which bypasses RLS entirely. ───────────
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Operator cannot read their own platform_operators row via RLS (expect NO-OP)',
  $q$ select 1 from platform_operators where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $q$);
select try('Admin cannot insert into platform_operators (expect BLOCKED or NO-OP)',
  $q$ insert into platform_operators (user_id) values ('cccccccc-0000-0000-0000-00000000000c') $q$);
reset role;
reset request.jwt.claim.sub;

-- ── provisioning_audit: admin reads their own clinic's rows, nothing else's,
--    and cannot write (no insert/update/delete policy exists). ─────────────
set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin reads Etna''s own audit row (expect 1)',
  $q$ select 1 from provisioning_audit where actor_clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' $q$);
select try('Etna admin cannot read Second clinic''s audit row (expect NO-OP)',
  $q$ select 1 from provisioning_audit where actor_clinic_id = '22222222-2222-2222-2222-222222222222' $q$);
select try('Etna admin cannot insert an audit row directly (expect BLOCKED or NO-OP)',
  $q$ insert into provisioning_audit (actor_id, actor_clinic_id, action) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'invite') $q$);
reset role;
reset request.jwt.claim.sub;

-- ── A non-admin never reads provisioning_audit at all, even their own
--    clinic's. ──────────────────────────────────────────────────────────
set role clinician_etna;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select try('Clinician cannot read Etna''s audit rows (expect NO-OP)',
  $q$ select 1 from provisioning_audit where actor_clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9' $q$);
reset role;
reset request.jwt.claim.sub;
