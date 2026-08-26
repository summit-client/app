-- 0009: the two live defects it corrects.
--
-- Run this against a database with 0001-0009 applied. Both cases must be
-- BLOCKED / unchanged; before 0009 both succeeded.

-- ---- 1. temp-schema shadowing of profiles --------------------------------
set role emp;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select 'baseline           : ' || coalesce(auth_clinic_id()::text,'null')
       || ' / ' || coalesce(auth_role(),'null') as t;

create temp table profiles (id uuid, clinic_id uuid, role text, full_name text, supervisor_id uuid);
insert into profiles values
  ('aaaaaaaa-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999999','admin','x',null);

-- Must still report the REAL clinic and role. Before 0009 this returned
-- 99999999-... / admin.
select 'after shadowing    : ' || coalesce(auth_clinic_id()::text,'null')
       || ' / ' || coalesce(auth_role(),'null')
       || '   <-- must equal the baseline' as t;

drop table profiles;
reset role;

-- ---- 2. signed clinical report immutability ------------------------------
insert into clinical_reports (id, clinic_id, client_id, report_group, version, report_type,
                              period_start, period_end, blocks, status, signed_by, signed_at)
values ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,
        gen_random_uuid(),1,'progress', current_date-30, current_date,
        '{"summary":"ORIGINAL signed clinical content"}'::jsonb,'signed',
        'bbbbbbbb-0000-0000-0000-000000000002', now())
on conflict do nothing;

select try('rewrite a signed report the obvious way',
  $q$update clinical_reports set blocks='{"summary":"FORGED"}'::jsonb
     where id='eeeeeeee-0000-0000-0000-000000000001'$q$);

-- The bypass: before 0009 this was ALLOWED and rewrote content, signer and
-- signature timestamp in one statement.
select try('rewrite it while also setting status=superseded',
  $q$update clinical_reports set status='superseded', blocks='{"summary":"FORGED"}'::jsonb,
        signed_by='aaaaaaaa-0000-0000-0000-000000000001', signed_at=now()
     where id='eeeeeeee-0000-0000-0000-000000000001'$q$);

-- Superseding on its own is legitimate and must still work.
select try('supersede it properly (status only)',
  $q$update clinical_reports set status='superseded'
     where id='eeeeeeee-0000-0000-0000-000000000001'$q$);

select 'stored state       : ' || status || ' | ' || blocks::text as t
  from clinical_reports where id='eeeeeeee-0000-0000-0000-000000000001';
