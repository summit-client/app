set role emp; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select try('emp issues a cert for a course they have NOT completed',
  $q$select hub_issue_course_certificate('cc-whmis','WHMIS','MODULE # 03')$q$);
reset role;
-- record the completion as the employee would
set role emp; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into hub_employee_training(user_id,clinic_id,course_key,status,completed_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','cc-whmis','COMPLETED',now());
select try('emp issues a cert for a course they HAVE completed',
  $q$select hub_issue_course_certificate('cc-whmis','WHMIS','MODULE # 03')$q$);
select try('same call again (idempotent, must not burn a number)',
  $q$select hub_issue_course_certificate('cc-whmis','WHMIS','MODULE # 03')$q$);
select try('emp issues themselves the ONBOARDING certificate',
  $q$select hub_issue_certificate('aaaaaaaa-0000-0000-0000-000000000001','New Team Member Onboarding','MODULE # 00')$q$);
reset role;
set role sup; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select try('supervisor issues the onboarding certificate to their team member',
  $q$select hub_issue_certificate('aaaaaaaa-0000-0000-0000-000000000001','New Team Member Onboarding','MODULE # 00')$q$);
reset role;
