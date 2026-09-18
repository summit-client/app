-- ============================================================================
-- 0087 · One person, one clinic — enforced rather than assumed
--
-- WHAT IS WRONG TODAY
--
-- Five policies identify the caller by reaching THROUGH `staff` or `clients`
-- on `user_id`, and name no clinic:
--
--   sessions            "Staff can read own sessions"
--   sessions            "Clients can read own sessions"
--   staff_availability  "Staff can read own availability"
--   staff_availability  staff_availability_own_delete          (0076)
--   client_availability "Clients can read own availability"
--
-- Each says "this row points at a row that is mine". That only implies "this
-- row is in my clinic" while a person cannot hold rows in two clinics — which
-- is a fact about an INDEX, not about the policy:
--
--   staff    staff_user_id_unique on (user_id) where user_id is not null
--   clients  nothing
--
-- So the staff three are held up by an index in another table, and the client
-- two are held up by nobody having done it yet. Measured on production
-- 2026-09-18: zero people hold staff or client rows in more than one clinic,
-- so nothing leaks today. Drop that index to let somebody work at two clinics
-- and the staff policies start returning the other clinic's sessions, same
-- day, with no other change and no warning.
--
-- A tenant boundary that lives in an index somewhere else is not a boundary.
--
-- WHAT THIS DOES
--
--   1. Names the clinic in all five, plus `clients`' own-row read.
--   2. Gives `clients.user_id` the unique index `staff.user_id` already has,
--      so one login belongs to one clinic for FAMILIES as well as staff —
--      the account owner's decision, 2026-09-18, and the same answer for
--      every role.
--   3. Pins `search_path` on the two `security definer` functions that do not
--      name `pg_temp`.
--   4. Makes `clinic_id` NOT NULL on 37 tables where it is already never
--      null, so an orphan row cannot be created later.
--
-- NOT APPLIED by the session that wrote it. Every premise above was measured
-- against production rather than read out of this repo's migration history —
-- which matters here specifically, because four of the five policies appear
-- in no migration at all. They predate the history and are visible only in
-- `pg_policies`.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight.
--
--    Two people holding rows in two clinics would mean the precondition this
--    migration assumes has ALREADY been broken, and step 2's unique index
--    would fail anyway - better to say which rows, before touching anything.
-- ---------------------------------------------------------------------------
do $$
declare v_staff int; v_clients int; v_who text;
begin
  select count(*) into v_staff from (
    select user_id from public.staff where user_id is not null
     group by user_id having count(distinct clinic_id) > 1) x;
  select count(*) into v_clients from (
    select user_id from public.clients where user_id is not null
     group by user_id having count(distinct clinic_id) > 1) y;

  if v_clients > 0 then
    select string_agg(user_id::text, ', ') into v_who from (
      select user_id from public.clients where user_id is not null
       group by user_id having count(distinct clinic_id) > 1) z;
    raise exception
      '0087: % account(s) already hold client rows in more than one clinic (%). '
      'The unique index in step 2 cannot be created, and the policies below '
      'would have been returning both clinics'' rows to them. Resolve these '
      'first - one login per clinic.', v_clients, v_who;
  end if;

  if v_staff > 0 then
    raise exception '0087: % account(s) hold staff rows in more than one clinic, '
      'which staff_user_id_unique should have prevented. Investigate before '
      'continuing.', v_staff;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Name the clinic in the six policies that do not.
--
--    Each keeps its existing predicate EXACTLY and gains a conjunct. Nobody
--    loses access today: every one of these rows already belongs to the
--    caller's clinic, or the caller could not have reached it. What changes
--    is that the policy now says so itself, instead of depending on an index
--    in another table to make it true.
--
--    Dropped and recreated rather than altered, because Postgres has no
--    `alter policy ... add`. Both halves are in this transaction, so there is
--    no window where the policy is missing.
-- ---------------------------------------------------------------------------

drop policy if exists "Staff can read own sessions" on public.sessions;
create policy "Staff can read own sessions" on public.sessions for select
  using (
    clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.staff
       where staff.id = sessions.employee_id
         and staff.user_id = auth.uid()
    )
  );

drop policy if exists "Clients can read own sessions" on public.sessions;
create policy "Clients can read own sessions" on public.sessions for select
  using (
    clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.clients
       where clients.id = sessions.client_id
         and clients.user_id = auth.uid()
    )
  );

drop policy if exists "Staff can read own availability" on public.staff_availability;
create policy "Staff can read own availability" on public.staff_availability for select
  using (
    clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.staff
       where staff.id = staff_availability.staff_id
         and staff.user_id = auth.uid()
    )
  );

