-- 0070 · Employee education (highest level achieved)
--
-- Issue #164: staff asked to record credentials outside the regulatory
-- rule engine - an academic degree (e.g. a Masters in Special Education),
-- not a BACB/CPBAO/IBAO registration.
--
-- DELIBERATELY NOT employee_credentials (0007)
--
-- That table, and the whole credentials.ts rule engine it backs, exists for
-- cycle-based, renewable, CEU/PDU/CPD-hour-bearing registrations: cycle_start/
-- cycle_end, a status of GOOD_STANDING/PENDING/LAPSED, and a matching row in
-- credential_rule_versions that computeCompliance() looks up to render
-- anything at all. A degree has none of that - it does not expire, is not
-- "in good standing", and has no governing body publishing a CEU minimum.
-- Recording one as a CredentialKind with no rule would not error: apps/
-- employee/app/credentials/page.tsx only renders the result of
-- computeCompliance(), which returns null for a credential with no matching
-- rule, so it would silently vanish from the screen after being saved -
-- exactly the "RLS returns empty sets, not errors"-shaped trap CLAUDE.md
-- warns about, just from application logic instead of RLS this time.
--
-- So this is its own table, with its own shape, and no link into
-- credential_rule_versions or pd_credit_allocations.
--
-- "Highest education level achieved" is a DERIVED read, not a stored column.
-- A person can hold more than one degree, and a stored
-- profiles.highest_education_level would need every writer to remember to
-- keep it in sync as rows are added or edited - the same class of drift this
-- schema has already paid for once (see CLAUDE.md's clinic_id retrofit
-- note). The application ranks the `level` values it already has
-- (apps/employee/lib/education.ts's EDUCATION_RANK) and picks the highest at
-- read time instead.

create table if not exists employee_education (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in (
    'high_school', 'diploma', 'associate', 'bachelor', 'master', 'doctorate', 'other'
  )),
  field_of_study text,
  institution text,
  -- Nullable: someone may know they hold a Masters without recalling the
  -- exact year, and an approximate record is still useful.
  completed_year integer check (
    completed_year is null
    or completed_year between 1950 and extract(year from now())::int + 1
  ),
  -- Unlike employee_credentials (a registration number a College can be
  -- asked to confirm), nothing here is independently checkable by Summit, so
  -- it is self-reported by default rather than implying HR verified it.
  verification text not null default 'SELF_REPORTED' check (
    verification in ('SELF_REPORTED', 'VERIFIED')
  ),
  created_at timestamptz not null default now()
);

alter table employee_education enable row level security;

-- Same shape as employee_credentials' own policies (0007): own row read/
-- write, plus clinic-wide read for whoever hub_can_manage() admits (an
-- admin, a scheduler, or the person's own supervisor - migration 0022).
-- Per command, never `for all` - deletes stay explicit and owner-only.
create policy employee_education_own_select on employee_education for select
  using (user_id = auth.uid());
create policy employee_education_own_insert on employee_education for insert
  with check (user_id = auth.uid() and clinic_id = auth_clinic_id());
create policy employee_education_own_update on employee_education for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy employee_education_own_delete on employee_education for delete
  using (user_id = auth.uid());
create policy employee_education_manage_select on employee_education for select
  using (clinic_id = auth_clinic_id() and hub_can_manage(user_id));
