\set ON_ERROR_STOP off
\pset format unaligned

-- Requires the standard fixtures (_fixtures.sql) applied on top of
-- migrations 0001-0011.

-- A new orphan (client_id with no matching clients row) must now be refused,
-- where before migration 0011 it silently succeeded.
select try('insert a program referencing a client_id that does not exist (expect BLOCKED)',
  $q$insert into programs (id, clinic_id, client_id, name, measurement_mode, operational_definition, created_by)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 777777, 'Orphan attempt',
             'dtt', 'def', 'aaaaaaaa-0000-0000-0000-000000000001')$q$);

-- Deleting a client that still has clinical history must now be refused
-- instead of silently orphaning it.
insert into clients (id, name) values (500001, 'Has a program');
insert into programs (id, clinic_id, client_id, name, measurement_mode, operational_definition, created_by)
values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 500001, 'Real program',
        'dtt', 'def', 'aaaaaaaa-0000-0000-0000-000000000001');
select try('delete a client with an existing program (expect BLOCKED)',
  $q$delete from clients where id = 500001$q$);

-- A client with no clinical history at all must still be deletable normally -
-- this migration should not make ordinary deletes fail.
insert into clients (id, name) values (500002, 'No clinical history');
select try('delete a client with no clinical history (expect ALLOWED)',
  $q$delete from clients where id = 500002$q$);
