-- policy_acknowledgements: a one-way latch.
--
-- The screen writes in two steps - a row when the policy is opened, then
-- acknowledged_at when it is accepted - so this table cannot be insert-only.
-- What must hold is that an acknowledgement, once made, can never be revised,
-- backdated, moved to another policy or version, or deleted.

insert into hr_policies (id, clinic_id, name, version, effective_date, required)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Employee Handbook', '2026.1', current_date, true)
on conflict do nothing;

set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select try('emp records opening a policy',
  $q$insert into policy_acknowledgements (clinic_id, policy_id, user_id, version, opened_at)
     values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000001','2026.1', now())$q$);

select try('emp inserts a row already marked acknowledged',
  $q$insert into policy_acknowledgements (clinic_id, policy_id, user_id, version, opened_at, acknowledged_at)
     values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000001','9.9', now(), now())$q$);

select try('emp repoints an unacknowledged row at another version',
  $q$update policy_acknowledgements set version = '1999.1'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = '2026.1'$q$);

select try('emp acknowledges',
  $q$update policy_acknowledgements set acknowledged_at = now()
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = '2026.1'$q$);

select try('emp backdates their acknowledgement',
  $q$update policy_acknowledgements set acknowledged_at = now() - interval '30 days'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = '2026.1'$q$);

select try('emp un-acknowledges',
  $q$update policy_acknowledgements set acknowledged_at = null
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = '2026.1'$q$);

select try('emp deletes the acknowledgement',
  $q$delete from policy_acknowledgements
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = '2026.1'$q$);

reset role;
set role sup;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select try('supervisor deletes a team member acknowledgement',
  $q$delete from policy_acknowledgements
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);
reset role;
