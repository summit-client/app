\set QUIET on
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on


set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select try('emp uploads own outside certificate',
  $q$insert into hub_certificates(user_id,clinic_id,title,issuer,source)
     values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','CPI Blue Card','CPI','SELF_REPORTED')$q$);

select try('emp corrects own unverified upload',
  $q$update hub_certificates set expiry_date = '2027-01-01'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

select try('emp forges a SUMMIT_ISSUED certificate',
  $q$insert into hub_certificates(user_id,clinic_id,title,source,cert_number)
     values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Onboarding','SUMMIT_ISSUED','SUMMIT-2026-000001')$q$);

select try('emp mints a registry number on a self-reported row',
  $q$update hub_certificates set cert_number = 'SUMMIT-2026-000042'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

select try('emp verifies their own certificate',
  $q$update hub_certificates set verified = true
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

select try('emp deletes their own certificate',
  $q$delete from hub_certificates where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

reset role;
set role sup;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select try('supervisor verifies the team member''s upload',
  $q$update hub_certificates set verified = true, verified_by = 'bbbbbbbb-0000-0000-0000-000000000002', verified_at = now()
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

select try('supervisor records a SUMMIT_ISSUED certificate',
  $q$insert into hub_certificates(user_id,clinic_id,title,source,cert_number)
     values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Onboarding','SUMMIT_ISSUED','SUMMIT-2026-000001')$q$);

select try('supervisor deletes a certificate',
  $q$delete from hub_certificates where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$);

reset role;
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select try('emp edits their now-VERIFIED certificate',
  $q$update hub_certificates set title = 'Something Else'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and verified$q$);
reset role;
