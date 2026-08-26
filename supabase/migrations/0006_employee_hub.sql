-- 0006 · Employee Hub (Summit schema)
--
-- The Employee Hub ported from the Mount Etna hub onto Summit's identity and
-- tenancy model: users are Supabase Auth users with a row in `profiles`
-- (roles admin / supervisor / clinician map to the hub's ADMIN / SUPERVISOR /
-- EMPLOYEE; profiles.supervisor_id links teams). The onboarding/training
-- TEMPLATE lives in code (apps/employee/lib/content.ts, versioned with the
-- app); only per-employee PROGRESS and records live here.

-- HR fields extending profiles.
create table if not exists hub_employee_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  employee_number text,
  job_title text,
  location text,
  start_date date,                 -- drives every onboarding/training deadline
  vsc_status text not null default 'NOT_SUBMITTED'
    check (vsc_status in ('NOT_SUBMITTED', 'APPLIED', 'PENDING', 'CLEARED', 'REQUIRES_FOLLOWUP')),
  updated_at timestamptz not null default now()
);

-- Per-task onboarding progress, keyed by the template's task key.
create table if not exists hub_task_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  task_key text not null,
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_SIGNOFF', 'NOT_APPLICABLE')),
  notes text not null default '',
  applicable boolean not null default true,
  signed_off_by uuid references auth.users(id),
  signed_off_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_key)
);

create table if not exists hub_employee_training (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  course_key text not null,
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  completed_at timestamptz,
  primary key (user_id, course_key)
);

create table if not exists hub_pd_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  title text not null,
  provider text,
  hours numeric not null check (hours > 0),
  date date not null,
  -- certificate reading: CEU classification from the uploaded PDF
  category text not null default 'GENERAL_PD'
    check (category in ('BACB_CEU', 'CPBAO_CE', 'IBAO_CEU', 'GENERAL_PD')),
  ceu_units numeric,
  file_name text,
  detection text,
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Certificates: sequential registry number per year; Module 00 is auto-issued
-- when every required applicable onboarding task completes (app logic,
-- idempotent — the unique index makes double-issue impossible).
-- Certificates come from two places and the difference matters.
--
-- SELF_REPORTED: the employee brings a certificate earned outside Summit (BACB,
-- CPI, first aid). They upload it themselves; it starts unverified and carries
-- the issuing body's own number, or none.
--
-- SUMMIT_ISSUED: Summit generated it - the Module 00 onboarding certificate and
-- the two phase certificates - and it renders on the clinic's approved template
-- with a registry number from the SUMMIT-<year>-<seq> sequence.
--
-- They share a table, so the registry number is what must not be forgeable: an
-- employee who could mint one could produce a certificate that renders on clinic
-- letterhead for training they never did. Hence cert_number is nullable, unique
-- only within the issued namespace, and required only for issued rows.
--
-- `verified` mirrors hub_pd_records: outside evidence arrives unverified and a
-- manager attests to it later. That is the gate, already in place, whenever you
-- decide who turns the key.
create table if not exists hub_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  source text not null default 'SELF_REPORTED'
    check (source in ('SELF_REPORTED', 'SUMMIT_ISSUED')),
  cert_number text,
  issuer text,                     -- external issuing body, for self-reported
  title text not null,
  competency text,
  instructor text,
  issued_date date not null default current_date,
  expiry_date date,
  file_name text,                  -- the uploaded certificate, as hub_pd_records
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hub_certs_issued_needs_number
    check (source <> 'SUMMIT_ISSUED' or cert_number is not null),
  -- The SUMMIT- prefix is the clinic's registry namespace. Reserve it at the
  -- table, not in a policy: an employee may record the issuing body's own
  -- number on an upload, but neither they nor a manager may type a number that
  -- reads as one Summit awarded. Without this, the source check alone still
  -- lets a self-reported row carry SUMMIT-2026-000042.
  constraint hub_certs_registry_prefix_reserved
    check (source = 'SUMMIT_ISSUED' or cert_number is null or cert_number not like 'SUMMIT-%')
);

-- Registry numbers are unique among issued certificates only. An external body's
-- numbering is its own business and must not collide with Summit's sequence.
create unique index if not exists hub_certs_issued_number_idx
  on hub_certificates(cert_number) where source = 'SUMMIT_ISSUED';
create unique index if not exists hub_certificates_once
  on hub_certificates(user_id, title);

create table if not exists hub_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  type text not null check (type in ('VACATION', 'SICK')),
  start_date date not null,
  end_date date not null,
  days numeric not null,
  note text not null default '',
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'DENIED', 'CANCELLED')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  submitted_at timestamptz not null default now()
);