drop policy if exists staff_availability_own_delete on public.staff_availability;
create policy staff_availability_own_delete on public.staff_availability for delete
  using (
    clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.staff s
       where s.id = staff_availability.staff_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "Clients can read own availability" on public.client_availability;
create policy "Clients can read own availability" on public.client_availability for select
  using (
    clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.clients
       where clients.id = client_availability.client_id
         and clients.user_id = auth.uid()
    )
  );

drop policy if exists "Clients can read own record" on public.clients;
create policy "Clients can read own record" on public.clients for select
  using (clinic_id = public.auth_clinic_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. One login, one clinic — for families too.
--
--    `staff` has had this since 0075. `clients` has never had it, which is
--    why the two client-side policies above were the weaker pair: on the
--    staff side something actively prevented the cross-clinic case, and on
--    the client side only the absence of anyone trying.
--
--    Partial, matching staff exactly: a client record can exist before anyone
--    has a portal login, and `user_id` is null until they do (see CLAUDE.md
--    on unlinking rather than deleting). Many nulls, at most one row per
--    actual account.
--
--    THE COST, PLAINLY: a person whose child attends two of your clinics now
--    needs two logins. That is the account owner's decision of 2026-09-18 -
--    the same rule already applied to staff - taken over changing 435
--    policies to carry a set of clinics instead of one.
-- ---------------------------------------------------------------------------
create unique index if not exists clients_user_id_unique
  on public.clients (user_id) where user_id is not null;

comment on index public.clients_user_id_unique is
  'One login belongs to one clinic (0087), matching staff_user_id_unique. '
  'Partial because clients.user_id is null until a family has a portal '
  'account. Without this, "Clients can read own sessions" would return two '
  'clinics'' appointments to one person.';

-- ---------------------------------------------------------------------------
-- 3. `security definer` functions must name pg_temp.
--
--    CLAUDE.md's hard constraint, and 0009 is why: `set search_path = public`
--    alone does not exclude `pg_temp`, and temp-table shadowing let an
--    authenticated user insert themselves as admin of any clinic on this very
--    schema. Two functions still violate it:
--
--      handle_new_user   no search_path at all
--      rls_auto_enable   search_path=pg_catalog - pg_temp is searched
--                        IMPLICITLY when it is not named, so this is the
--                        same hole with extra steps
--
--    THE ONE TO READ TWICE: `handle_new_user` is the trigger on
--    `auth.users` that creates a `profiles` row on signup. If it breaks,
--    NOBODY CAN CREATE AN ACCOUNT. The change is as small as it looks - the
--    body already writes to `public.profiles` fully qualified, so pinning the
--    path cannot redirect it - but the blast radius if it is wrong is total,
--    which is why this is a file to read rather than something applied.
--
--    Lower risk than it reads, for a different reason: the trigger fires on
--    Supabase's own auth connection, not the caller's, so a user cannot plant
--    a temp table in its path. It is the documented anti-pattern rather than
--    a live exploit. Fixed because two functions in the whole database break
--    the rule and this is one of them.
-- ---------------------------------------------------------------------------
--    Conditional, and not out of caution: `handle_new_user` is created by
--    Supabase when the project is set up and appears in no migration here, so
--    a database built from this repo does not have it. A bare ALTER fails the
--    whole file on a fresh build - which is exactly what supabase/tests/apply.mjs
--    does on every CI run. Same for rls_auto_enable.
do $$
declare f text;
begin
  foreach f in array array['handle_new_user', 'rls_auto_enable'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = f) then
      execute format('alter function public.%I() set search_path = public, pg_temp', f);
      raise notice '0087: pinned search_path on public.%()', f;
    else
      raise notice '0087: public.%() not present here, skipped', f;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. `clinic_id` NOT NULL where it is already never null.
--
--    A null clinic_id means the row belongs to nobody. A clinic-predicate
--    policy correctly hides it - `null = anything` is not true - but an
--    own-row policy hands it over regardless, which is the shape section 1
--    is about. Closing it at the column stops the shape existing.
--
--    THE 37 BELOW ARE THE SAFE ONES, measured on production 2026-09-18: every
--    one has zero null rows today. 18 more candidates were VIEWS, which have
--    no nullability to alter. Two real tables are deliberately excluded:
--
--      profiles                 `handle_new_user` inserts (id, email, role)
--                               and NO clinic_id, so NOT NULL here breaks
--                               EVERY SIGNUP immediately. Fixing it means
--                               deciding what clinic a self-signup belongs to
--                               - a product question, not a constraint.
--      credential_rule_versions treated as a platform-defaults table by
--                               supabase/tests/tenancy.mjs; a null clinic
--                               there would mean "every clinic", and NOT NULL
--                               would foreclose that.
--
--    And seven tables keep their nulls BY DESIGN - role_permissions,
--    public_holidays, activity_codes, pay_codes, goal_bank_catalogue,
--    goal_bank_entries, user_settings. `role_permissions` is the one that
--    would have been expensive: auth_can() falls back to its 187 null-clinic
--    rows for every permission decision in the schema, so NOT NULL there
--    denies everything for everyone.
--
--    THE COST, PLAINLY: any INSERT that forgets clinic_id now raises instead
--    of quietly creating an orphan. That is the point, and it is also a
--    behaviour change - a code path that forgot will start erroring rather
--    than failing silently. `hr-backend`'s scoped() adds clinic_id to every
--    row it writes, and the Edge Functions set it explicitly, but this has
--    not been proven for all 37 by execution. If you would rather stage it,
--    run the file with this section commented out and I will re-issue it as
--    its own migration.
-- ---------------------------------------------------------------------------
do $$
declare t text;
declare tables text[] := array[
  'ai_requests','bonus_results','budget_entries','client_budgets','client_sessions',
  'clinical_audit_events','clinical_reports','credential_rule_proposals',
  'development_goals','employee_credentials','evidence_packets','forum_comments',
  'forum_posts','hr_audit_log','hr_policies','hub_audit_events','hub_certificates',
  'hub_employee_profiles','hub_employee_training','hub_pd_records','hub_task_progress',
  'hub_time_off_requests','lesson_clusters','lesson_program_goals','lesson_programs',
  'lesson_resources','pd_activities','pd_credit_allocations','policy_acknowledgements',
  'program_targets','recognitions','scorecard_cycles','scorecard_metrics',
  'scorecard_responses','session_program_summaries','settings_audit',
  'user_permission_grants'];
declare v_nulls bigint;
begin
  foreach t in array tables loop
    -- Re-measured here rather than trusted: this file is applied later than
    -- it was written, and a row with no clinic could have arrived in between.
    execute format('select count(*) from public.%I where clinic_id is null', t) into v_nulls;
    if v_nulls > 0 then
      raise exception '0087: public.% has % row(s) with a null clinic_id, which were not there when this was written. Resolve them before making the column NOT NULL.', t, v_nulls;
    end if;
    execute format('alter table public.%I alter column clinic_id set not null', t);
  end loop;
  raise notice '0087: clinic_id is now NOT NULL on % tables', array_length(tables, 1);
end $$;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICATION - run after the file above. These change nothing.
-- ============================================================================
--
-- 1. The six policies now name a clinic. Expect 6 rows, every `scoped` true.
--
-- select policyname, tablename, (qual ~ 'auth_clinic_id') as scoped
--   from pg_policies
--  where schemaname='public' and policyname in (
--        'Staff can read own sessions','Clients can read own sessions',
--        'Staff can read own availability','staff_availability_own_delete',
--        'Clients can read own availability','Clients can read own record')
--  order by tablename, policyname;
--
-- 2. Nobody lost their own rows. Run as a clinician, then as a family
--    account: both counts should match what they saw before.
--
-- select count(*) from public.sessions;
-- select count(*) from public.staff_availability;
--
-- 3. One login, one clinic, both sides.
--
-- select indexname from pg_indexes
--  where schemaname='public' and indexname in ('staff_user_id_unique','clients_user_id_unique');
--
-- 4. No definer function is missing pg_temp. Expect 0 rows.
--
-- select p.proname, array_to_string(p.proconfig,',')
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.prosecdef
--    and coalesce(array_to_string(p.proconfig,','),'') !~ 'pg_temp';
--
-- 5. Signup still works. THE ONE TO ACTUALLY DO: create a test account
--    through the real signup form and confirm a `profiles` row appears.
--    Step 3 touched the trigger that does it.
--
-- select id, email, role, clinic_id from public.profiles
--  order by id desc limit 3;
--
-- 6. How many clinic_id columns still allow a null. Expect the nine named in
--    section 4's header, and nothing else.
--
-- select table_name from information_schema.columns
--  where table_schema='public' and column_name='clinic_id' and is_nullable='YES'
--    and table_name in (select relname from pg_class c join pg_namespace n
--                        on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
--  order by table_name;
-- ============================================================================
