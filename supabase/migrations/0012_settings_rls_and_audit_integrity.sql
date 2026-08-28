-- ============================================================================
-- Two problems in migration 0005's settings tables, found while wiring
-- @summit/settings to real persistence for the first time (it has been
-- localStorage-only since it was written).
--
-- 1. org_settings_admin_write and role_settings_admin_write (and
--    user_settings_own) were written `for all`, which this schema's own rule
--    says never to do: `for all` silently includes DELETE, where every other
--    table in this schema denies it by default. Split into explicit
--    select/insert/update/delete policies per table. DELETE is genuinely
--    needed here - "reset to default" removes the override row entirely -
--    so this isn't dropping a capability, it's making the grant deliberate
--    and reviewable instead of a side effect of `for all`.
--
-- 2. settings_audit_write only checked clinic_id = auth_clinic_id(), never
--    that actor = auth.uid() - any staff member at a clinic could insert an
--    audit row claiming to be a different actor, with fabricated
--    previous/next values. Moot while nothing wrote real audit rows; about
--    to stop being moot.
-- ============================================================================

drop policy if exists org_settings_admin_write on org_settings;
create policy org_settings_admin_insert on org_settings for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy org_settings_admin_update on org_settings for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy org_settings_admin_delete on org_settings for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');

drop policy if exists role_settings_admin_write on role_settings;
create policy role_settings_admin_insert on role_settings for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy role_settings_admin_update on role_settings for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy role_settings_admin_delete on role_settings for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');

drop policy if exists user_settings_own on user_settings;
create policy user_settings_own_select on user_settings for select
  using (user_id = auth.uid());
create policy user_settings_own_insert on user_settings for insert
  with check (user_id = auth.uid());
create policy user_settings_own_update on user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy user_settings_own_delete on user_settings for delete
  using (user_id = auth.uid());

drop policy if exists settings_audit_write on settings_audit;
create policy settings_audit_write on settings_audit for insert
  with check (clinic_id = auth_clinic_id() and actor = auth.uid());
