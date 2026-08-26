-- 0005 · Central configuration service
--
-- One settings source for every Summit module, resolved as
--   Organization Settings → Role Defaults → User Preferences → Module Behaviour
-- Values are key/value JSON; the definition registry (scope, overridable,
-- locked) lives in @summit/settings and is enforced at the API layer, with
-- locked-at-org keys additionally protected here.

create table if not exists org_settings (
  clinic_id uuid not null references clinics(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

create table if not exists role_settings (
  clinic_id uuid not null references clinics(id) on delete cascade,
  role text not null,
  key text not null,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, role, key)
);

create table if not exists user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references clinics(id),
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Who changed what, previous → new. Backs Settings > Privacy & Security >
-- Change history and the "Restore Previous Setting" action.
create table if not exists settings_audit (
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id),
  actor uuid references auth.users(id),
  level text not null check (level in ('org', 'role', 'user')),
  key text not null,
  previous jsonb,
  next jsonb,
  at timestamptz not null default now()
);
create index if not exists settings_audit_clinic_idx on settings_audit(clinic_id, at desc);

alter table org_settings enable row level security;
alter table role_settings enable row level security;
alter table user_settings enable row level security;
alter table settings_audit enable row level security;

-- Everyone in the clinic reads org/role settings; only admins write them.
create policy org_settings_read on org_settings for select
  using (clinic_id = auth_clinic_id());
create policy org_settings_admin_write on org_settings for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');

create policy role_settings_read on role_settings for select
  using (clinic_id = auth_clinic_id());
create policy role_settings_admin_write on role_settings for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');

-- Users read/write only their own preferences.
create policy user_settings_own on user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy settings_audit_read on settings_audit for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());
create policy settings_audit_write on settings_audit for insert
  with check (clinic_id = auth_clinic_id());
