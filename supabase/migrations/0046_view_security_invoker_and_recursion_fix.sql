-- 0046 · Two security fixes found by executing, not by reading
--
-- ===========================================================================
-- BUG 1 · Every view in this schema bypassed row-level security
-- ===========================================================================
--
-- A Postgres view executes with the privileges of its OWNER, not its caller.
-- Migrations run as a superuser, so every view here is superuser-owned, and
-- RLS on the tables underneath it was never applied to anyone reading through
-- it. `security_invoker = true` (PG 15+) is what makes a view evaluate the
-- caller's policies instead.
--
-- Not theoretical. Reading each view as a second clinic's admin and as a family
-- member with no relationship to anyone returned, before this migration:
--
--   client_budget_positions   3 rows      another family's funding
--   client_goal_progress      1 row       another child's clinical progress
--   receipt_lines             3 rows      another family's billing
--   current_employment        2 rows      staff employment records
--   employee_week_economics   2 rows      staff pay
--   pay_rate_compliance       3 rows      staff pay against minimum wage
--   payroll_readiness         2 rows
--   employee_utilization      2 rows
--   employee_work_weeks       2 rows
--   employment_identity       2 rows
--   time_entry_economics      2 rows
--   deployment_readiness      8 rows
--   receipt_readiness         2 rows
--   my_permissions           30 rows      every role's grants
--   rls_coverage            100 rows      the security posture of every table
--
-- A parent could read the clinic's payroll. The tenant isolation the policies
-- describe was correct; nothing was applying it on this path.
--
-- The family-facing views escaped the worst of it by accident rather than by
-- design: `my_family`, `my_message_threads` and `family_tasks` each carry their
-- own `auth.uid()`-derived predicate, so they scoped correctly even with RLS
-- switched off underneath. That is one edit away from not being true, which is
-- why this is fixed at the view level for all of them rather than by trusting
-- each view's where-clause.
--
-- Applied in a loop over `pg_class` rather than as fifteen named statements, so
-- a view added later cannot be forgotten — and asserted by a test that reads
-- every view as a user who should see nothing.
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker'), 'false') <> 'true'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
end $$;

-- ===========================================================================
-- BUG 2 · A guardian could not read household_members at all
-- ===========================================================================
--
-- `household_members_family_read` in 0035 contains a subquery over
-- household_members itself, to answer "may I see the other people on this
-- family record?". That inner select is subject to the same policy, which runs
-- the subquery again:
--
--   ERROR: infinite recursion detected in policy for relation "household_members"
--
-- Every read failed — the family-contacts feature was not merely restricted, it
-- was broken. It went unnoticed because the portal reads `my_family`, and that
-- view was bypassing RLS (bug 1), so the policy was never actually evaluated.
-- Fixing bug 1 without this would have turned a silent leak into a visible
-- outage.
--
-- The fix is to answer the sibling question inside a `security definer`
-- function, which runs with RLS off and therefore does not re-enter the policy.
-- This is the standard shape for a self-referential policy; the function is
-- narrow on purpose, returning a boolean rather than rows.
create or replace function public.auth_can_see_household_contacts(p_household uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.household_members hm
     where hm.household_id = p_household
       and hm.client_id is not null
       and public.auth_guardian_can(hm.client_id, 'view_family_contacts')
  )
$$;

comment on function public.auth_can_see_household_contacts(uuid) is
  'Whether the caller may see who else is on a household record. security '
  'definer because the household_members policy needs to ask a question about '
  'household_members, and asking it inline makes the policy recurse into '
  'itself — which failed every read rather than restricting any.';

drop policy if exists household_members_family_read on household_members;
create policy household_members_family_read on household_members for select
  using (
    household_id = public.auth_household_id()
    and (
      -- Always yourself. A guardian without view_family_contacts can still see
      -- their own row, or they have no record of their own relationship.
      user_id = auth.uid()
      or public.auth_can_see_household_contacts(household_id)
    )
  );

-- ===========================================================================
-- The same recursion, one table over
-- ===========================================================================
--
-- `households_family_read` reads household_members to decide whether the caller
-- belongs, which is fine — different table, no loop. Left alone deliberately:
-- the fix above is for a genuine self-reference, and applying it where there is
-- no recursion would trade a working policy for a security definer function
-- nobody needs.

