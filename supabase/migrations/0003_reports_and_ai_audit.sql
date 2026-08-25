-- ============================================================================
-- 0003 · Evidence-first reporting + clinical AI governance.
-- Reports are versioned; a signed version is immutable — revisions create new
-- versions. Every clinical AI interaction is audited by structured provenance
-- (ids + hashes), not by storing PHI-heavy raw prompts.
-- ============================================================================

-- evidence packet snapshots (the only clinical input the model ever saw)
create table if not exists evidence_packets (
  id text primary key,                       -- pkt-<client>-<start>-<end>
  clinic_id uuid references clinics(id),
  client_id bigint not null,
  period_start date not null,
  period_end date not null,
  packet jsonb not null,
  packet_hash text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists evidence_packets_client_idx on evidence_packets(client_id, created_at desc);

-- clinical reports: draft -> reviewed -> approved -> signed -> locked
create table if not exists clinical_reports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  client_id bigint not null,
  report_group uuid not null,                -- stable across versions of the same report
  version int not null default 1,
  report_type text not null default 'progress_report',
  period_start date not null,
  period_end date not null,
  packet_id text references evidence_packets(id),
  blocks jsonb not null,                     -- ReportBlock[] incl. provenance + review states
  status text not null default 'draft' check (status in
    ('draft','reviewed','approved','signed','locked','superseded')),
  model_note text,
  created_by uuid references profiles(id),
  signed_by uuid references profiles(id),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_group, version)
);
create index if not exists clinical_reports_client_idx on clinical_reports(client_id, created_at desc);

-- a signed/locked version can never be modified; revisions insert version+1
create or replace function forbid_signed_report_update() returns trigger
language plpgsql as $$
begin
  if old.status in ('signed','locked') and new.status not in ('superseded') then
    raise exception 'Signed report versions are immutable; create a new version instead.';
  end if;
  return new;
end $$;
drop trigger if exists clinical_reports_immutable on clinical_reports;
create trigger clinical_reports_immutable
  before update on clinical_reports
  for each row execute function forbid_signed_report_update();

-- AI request audit: structured provenance, hashes and ids — not raw prompts
create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  requesting_user uuid references profiles(id),
  client_id bigint,
  feature text not null,                     -- note_themes | progress_report | ...
  provider text not null,                    -- azure_openai | anthropic | mock
  model text not null,
  prompt_template_version text not null,
  evidence_packet_id text,
  evidence_packet_hash text,
  output_id text,
  accepted boolean,
  clinician_modified boolean,
  approval_status text,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_clinic_idx on ai_requests(clinic_id, created_at desc);

-- RLS
do $$
declare t text;
begin
  foreach t in array array['evidence_packets','clinical_reports','ai_requests'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I_staff_read on %I;', t, t);
    execute format(
      'create policy %I_staff_read on %I for select using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format('drop policy if exists %I_staff_write on %I;', t, t);
    execute format(
      'create policy %I_staff_write on %I for insert with check (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
    execute format('drop policy if exists %I_staff_update on %I;', t, t);
    execute format(
      'create policy %I_staff_update on %I for update using (clinic_id = auth_clinic_id() and auth_is_staff());', t, t);
  end loop;
end $$;
