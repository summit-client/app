-- 0008 · Certificate issuance moves into the database
--
-- Three problems with issuing certificates in the browser.
--
-- 1. The registry number came from a counter in localStorage, so every browser
--    started at 1. Two employees completing onboarding both got
--    SUMMIT-2026-000001. The number is supposed to be a registry.
--
-- 2. Migration 0006 does not let an employee insert a SUMMIT_ISSUED row, which
--    is correct - otherwise anyone can mint a letterhead certificate. So the
--    client cannot be the thing that issues.
--
-- 3. Whether a certificate was EARNED has to be decided somewhere that the
--    person earning it cannot edit.
--
-- What the database can verify by itself, it verifies: a course certificate
-- requires a COMPLETED hub_employee_training row for that course, owned by the
-- caller. That check is airtight and needs no template.
--
-- What it cannot verify, it refuses to guess. The onboarding task TEMPLATE lives
-- in code (apps/employee/lib/content.ts) by 0006's explicit design - only
-- per-employee progress lives here - so the database has no way to know that
-- "all required tasks are complete" is true. Rather than take the client's word
-- for the requirement list, or duplicate the template into a second source of
-- truth that will drift, onboarding certificates are issued by a supervisor
-- through the sign-off queue that already exists. A clinic credential getting a
-- human attestation is the better product answer anyway.

-- ---- registry numbering -----------------------------------------------------

-- One sequence per clinic per year. Not a Postgres sequence: those are global
-- and gapless-per-cluster, and the number has to read SUMMIT-<year>-<seq> per
-- clinic.
create table if not exists hub_certificate_registry (
  clinic_id uuid not null references clinics(id),
  year integer not null,
  last_seq integer not null default 0,
  primary key (clinic_id, year)
);

alter table hub_certificate_registry enable row level security;
-- No policy: reached only through the security definer functions below.

create or replace function hub_next_cert_number(p_clinic uuid)
returns text language plpgsql security definer set search_path = public as $$
declare y integer := extract(year from current_date)::integer;
declare n integer;
begin
  insert into hub_certificate_registry (clinic_id, year, last_seq)
  values (p_clinic, y, 1)
  on conflict (clinic_id, year)
    do update set last_seq = hub_certificate_registry.last_seq + 1
  returning last_seq into n;
  return 'SUMMIT-' || y || '-' || lpad(n::text, 6, '0');
end $$;

-- ---- issuance ---------------------------------------------------------------

-- Self-service, and fully verified: the caller gets a certificate for a course
-- they have actually completed. Idempotent by (user_id, title) so the cascade
-- can call it after every change without minting duplicates - and so a retry
-- after a dropped connection does not burn a registry number.
create or replace function hub_issue_course_certificate(
  p_course_key text, p_title text, p_competency text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
declare v_clinic uuid;
declare v_id uuid;
begin
  if v_user is null then raise exception 'not signed in'; end if;

  select clinic_id into v_clinic from profiles where id = v_user;
  if v_clinic is null then raise exception 'no clinic on profile'; end if;

  -- the whole point: the caller cannot assert this, only satisfy it
  if not exists (
    select 1 from hub_employee_training
    where user_id = v_user and course_key = p_course_key and status = 'COMPLETED'
  ) then
    raise exception 'course % is not complete for this user', p_course_key;
  end if;

  select id into v_id from hub_certificates
   where user_id = v_user and title = p_title and source = 'SUMMIT_ISSUED';
  if v_id is not null then return v_id; end if;

  insert into hub_certificates (user_id, clinic_id, source, cert_number, title, competency, verified, verified_at)
  values (v_user, v_clinic, 'SUMMIT_ISSUED', hub_next_cert_number(v_clinic), p_title, p_competency, true, now())
  returning id into v_id;

  insert into hub_audit_events (clinic_id, actor, subject, action, detail)
  values (v_clinic, v_user, v_user, 'certificate.issued', jsonb_build_object('title', p_title, 'competency', p_competency));

  return v_id;
end $$;

-- Manager issuance: onboarding certificates, and anything the clinic awarded
-- offline. hub_can_manage() is the same check the RLS policies use, so a
-- supervisor is held to their linked team and an admin to their clinic.
create or replace function hub_issue_certificate(
  p_user uuid, p_title text, p_competency text, p_expiry date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_clinic uuid;
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not hub_can_manage(p_user) then
    raise exception 'not permitted to issue certificates for this user';
  end if;

  select clinic_id into v_clinic from profiles where id = p_user;
  if v_clinic is null then raise exception 'no clinic on profile'; end if;
  if v_clinic is distinct from auth_clinic_id() then
    raise exception 'cross-clinic issuance refused';
  end if;

  select id into v_id from hub_certificates
   where user_id = p_user and title = p_title and source = 'SUMMIT_ISSUED';
  if v_id is not null then return v_id; end if;

  insert into hub_certificates (user_id, clinic_id, source, cert_number, title, competency,
                                expiry_date, verified, verified_by, verified_at)
  values (p_user, v_clinic, 'SUMMIT_ISSUED', hub_next_cert_number(v_clinic), p_title, p_competency,
          p_expiry, true, auth.uid(), now())
  returning id into v_id;

  insert into hub_audit_events (clinic_id, actor, subject, action, detail)
  values (v_clinic, auth.uid(), p_user, 'certificate.issued', jsonb_build_object('title', p_title, 'competency', p_competency, 'issued_by', 'manager'));

  return v_id;
end $$;

revoke all on function hub_next_cert_number(uuid) from public;
