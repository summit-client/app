-- two employees + one supervisor in one clinic
insert into clinics(id,name,slug) values ('11111111-1111-1111-1111-111111111111','Mount Etna','etna');
insert into auth.users(id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','emp@x'),
 ('bbbbbbbb-0000-0000-0000-000000000002','sup@x');
insert into profiles(id,role,full_name,clinic_id,supervisor_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','clinician','Emp','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002'),
 ('bbbbbbbb-0000-0000-0000-000000000002','supervisor','Sup','11111111-1111-1111-1111-111111111111',null);
do $$ begin
  if not exists (select 1 from pg_roles where rolname='emp') then create role emp nologin; end if;
  if not exists (select 1 from pg_roles where rolname='sup') then create role sup nologin; end if;
end $$;
grant usage on schema public, auth to emp, sup;
grant select,insert,update,delete on all tables in schema public to emp, sup;
grant select on auth.users to emp, sup;
