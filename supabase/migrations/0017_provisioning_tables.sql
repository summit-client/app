-- ============================================================================
-- Account provisioning: platform_operators + provisioning_audit.
--
-- `profiles` has no UPDATE policy at all (deliberately - see compliance.md,
-- it's what closes a self-escalation hole) and its INSERT policy only lets a
-- signed-in user create their OWN row as role='client', clinic_id=null. So
-- there has never been an RLS path, for any role, to create a staff/admin
-- account or set someone's role/clinic_id/supervisor_id - every account on
-- this platform so far, including the second test clinic's admin, was
-- provisioned by hand via the Supabase dashboard + SQL editor.
--
-- This migration adds no new access to profiles/clinics/clients at all -
-- the three provisioning Edge Functions (supabase/functions/invite-teammate,
-- edit-teammate, provision-clinic) do every privileged write through a
-- service-role client, which bypasses RLS entirely by design and needs no
-- policy help from these tables. What it adds is the two tables those
-- functions depend on, both RLS-enabled with no INSERT/UPDATE/DELETE policy
-- for any role - reached only through the service-role path, exactly like
-- hub_certificate_registry's established pattern ("No policy: reached only
-- through the security definer functions below", migration 0008).
-- ============================================================================

-- Who may call provision-clinic (create a brand-new clinic + its first
-- admin). Deliberately not a profiles.role value - no existing role has, or
-- should have, cross-clinic authority. No UI manages this table in v1;
-- rows are added/removed by hand, the same way every other one-off admin
-- task on this schema has been done so far.
create table if not exists platform_operators (
  user_id uuid primary key references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
alter table platform_operators enable row level security;

-- The audit trail every provisioning action needs, and the rate-limit
-- source: an Edge Function has no reliable shared in-memory state across
-- instances/cold starts the way apps/scheduler/pages/api/match.ts's
-- in-process Map does, so this is the DB-backed equivalent.
create table if not exists provisioning_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references profiles(id),
  actor_clinic_id uuid references clinics(id),
  action text not null check (action in ('invite', 'edit', 'deactivate', 'provision_clinic')),
  target_user_id uuid,
  target_clinic_id uuid references clinics(id),
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table provisioning_audit enable row level security;

-- Admins can see their own clinic's provisioning history. No write policy
-- for anyone - every insert comes from a function's service-role client.
create policy provisioning_audit_admin_read on provisioning_audit for select
  using (actor_clinic_id = auth_clinic_id() and auth_role() = 'admin');

create index if not exists provisioning_audit_actor_idx on provisioning_audit(actor_id, created_at desc);
