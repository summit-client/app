\set ON_ERROR_STOP off
\pset format unaligned

-- Requires the standard fixtures (_fixtures.sql: clinic 11111111-...-1,
-- emp = aaaaaaaa-...-1) plus a second clinic and staff member:
--
--   insert into clinics(id,name,slug) values
--     ('22222222-2222-2222-2222-222222222222','Second Clinic','second');
--   insert into auth.users(id,email) values
--     ('cccccccc-0000-0000-0000-000000000003','emp2@x');
--   insert into profiles(id,role,full_name,clinic_id,supervisor_id) values
--     ('cccccccc-0000-0000-0000-000000000003','clinician','Emp2',
--      '22222222-2222-2222-2222-222222222222',null);
--   do $$ begin
--     if not exists (select 1 from pg_roles where rolname='emp2')
--       then create role emp2 nologin; end if;
--   end $$;
--   grant usage on schema public, auth to emp2;
--   grant select,insert,update,delete on all tables in schema public to emp2;
--   grant select on auth.users to emp2;

-- A shared entry (clinic_id null): goal_bank_write requires
-- clinic_id = auth_clinic_id(), which null never satisfies, so - same as the
-- real shared seed rows in migration 0002 - these are only ever created
-- directly (no role set), not by staff at runtime. Unrelated to this fix.
insert into goal_bank_entries (id, clinic_id, name, domain, operational_definition, default_measurement_mode, teaching_procedure)
values ('c0000000-0000-4000-a000-000000000003', null,
        'Shared goal', 'Test', 'def', 'DTT', 'proc');

-- Clinic A creates a private entry; clinic B creates its own private entry.
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into goal_bank_entries (id, clinic_id, name, domain, operational_definition, default_measurement_mode, teaching_procedure)
values ('a0000000-0000-4000-a000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Clinic A private goal', 'Test', 'def', 'DTT', 'proc');
reset role;

set role emp2;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
insert into goal_bank_entries (id, clinic_id, name, domain, operational_definition, default_measurement_mode, teaching_procedure)
values ('b0000000-0000-4000-a000-000000000002', '22222222-2222-2222-2222-222222222222',
        'Clinic B private goal', 'Test', 'def', 'DTT', 'proc');
reset role;

-- ── The leak: clinic B touching clinic A's private entry ──────────────────
set role emp2;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';

select try('emp2 links clinic A''s private entry to their own (expect BLOCKED)',
  $q$insert into goal_bank_relations (from_entry, to_entry, kind)
     values ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000002', 'related')$q$);

reset role;

-- Have clinic A legitimately create the relation the leak test tried to
-- plant, so the read-side check has something to try reading.
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into goal_bank_relations (from_entry, to_entry, kind)
values ('a0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000003', 'related');
reset role;

set role emp2;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select try('emp2 reads a relation touching clinic A''s private entry (expect NO-OP)',
  $q$select 1 from goal_bank_relations where from_entry = 'a0000000-0000-4000-a000-000000000001'$q$);
reset role;

-- ── Still allowed: legitimate uses of the shared library ───────────────────
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select try('emp links their own clinic''s entry to a shared entry (expect ALLOWED)',
  $q$insert into goal_bank_relations (from_entry, to_entry, kind)
     values ('a0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000003', 'prerequisite')$q$);
select try('emp reads relations touching their own entry (expect ALLOWED)',
  $q$select 1 from goal_bank_relations where from_entry = 'a0000000-0000-4000-a000-000000000001'$q$);
reset role;

set role emp2;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select try('emp2 links their own clinic''s entry to the same shared entry (expect ALLOWED)',
  $q$insert into goal_bank_relations (from_entry, to_entry, kind)
     values ('b0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000003', 'related')$q$);
reset role;
