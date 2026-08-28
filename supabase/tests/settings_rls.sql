\set ON_ERROR_STOP off
\pset format unaligned

-- Requires the standard fixtures (_fixtures.sql: clinic
-- 11111111-1111-1111-1111-111111111111, emp = clinician
-- aaaaaaaa-0000-0000-0000-000000000001, sup = supervisor
-- bbbbbbbb-0000-0000-0000-000000000002). Neither is admin, which is exactly
-- the case that matters here.

-- ── org_settings: admin-only write, per-command (not `for all`) ───────────
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select try('non-admin (clinician) inserts an org setting (expect BLOCKED)',
  $q$insert into org_settings (clinic_id, key, value, updated_by, updated_at)
     values ('11111111-1111-1111-1111-111111111111', 'appearance.density', '"Compact"'::jsonb,
             'aaaaaaaa-0000-0000-0000-000000000001', now())$q$);

reset role;

-- An admin fixture: reuse the supervisor row's clinic, promote to admin for
-- this test only.
update profiles set role = 'admin' where id = 'bbbbbbbb-0000-0000-0000-000000000002';

set role sup;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select try('admin inserts an org setting (expect ALLOWED)',
  $q$insert into org_settings (clinic_id, key, value, updated_by, updated_at)
     values ('11111111-1111-1111-1111-111111111111', 'appearance.density', '"Compact"'::jsonb,
             'bbbbbbbb-0000-0000-0000-000000000002', now())$q$);

select try('admin updates that org setting (expect ALLOWED)',
  $q$update org_settings set value = '"Spacious"'::jsonb
     where clinic_id = '11111111-1111-1111-1111-111111111111' and key = 'appearance.density'$q$);

-- Leave one row in place (rather than deleting it) so the next block can
-- prove read access is not admin-gated.
select try('admin inserts a second org setting to leave in place (expect ALLOWED)',
  $q$insert into org_settings (clinic_id, key, value, updated_by, updated_at)
     values ('11111111-1111-1111-1111-111111111111', 'reports.logo', 'true'::jsonb,
             'bbbbbbbb-0000-0000-0000-000000000002', now())$q$);

reset role;

-- Anyone in the clinic can still read org settings, admin or not.
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select try('non-admin reads an org setting an admin set (expect ALLOWED)',
  $q$select 1 from org_settings
     where clinic_id = '11111111-1111-1111-1111-111111111111' and key = 'reports.logo'$q$);
reset role;

-- ── user_settings: self-only, per-command ──────────────────────────────────
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select try('emp writes their own user_settings row (expect ALLOWED)',
  $q$insert into user_settings (user_id, key, value, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'a11y.reduceMotion', 'true'::jsonb, now())$q$);

select try('emp writes a user_settings row for someone else (expect BLOCKED)',
  $q$insert into user_settings (user_id, key, value, updated_at)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'a11y.reduceMotion', 'true'::jsonb, now())$q$);

select try('emp deletes (resets) their own preference (expect ALLOWED)',
  $q$delete from user_settings
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and key = 'a11y.reduceMotion'$q$);

reset role;

-- ── settings_audit: actor must match the real caller ───────────────────────
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select try('emp inserts an audit row claiming to be someone else (expect BLOCKED)',
  $q$insert into settings_audit (clinic_id, actor, level, key, previous, next)
     values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002',
             'user', 'a11y.reduceMotion', 'false'::jsonb, 'true'::jsonb)$q$);

select try('emp inserts an audit row as themselves (expect ALLOWED)',
  $q$insert into settings_audit (clinic_id, actor, level, key, previous, next)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
             'user', 'a11y.reduceMotion', 'false'::jsonb, 'true'::jsonb)$q$);

reset role;