create table if not exists hub_audit_events (
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id),
  actor uuid references auth.users(id),
  subject uuid references auth.users(id),
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create index if not exists hub_audit_clinic_idx on hub_audit_events(clinic_id, at desc);

-- RLS: employees see and write their own rows; supervisors additionally read
-- and decide for their linked team (profiles.supervisor_id); admins see the
-- clinic. Uses the helper functions from migration 0001.
do $$
declare t text;
begin
  foreach t in array array['hub_employee_profiles', 'hub_task_progress', 'hub_employee_training',
    'hub_pd_records', 'hub_certificates', 'hub_time_off_requests', 'hub_audit_events'] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- own rows.
--
-- Every policy here is split per command on purpose. `for all` includes DELETE,
-- and migrations 0001-0005 grant no delete policy anywhere: deletes are denied
-- by default and records are corrected, never removed. An HR schema is the last
-- place to break that rule - `policy_acknowledgements` and `scorecard_responses`
-- are the evidence that the acknowledgement and the rating happened.
create policy hub_profiles_own_select on hub_employee_profiles for select
  using (user_id = auth.uid());
create policy hub_profiles_own_insert on hub_employee_profiles for insert
  with check (user_id = auth.uid());
create policy hub_profiles_own_update on hub_employee_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy hub_progress_own_select on hub_task_progress for select
  using (user_id = auth.uid());
create policy hub_progress_own_insert on hub_task_progress for insert
  with check (user_id = auth.uid());
create policy hub_progress_own_update on hub_task_progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy hub_training_own_select on hub_employee_training for select
  using (user_id = auth.uid());
create policy hub_training_own_insert on hub_employee_training for insert
  with check (user_id = auth.uid());
create policy hub_training_own_update on hub_employee_training for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy hub_pd_own on hub_pd_records for select using (user_id = auth.uid());
create policy hub_pd_own_insert on hub_pd_records for insert with check (user_id = auth.uid());
-- Employees upload their own outside certificates: insert and correct freely
-- while the record is still self-reported and unverified. They cannot mint a
-- registry number, cannot mark a record SUMMIT_ISSUED, and cannot verify
-- themselves - and once a manager verifies it, the row freezes.
create policy hub_certs_own on hub_certificates for select using (user_id = auth.uid());
create policy hub_certs_own_insert on hub_certificates for insert
  with check (
    user_id = auth.uid()
    and source = 'SELF_REPORTED'
    and verified = false
    and verified_by is null
  );
create policy hub_certs_own_update on hub_certificates for update
  using (user_id = auth.uid() and source = 'SELF_REPORTED' and verified = false)
  with check (
    user_id = auth.uid()
    and source = 'SELF_REPORTED'
    and verified = false
    and verified_by is null
  );
create policy hub_timeoff_own on hub_time_off_requests for select using (user_id = auth.uid());
create policy hub_timeoff_own_insert on hub_time_off_requests for insert with check (user_id = auth.uid());

-- supervisor: linked team; admin: whole clinic
create or replace function hub_can_manage(subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'admin'
      or exists (
        select 1 from profiles p
        where p.id = subject and p.supervisor_id = auth.uid()
      );
$$;

-- Manage policies carry an explicit `with check` on every write. The original
-- `for all` form let Postgres reuse `using` as the check, which is fine until
-- the command is split - without it a supervisor could update a row and move it
-- to another clinic or another subject on the way out.
create policy hub_profiles_manage_select on hub_employee_profiles for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_profiles_manage_update on hub_employee_profiles for update
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id))
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

create policy hub_progress_manage_select on hub_task_progress for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_progress_manage_update on hub_task_progress for update
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id))
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

create policy hub_training_manage on hub_employee_training for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_pd_manage on hub_pd_records for update
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id))
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

-- Managers read their team's certificates, record one on someone's behalf, and
-- verify a self-reported upload. Update is how verification happens, so it stays
-- open to them; delete is not granted to anyone.
--
-- Note managers can insert SUMMIT_ISSUED rows: that is deliberate, so a
-- supervisor can record a certificate the clinic awarded offline. Automatic
-- issuance on onboarding completion is separate and still has to move to a
-- security-definer routine in the data-layer change - the app currently mints
-- the registry number client-side, which no policy here permits.
create policy hub_certs_manage_select on hub_certificates for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_certs_manage_insert on hub_certificates for insert
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_certs_manage_update on hub_certificates for update
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id))
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));

create policy hub_timeoff_manage on hub_time_off_requests for update
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id))
  with check (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
create policy hub_audit_read on hub_audit_events for select
  using (clinic_id = auth_clinic_id() and (actor = auth.uid() or hub_can_manage(subject)));
create policy hub_audit_write on hub_audit_events for insert
  with check (clinic_id = auth_clinic_id());
