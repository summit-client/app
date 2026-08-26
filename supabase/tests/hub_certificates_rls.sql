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

select try('supervisor records an outside certificate for a team member',
  $q$insert into hub_certificates(user_id,clinic_id,title,issuer,source)
     values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','First Aid','Red Cross','SELF_REPORTED')$q$);

-- Direct SUMMIT_ISSUED inserts are refused even for a manager: they would pick a
-- registry number the registry does not know about, and collide with the next
-- real issuance. hub_issue_certificate() is the only way in.
select try('supervisor inserts a SUMMIT_ISSUED row directly',
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

-- An outside certificate renewed under the same title must be recordable again.
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select try('emp records a renewal of the same outside certificate',
  $q$insert into hub_certificates(user_id,clinic_id,title,issuer,source,issued_date)
     values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
             'CPI Blue Card','CPI','SELF_REPORTED', current_date + 1)$q$);
reset role;
