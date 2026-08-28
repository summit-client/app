-- Minimal harness: scorecard_metrics only needs clinics/profiles/auth_*() to
-- exercise 0015's policies, not the rest of the HR module's tables.

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

create table scorecard_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  metric_key text not null,
  domain text not null,
  behaviour text not null,
  source text not null check (source in ('SELF', 'PEER', 'SUPERVISOR', 'OBJECTIVE', 'PD', 'COMPLIANCE')),
  weight numeric not null default 1,
  applies_to_roles jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  unique (clinic_id, metric_key)
);
alter table scorecard_metrics enable row level security;
-- Before 0015: no policy at all here, matching production exactly.

\i supabase/migrations/0015_scorecard_metrics_rls.sql

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

-- A shared/system-default metric (clinic_id null) plus an Etna-specific one.
insert into scorecard_metrics (id, clinic_id, metric_key, domain, behaviour, source) values
  ('00000000-0000-0000-0000-000000000001', null, 'global.punctuality', 'Reliability', 'Arrives on time', 'OBJECTIVE'),
  ('00000000-0000-0000-0000-000000000002', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etna.custom', 'Custom', 'Etna-specific behaviour', 'SUPERVISOR');

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

set role clinician_etna;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select try('Clinician reads the global metric (expect 1 - was 0 before 0015)',
  $q$ select 1 from scorecard_metrics where metric_key = 'global.punctuality' $q$);
select try('Clinician reads Etna''s own metric (expect 1 - was 0 before 0015)',
  $q$ select 1 from scorecard_metrics where metric_key = 'etna.custom' $q$);
select try('Clinician cannot write a metric (expect BLOCKED)',
  $q$ insert into scorecard_metrics (clinic_id, metric_key, domain, behaviour, source)
      values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'sneaky', 'x', 'x', 'OBJECTIVE') $q$);
reset role;
reset request.jwt.claim.sub;

set role admin_etna;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
select try('Etna admin adds an Etna metric (expect 1)',
  $q$ insert into scorecard_metrics (clinic_id, metric_key, domain, behaviour, source)
      values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etna.new', 'x', 'x', 'OBJECTIVE') $q$);
reset role;
reset request.jwt.claim.sub;

set role admin_second;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-00000000000c';
select try('Second admin reads the global metric (expect 1)',
  $q$ select 1 from scorecard_metrics where metric_key = 'global.punctuality' $q$);
select try('Second admin cannot read Etna''s clinic-specific metric (expect NO-OP)',
  $q$ select 1 from scorecard_metrics where metric_key = 'etna.custom' $q$);
select try('Second admin cannot insert a metric tagged as Etna''s (expect BLOCKED)',
  $q$ insert into scorecard_metrics (clinic_id, metric_key, domain, behaviour, source)
      values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'sneaky2', 'x', 'x', 'OBJECTIVE') $q$);
reset role;
reset request.jwt.claim.sub;
