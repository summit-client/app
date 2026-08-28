-- ============================================================================
-- scorecard_metrics had row level security enabled (migration 0007) but no
-- policy of any kind - the only table in that migration's "Ecosystem
-- Tracker" section to be left out; every sibling table (scorecard_cycles,
-- scorecard_responses, recognitions, bonus_results, development_goals,
-- forum_posts, forum_comments, hr_audit_log) got one. RLS-enabled plus zero
-- policies is default-deny, not a leak - nobody except a service-role
-- connection can read or write a single row, including the admin who is
-- supposed to define these metrics.
--
-- Not an active bug today: grep confirms apps/employee never queries
-- scorecard_metrics (metric labels for the scorecard UI currently come from
-- a hardcoded list, not this table - `scorecard_responses`/
-- `scorecard_cycles`, which the app does use, already have correct
-- policies from 0007 and are untouched here). But it is exactly the
-- "RLS returns empty sets, not errors" trap CLAUDE.md already warns about:
-- the day something reads this table to make metric definitions
-- clinic-configurable instead of hardcoded, it will silently get zero rows
-- back looking like "no metrics configured" rather than an obvious error.
-- Closing it now, while it's free, rather than after it's someone's bug
-- report.
--
-- Same shape as credential_rule_versions in 0007 (same file, same feature
-- area): clinic_id null means a shared/system-default metric, readable by
-- everyone; a clinic-specific metric is readable only within that clinic and
-- writable only by that clinic's admin. No delete policy, matching this
-- schema's default-deny-deletes convention and every sibling table in 0007.
-- ============================================================================

create policy scorecard_metrics_read on scorecard_metrics for select
  using (clinic_id is null or clinic_id = auth_clinic_id());
create policy scorecard_metrics_admin_insert on scorecard_metrics for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
create policy scorecard_metrics_admin_update on scorecard_metrics for update
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');