-- ===========================================================================
-- BUG 3 · Operator diagnostics were readable by families
-- ===========================================================================
--
-- Three views are answers to "is this deployment configured correctly?", not
-- to any question a family has. RLS cannot restrict them on its own:
-- `rls_coverage` reads pg_catalog, which has no policies, and the two readiness
-- views select the checklist rows themselves regardless of what the caller can
-- see underneath. So a signed-in parent could read the clinic's table inventory
-- and which parts of its setup were incomplete.
--
-- Not the same order of severity as bug 1 — no client, clinical or payroll row
-- is exposed — but it is reconnaissance handed to anyone with a portal login,
-- and the fix is one predicate.
--
-- Rewritten from `pg_get_viewdef` rather than by retyping each definition:
-- transcribing a 40-line view to add one where-clause is how a column quietly
-- changes meaning.
do $$
declare v text; def text;
begin
  foreach v in array array['deployment_readiness', 'receipt_readiness', 'rls_coverage']
  loop
    select rtrim(btrim(pg_get_viewdef(format('public.%I', v)::regclass, true)), ';') into def;
    execute format(
      'create or replace view public.%I with (security_invoker = true) as '
      'select * from (%s) diag where public.auth_can(''admin.settings.write'')',
      v, def);
  end loop;
end $$;

comment on view rls_coverage is
  'Which tables have row security on, and which have policies that are not '
  'doing anything. An operator diagnostic: gated on admin.settings.write, '
  'because it reads pg_catalog and so cannot be restricted by RLS.';

-- `my_permissions` is deliberately NOT gated. Every row is about the caller —
-- it lists the action catalogue with a per-caller `granted` flag — so a family
-- member reading it learns the names of actions they do not have and nothing
-- about anyone else. Gating it would break the portal's own ability to ask what
-- the signed-in person may do.

-- ===========================================================================
-- BUG 4 · The client-facing tables were never moved onto the household model
-- ===========================================================================
--
-- 0041 replaced one-login-one-child with households and guardian
-- relationships, and gave the new tables policies to match. It did not migrate
-- the tables that already existed. Reading each one as a guardian shows what
-- that left behind:
--
--   clients          no family policy at all
--   sessions         no family policy at all
--   programs         client_id = auth_client_row_id()
--   client_budgets   client_id = auth_client_row_id()
--   budget_entries   budget_id in (... auth_client_row_id())
--   session_notes    client_id = auth_client_row_id()
--
-- `auth_client_row_id()` reads `clients.user_id = auth.uid()`, the link the
-- household model exists to replace. A guardian has no such link, so it returns
-- null and every one of these policies matches nothing.
--
-- The portal nonetheless worked, because every page reads through a view and
-- those views were bypassing RLS (bug 1). Fixing bug 1 alone would have taken
-- the client portal down: progress, funding, appointments and notes would all
-- have gone empty, with no error to explain it. The two fixes have to land
-- together, which is why they are one migration.
--
-- Each policy below is scoped twice: to the children this guardian may reach,
-- and to the specific permission that governs that surface. So a parent with
-- appointments but not billing gets sessions and not budgets, which is what
-- `relationship_permissions` promises and what nothing was enforcing.

-- The child record itself. `view_profile` is the permission that means "has a
-- portal at all", so this is the narrowest gate that still leaves one working.
drop policy if exists clients_family_read on clients;
create policy clients_family_read on clients for select
  using (public.auth_guardian_can(id, 'view_profile'));

drop policy if exists sessions_family_read on sessions;
create policy sessions_family_read on sessions for select
  using (public.auth_guardian_can(client_id, 'view_appointments'));

-- Replacing, not adding: the old policy is dead weight that reads as though it
-- grants something.
drop policy if exists programs_client_read on programs;
create policy programs_family_read on programs for select
  using (public.auth_guardian_can(client_id, 'view_clinical_progress'));

drop policy if exists client_budgets_client_read on client_budgets;
create policy client_budgets_family_read on client_budgets for select
  using (public.auth_guardian_can(client_id, 'view_billing'));

drop policy if exists budget_entries_client_read on budget_entries;
create policy budget_entries_family_read on budget_entries for select
  using (exists (
    select 1 from public.client_budgets b
     where b.id = budget_entries.budget_id
       and public.auth_guardian_can(b.client_id, 'view_billing')));

-- The signed/countersigned condition is kept exactly as it was. A draft note is
-- a clinician's working document, and the household model changes who may read
-- a note, never which notes are readable.
drop policy if exists session_notes_client_read on session_notes;
create policy session_notes_family_read on session_notes for select
  using (
    public.auth_guardian_can(client_id, 'view_clinical_progress')
    and status in ('signed', 'countersigned')
  );

comment on function public.auth_client_row_id() is
  'LEGACY. Returns the single client whose clients.user_id is the caller — the '
  'one-login-one-child link the household model replaced in 0035. It returns '
  'null for every guardian, so any policy still written in terms of it grants '
  'nothing. Use auth_accessible_client_ids() or auth_guardian_can() instead.';
