-- ============================================================================
-- 0077 · Close the clinician <-> client association leak on `sessions`
--
-- WHAT IS ACTUALLY WRONG TODAY
--
-- PR #178 added apps/scheduler/lib/sessionPrivacy.ts: a clinician looking at
-- a COLLEAGUE's session sees the session type and the time, not the client's
-- name or home address. That module's own header is explicit that it is
-- presentation and not access control, and says so for a reason:
--
--   * migration 0014 (`sessions_clinical_staff_select`) grants every
--     `auth_is_staff()` role - admin, supervisor AND clinician - clinic-wide
--     SELECT on `sessions`, every column, every row;
--   * apps/scheduler/pages/index.jsx's loadData() issues a bare
--     `from("sessions").select("*")` with no filter at all, for every role;
--   * so the full client_id/employee_id pairing for every session in the
--     clinic is sitting in the browser tab of every clinician, one devtools
--     Network tab away, with the UI mask painted on top of it.
--
-- The account owner asked for this closed properly. This migration is the
-- database half.
--
-- THE SHAPE OF THE PROBLEM, STATED PRECISELY
--
-- A clinician genuinely NEEDS colleague rows. Remove them and the scheduler's
-- conflict detection, availability shading, "compare schedules" panel, gap
-- warnings and the drag-to-reschedule suggestions all silently degrade to
-- "everything looks free" - which is worse than the leak, because a false
-- "free" books a real double-booking. What must stop is the clinician reading
-- WHICH CLIENT a colleague's session is for. That is a COLUMN-level
-- restriction on a row they may otherwise see, and Postgres RLS is row-level
-- only.
--
-- WHY NOT THE OBVIOUS THINGS (all three were worked through and rejected)
--
-- 1. COLUMN-LEVEL GRANTS - `revoke select (client_id, home_address) on
--    sessions from ...` - cannot express this at all. Every signed-in user
--    in a Supabase project authenticates as the SAME Postgres role,
--    `authenticated`; "clinician" and "admin" are values of `profiles.role`,
--    not database roles. There is no grantee to distinguish, so any revoke
--    that hides the column from a clinician hides it from admin and
--    scheduler too. It also breaks `select *`: Postgres expands the star and
--    errors on the first column the caller lacks, and `.select("*")` on
--    `sessions` is used in apps/scheduler (index.jsx, CalendarView,
--    RescheduleModal) and reached by apps/client and apps/data. Rejected as
--    unusable, not merely awkward.
--
-- 2. A VIEW (`sessions_scoped`) THAT NULLS THE COLUMNS. A view restricts
--    nothing while the base table is still selectable - PostgREST exposes
--    `sessions` directly, so a clinician just queries the table instead and
--    the view is the same theatre the UI mask already is. To be real it must
--    return rows the caller's own policy denies, which means a
--    `security definer` view - and this repo forbids exactly that:
--    migration 0052 found FIFTEEN views silently bypassing RLS (a parent
--    could read the clinic's payroll), set `security_invoker = true` on
--    every view in a loop, and supabase/tests/rls.mjs now FAILS THE SUITE if
--    any view in `public` lacks it. A `security_invoker` view cannot widen,
--    a definer view breaks the test and re-opens the hole 0052 closed.
--    Rejected on this repo's own established posture.
--
-- 3. NARROWING `clients` AND LEAVING `sessions.client_id` READABLE. This is
--    the one that looks sufficient and is not. `client_id` is a small
--    sequential bigint, and the association it encodes is resolvable through
--    tables migrations 0001/0004 already make clinic-wide readable to any
--    `auth_is_staff()` role: `client_sessions` (client_id AND clinician_id
--    on one row), `session_records`, `session_notes` (names in free text),
--    `programs`, `behaviour_incidents`. A clinician reads client_id 42 off a
--    colleague's session and resolves it in one more query. It also breaks
--    real screens - apps/data's getClients() is deliberately clinic-wide
--    (app/clients/[id]/layout.tsx must resolve ANY client in the clinic),
--    apps/scheduler's create wizard and WaitlistView need the roster - and
--    0014's own header records that this schema has NO clinician-to-client
--    assignment model to scope a caseload to. Inventing one here is exactly
--    the kind of architectural decision CLAUDE.md says to get approval for
--    first. Rejected: high cost, closes nothing.
--
-- WHAT THIS MIGRATION DOES INSTEAD
--
-- Two halves, and they only work together:
--
--   A. The row grant is narrowed at the source. 0014's
--      `sessions_clinical_staff_select` is replaced by two policies: admin
--      and supervisor keep the clinic-wide read they have today, and a
--      clinician's direct read of `sessions` narrows to THEIR OWN sessions -
--      the same `employment_records` link migration 0046 already uses to
--      decide which sessions a clinician may WRITE, so read and write now
--      agree (which is what sessionPrivacy.ts's canSeeClientIdentity()
--      already assumes on the UI side). After this, the devtools dump is
--      gone at the source, not painted over.
--
--   B. Colleague occupancy comes back through `public.sessions_visible()` -
--      a `security definer`, `stable`, set-returning FUNCTION that returns
--      every session in the CALLER'S OWN clinic with `client_id` and
--      `home_address` NULLed on any row the caller may not associate. A
--      function, not a view, specifically because 0052/rls.mjs's rule is
--      about `relkind = 'v'`: nothing sweeps functions back to invoker, so
--      this cannot be silently disarmed later the way a view could.
--
-- WHO SEES A CLIENT ID THROUGH `sessions_visible()`
--
--   admin, scheduler, supervisor          every row, unchanged
--   clinician, own session                full detail (employee_id = their
--                                         own staff row)
--   clinician, colleague's session, but   client_id revealed
--   a client they ALSO have a session
--   with
--   clinician, anything else              client_id NULL, home_address NULL,
--                                         client_masked = true
--
-- The third line is deliberate and is what keeps the "compare schedules"
-- panel (components/calendar/SessionSchedulesPanel.tsx) CORRECT rather than
-- merely quiet. That panel's whole job is finding a slot where the clinician
-- AND the client are both free; it queries
-- `.or(employee_id.eq.X, client_id.eq.Y)`, and the client half has to match
-- the client's sessions with OTHER clinicians or it reports "free" for a
-- client who is already booked. Revealing client_id for a client the caller
-- demonstrably already works with discloses nothing new - they are both on
-- that child's team, and `client_sessions`/`session_notes` for that child are
-- already clinic-wide readable to them - while a client they have never seen
-- stays opaque. It is a test over data that already exists, NOT a new
-- caseload/assignment model; nothing is invented here.
--
-- `client_masked` is a real column and not decoration: `sessions.client_id`
-- is nullable, so a NULL there already means "no client assigned to this
-- session". Without the flag the app cannot tell an unassigned session from
-- a masked one, and would render "Client (private)" over genuinely empty
-- slots.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * It does not touch `clients`. The roster stays clinic-wide readable for
--     every reason in point 3 above. The asset being protected here is the
--     ASSOCIATION, not the client list - a clinician knowing who the clinic's
--     clients are is not the disclosure; knowing which of them a named
--     colleague is sitting with is.
--   * It does not change anything for admin, scheduler or supervisor, on any
--     command. `sessions_staff_select`/`_insert`/`_update`/`_delete` (0013)
--     and `sessions_family_read` (0052) are untouched.
--   * It does not touch the write side. 0046's
--     `sessions_clinician_own_insert`/`_update` stand exactly as they are;
--     0045's double-booking index and overlap trigger stand as they are. The
--     0045 trigger is plain plpgsql running under the CALLER's RLS and looks
--     up `where s.employee_id = new.employee_id` - a clinician may only write
--     rows whose employee_id is their own, and those rows are still visible
--     to them under policy A, so the trigger keeps working unchanged.
--   * It does not add a "this client is already booked" constraint. That
--     would be the right way to replace the UI's client-conflict check
--     entirely, but it would start REFUSING writes that are legal today for
--     admin and scheduler, and there is no live database in the environment
--     this was written in to check whether overlapping same-client rows
--     already exist. Raised, not taken.
--   * It does not offer any "is client N busy at time T" lookup, and that is
--     on purpose. Such a function, callable for an arbitrary client_id (and
--     `clients` is clinic-wide readable, so every id is nameable), would be
--     an oracle: probe every client against the occupancy this migration
--     still publishes and the timing correlation rebuilds the whole
--     association. Adding one would undo this migration.
--
-- THE RESIDUAL, NAMED HONESTLY - this does not make the association
-- unknowable, it closes the passive leak
--
--   * Sessions that have actually been RUN leave `client_sessions`
--     (client_id + clinician_id), `session_records` and `session_notes`
--     behind, and migrations 0001/0004 make all of those clinic-wide
--     readable to any `auth_is_staff()` role. A clinician who wants the
--     association for a DELIVERED session can still get it there. Narrowing
--     those is a separate, larger decision about the clinical record and
--     belongs to the account owner, not to this file.
--   * Occupancy itself is correlatable. Anyone who can see that colleague X
--     is busy 10:00-11:00 and independently learns that a given child is
--     busy 10:00-11:00 has linked them. That is inherent in showing
--     occupancy at all, which the product requires; it raises the cost from
--     "open devtools" to "run a correlation", it does not remove it.
--
-- WHAT BREAKS IF SOMEONE REVERTS THIS
--
-- Nothing visibly - and that is the danger worth writing down. Restoring
-- 0014's `sessions_clinical_staff_select` hands clinicians clinic-wide SELECT
-- on `sessions` again; every app query keeps working (they read
-- `sessions_visible()`, which admins already see unmasked), no screen goes
-- blank, no test in supabase/tests fails. The leak simply comes back,
-- silently, with the UI mask still painted over it. If you are reverting
-- this, you are re-opening it on purpose. Dropping
-- `public.sessions_visible()` WITHOUT restoring the old policy is the loud
-- failure: every clinician's scheduler calendar loses every colleague's
-- sessions, and conflict detection starts reporting free slots that are not.
--
-- APPLYING IT: this migration is self-contained, safe to run once, and
-- re-runnable - every object is dropped-if-exists or created-or-replaced
-- first, so a second paste converges on the same state rather than
-- erroring half way through and leaving the boundary half built.
-- Verified by applying the whole chain 0000..0077 to an empty PostgreSQL
-- 16 and then applying this file a second time.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. VERIFY THE STARTING STATE FIRST - do not skip this
--
-- This repo's migration history does not contain the pre-0000 policies the
-- live database may still carry. 0013's own comments assert that "Staff can
-- read own sessions" and "Clients can read own sessions" exist on this table
-- and were left untouched, and migration 0075's header shows that at least
-- one of 0013's equivalent assumptions about `staff` was simply wrong (the
-- column it keyed on did not exist). If some OTHER policy on `sessions` still
-- grants clinicians a clinic-wide read, narrowing 0014's policy below is
-- INERT and this migration will have achieved nothing while looking like it
-- worked - the "RLS returns empty sets, not errors" trap in reverse.
--
-- Run this before and after, and compare:
--
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname = 'public' and tablename = 'sessions'
--    order by cmd, policyname;
--
-- Expected AFTER this migration, for cmd = 'SELECT':
--   sessions_staff_select            admin/scheduler, clinic-wide   (0013)
--   sessions_family_read             guardians                      (0052)
--   sessions_supervisory_select      admin/supervisor, clinic-wide  (here)
--   sessions_clinician_own_select    clinician, own rows only       (here)
--
-- Anything else that mentions neither a `user_id = auth.uid()` join nor a
-- role check is a pre-history policy this repo never recorded, and needs
-- reading before you trust the result.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 1. auth_staff_id() - the caller's own scheduler resource, once
--
-- 0046 spells this join out inline inside each of its two write policies. A
-- read policy is evaluated against every candidate row, so the same inline
-- `exists (select ... from employment_records ...)` would be a correlated
-- subquery per row on the hottest read in the product. As a `stable` function
-- of no arguments it is evaluated once per statement instead, and the policy
-- below reads as what it is: "the session assigned to me".
--
-- Same hardening as every other auth_* helper (0009): `security definer`,
-- every reference schema-qualified so search_path is not load-bearing, and
-- `pg_temp` named LAST. 0009's exploit was temp-table shadowing of
-- `public.profiles`; `employment_records` is shadowable in exactly the same
-- way, and a forged row here would hand the forger another staff member's
-- sessions.
--
-- Returns NULL for anyone with no current staff-linked employment - an admin
-- who is not a booked resource, or the real and expected case 0046's header
-- describes at length: a clinician whose `employment_records.staff_id` an
-- admin has not linked yet. NULL never equals `sessions.employee_id`, so
-- such a clinician reads zero sessions directly and gets a fully masked
-- (but complete) occupancy view from sessions_visible(). That is the same
-- "view but not book" symptom 0046 documents, now also "view but not
-- identify" - check `select staff_id from employment_records where
-- user_id = '<their auth id>' and end_date is null` before assuming the
-- policy is wrong.
-- ----------------------------------------------------------------------------

create or replace function public.auth_staff_id() returns bigint
language sql stable security definer set search_path = public, pg_temp as
$$
  select er.staff_id
    from public.employment_records er
   where er.user_id = auth.uid()
     and er.end_date is null
     and er.staff_id is not null
   order by er.start_date desc
   limit 1
$$;

comment on function public.auth_staff_id() is
  'The caller''s own `staff` row id, via the current employment_records link '
  '(the only tracked join from an auth login to a scheduler resource - see '
  'migration 0026). NULL when no current staff-linked employment exists, '
  'which is a real state, not an error. Mirrors the inline join migration '
  '0046 uses in its two write policies, hoisted into one stable call so a '
  'SELECT policy does not run it per row.';


-- ----------------------------------------------------------------------------
-- 2. The row grant on `sessions`, narrowed
--
-- Replaces 0014's single `clinic_id = auth_clinic_id() and auth_is_staff()`
-- with the two halves that policy was conflating. `auth_is_staff()` is
-- admin/supervisor/clinician (0009) - supervisor is named explicitly below
-- so that a later change to `auth_is_staff()` cannot quietly widen or blind
-- this table, and admin is named for belt and braces even though
-- `sessions_staff_select` (0013) already covers it.
--
-- Multiple permissive SELECT policies OR together, so the effective read for
-- admin and scheduler is bit-for-bit what it was before this file ran.
--
-- STYLE NOTE: this table family (0013/0014/0039/0046) does not schema-qualify
-- the auth_* helpers inside policy bodies. Qualified here deliberately, in
-- the newer 0052/0057 style, because these two policies are the entire
-- boundary this migration creates and none of it should depend on the
-- search_path PostgREST happens to set.
-- ----------------------------------------------------------------------------

drop policy if exists sessions_clinical_staff_select on sessions;
-- Dropped before creating so this file is re-runnable end to end.
drop policy if exists sessions_supervisory_select on sessions;
drop policy if exists sessions_clinician_own_select on sessions;

create policy sessions_supervisory_select on sessions for select
  using (
    clinic_id = public.auth_clinic_id()
    and public.auth_role() in ('admin', 'supervisor')
  );

comment on policy sessions_supervisory_select on sessions is
  'Clinic-wide read for admin and supervisor - the half of migration 0014''s '
  'sessions_clinical_staff_select that is unchanged. Supervisory read across '
  'the clinic is this schema''s posture everywhere else and is not what '
  'migration 0077 narrows.';

create policy sessions_clinician_own_select on sessions for select
  using (
    clinic_id = public.auth_clinic_id()
    and public.auth_role() = 'clinician'
    and employee_id is not null
    and employee_id = public.auth_staff_id()
  );

comment on policy sessions_clinician_own_select on sessions is
  'A clinician reads their OWN sessions from this table - the same '
  'employment_records link migration 0046 uses to decide which sessions they '
  'may write, so read and write now agree. Colleague occupancy is NOT '
  'removed from the product: it comes from public.sessions_visible(), which '
  'returns every session in the clinic with client_id and home_address NULLed '
  'on rows this clinician may not associate. Widening this policy back to '
  'clinic-wide re-opens the client<->colleague leak that migration 0077 '
  'closed, and nothing will visibly break to tell you.';


-- ----------------------------------------------------------------------------
-- 3. Index supporting the new policy and the function's shared-client test
--
-- Both `sessions_clinician_own_select` and sessions_visible()'s "clients I
-- also work with" CTE filter on (clinic_id, employee_id). 0018's
-- sessions_clinic_date_idx leads with session_date; 0045's partial unique
-- index leads with employee_id but is confined to non-cancelled rows.
-- ----------------------------------------------------------------------------

create index if not exists sessions_clinic_employee_idx
  on sessions (clinic_id, employee_id);


-- ----------------------------------------------------------------------------
-- 4. The masked occupancy read
--
-- A named composite type rather than `returns table (...)`: in a SQL-language
-- function the RETURNS TABLE column names become OUT parameters that are
-- visible inside the body, and half of this row's names (`id`, `type`,
-- `status`, `hour`, `minute`, `client_id`) collide with the very columns the
-- body selects. A composite return type has no such names and cannot be
-- ambiguous.
--
-- The column list is EXPLICIT, mirroring `sessions` as of migration 0018,
-- and deliberately not `setof public.sessions`. A column added to `sessions`
-- later is then invisible here until someone adds it on purpose - a privacy
-- boundary should fail closed on a column nobody has thought about yet, not
-- start publishing it.
--
-- `security definer` is doing real work: it is what lets a clinician see a
-- colleague's ROW at all now that policy 2 above denies it. So this function
-- carries its own tenant boundary and its own role gate, and both are
-- load-bearing:
--
--   * `s.clinic_id = v.v_clinic` - without it this is a cross-tenant read of
--     every clinic in the database. This is the single most important line
--     in the file.
--   * the role gate - `sessions_visible()` is reachable over PostgREST by
--     ANY authenticated session, including a family account (role 'client')
--     whose own access to `sessions` is one child's rows via
--     sessions_family_read (0052). Without the gate it would hand a parent
--     the clinic's whole appointment book. Families, hr_admin and
--     payroll_admin get zero rows.
--
-- Name resolution inside a view or function body is stored by OID at
-- creation time and `search_path` is pinned with `pg_temp` LAST regardless,
-- so 0009's temp-shadowing attack has no purchase here.
-- ----------------------------------------------------------------------------

drop function if exists public.sessions_visible(date, date);
drop type if exists public.visible_session cascade;

create type public.visible_session as (
  id            bigint,
  client_id     bigint,
  employee_id   bigint,
  calendar_id   bigint,
  session_date  date,
  hour          integer,
  minute        integer,
  type          text,
  status        text,
  recurrence_id uuid,
  created_at    timestamptz,
  clinic_id     uuid,
  location_id   bigint,
  is_home_visit boolean,
  home_address  text,
  client_masked boolean
);

comment on type public.visible_session is
  'The row shape public.sessions_visible() returns: `sessions` as of '
  'migration 0018, plus client_masked. Columns are listed explicitly rather '
  'than inherited from the table so that a column added to `sessions` later '
  'is not published by this privacy boundary until someone decides it should '
  'be.';

create or replace function public.sessions_visible(
  p_from date default null,
  p_to   date default null
)
returns setof public.visible_session
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select
      public.auth_clinic_id() as v_clinic,
      public.auth_role()      as v_role,
      public.auth_staff_id()  as v_staff
  ),
  -- "Clients I already work with." Derived entirely from sessions this
  -- caller is assigned to; it invents no assignment model and grants nothing
  -- - see this file's header on why revealing these is not a disclosure.
  my_clients as (
    select distinct s.client_id as cid
      from public.sessions s
      cross join viewer v
     where v.v_role = 'clinician'
       and v.v_staff is not null
       and s.clinic_id = v.v_clinic
       and s.employee_id = v.v_staff
       and s.status <> 'cancelled'
       and s.client_id is not null
  )
  select
    s.id,
    case when m.may then s.client_id end,
    s.employee_id,
    s.calendar_id,
    s.session_date,
    s.hour,
    s.minute,
    s.type,
    s.status,
    s.recurrence_id,
    s.created_at,
    s.clinic_id,
    s.location_id,
    s.is_home_visit,
    case when m.may then s.home_address end,
    (s.client_id is not null and not m.may)
  from public.sessions s
  cross join viewer v
  cross join lateral (
    -- coalesce, not a bare boolean: `s.client_id` is nullable, and a NULL
    -- here would fall through the CASE to the unmasked branch on a
    -- three-valued-logic technicality. Fail closed.
    select coalesce(
      v.v_role in ('admin', 'scheduler', 'supervisor')
      or (v.v_role = 'clinician' and v.v_staff is not null and s.employee_id = v.v_staff)
      or (v.v_role = 'clinician' and s.client_id is not null
          and exists (select 1 from my_clients mc where mc.cid = s.client_id)),
      false
    ) as may
  ) m
  where v.v_clinic is not null
    and v.v_role in ('admin', 'scheduler', 'supervisor', 'clinician')
    and s.clinic_id = v.v_clinic
    and (p_from is null or s.session_date >= p_from)
    and (p_to   is null or s.session_date <= p_to)
$$;

comment on function public.sessions_visible(date, date) is
  'Every session in the CALLER''S OWN clinic, with client_id and home_address '
  'NULLed (and client_masked = true) on any row the caller may not associate '
  'with a client. admin/scheduler/supervisor see everything, unchanged; a '
  'clinician sees full detail for their own sessions and for sessions of '
  'clients they themselves also have sessions with, and time/type/location/ '
  'employee occupancy only for everyone else. Anyone who is not clinical or '
  'scheduling staff - a family account included - gets zero rows. This is the '
  'ONLY path by which a clinician can see a colleague''s session at all as of '
  'migration 0077; apps read this, and write to `sessions` directly. '
  'A FUNCTION rather than a view on purpose: migration 0052 and '
  'supabase/tests/rls.mjs force security_invoker on every view in public, '
  'which would disarm this one.';

-- Explicit, because this function hands out rows RLS would otherwise refuse.
-- `anon` must never hold it: an unauthenticated caller has no clinic and
-- would get zero rows today, but that is the role gate doing the work, not
-- the grant, and one edit to the gate should not become a public leak.
revoke all on function public.sessions_visible(date, date) from public;
grant execute on function public.sessions_visible(date, date) to authenticated;
grant execute on function public.sessions_visible(date, date) to service_role;

-- PostgREST caches the schema; a new function is not callable over the API
-- until it reloads. Supabase's own DDL event trigger normally does this, but
-- this migration is pasted into the SQL editor by hand, so ask explicitly
-- rather than leaving a correct migration looking like a 404.
notify pgrst, 'reload schema';


-- ============================================================================
-- APPLY MANUALLY. The Supabase MCP configured for this repo (.mcp.json) is
-- --read-only by design (CLAUDE.md, "Supabase access for Claude sessions"),
-- so this has NOT been run against the live project and no Claude session can
-- run it.
--
-- WHAT WAS ACTUALLY VERIFIED, AND WHERE. The whole chain 0000..0077 was
-- applied to an empty PostgreSQL 16 with the same auth.users/auth.uid()/
-- anon/authenticated/service_role stubs supabase/tests/apply.mjs uses, then
-- exercised as real roles with `set role authenticated` and a settable
-- request.jwt.claim.sub. Confirmed there, not read and hoped over:
--
--   * admin, scheduler and supervisor read the same rows from `sessions`
--     before and after, and get zero masked rows from sessions_visible();
--   * a clinician reads ONLY their own rows from `sessions`, and the full
--     clinic from sessions_visible() with a colleague's private client
--     masked and a SHARED client's id still present;
--   * home_address is NULL on a colleague's home visit and present on the
--     caller's own;
--   * a family account and a second clinic's admin both get zero rows from
--     sessions_visible();
--   * `anon` is refused EXECUTE outright;
--   * 0046's write policies are untouched - a clinician still updates and
--     inserts their own sessions, still cannot touch a colleague's, and
--     0045's overlap trigger still raises correctly while running under the
--     narrowed read policy;
--   * no view in `public` lost security_invoker, so rls.mjs's assertion holds;
--   * the file applies twice in a row with no error.
--
-- What that scratch database CANNOT tell you: whether the live project
-- carries pre-history policies this repo never recorded (section 0),
-- whether PostgREST exposes the function as expected, and how the function
-- performs against real data volumes - it is `security definer`, so Postgres
-- will NOT inline it, and PostgREST's filters are applied outside the call.
-- Pass p_from/p_to from the calendar rather than relying on the outer filter.
-- Before trusting it live:
--
--   1. Run section 0's pg_policies query BEFORE and AFTER, and read the
--      before-state for any pre-history policy this repo never recorded.
--   2. As a clinician account, confirm the narrowing actually took:
--        select count(*) from sessions;                    -- own rows only
--        select count(*) from sessions_visible();          -- clinic-wide
--        select count(*) from sessions_visible()
--         where client_masked;                             -- > 0
--        select count(*) from sessions_visible()
--         where client_id is not null and employee_id <> public.auth_staff_id();
--                                                          -- shared clients only
--   3. As an admin and as a scheduler, confirm `select count(*) from
--      sessions` is unchanged from before, and that sessions_visible()
--      returns zero rows with client_masked = true.
--   4. As a family account (role 'client'), confirm
--      `select count(*) from sessions_visible()` returns 0 and that their own
--      appointments page still works (it reads `sessions` under
--      sessions_family_read, untouched).
--   5. Confirm `node supabase/tests/rls.mjs`'s security_invoker assertion
--      still passes - this migration creates no view, so it should.
--
-- The application changes that must land with this are listed in the PR that
-- carries it. Until they do, a CLINICIAN's scheduler calendar will show only
-- their own sessions (colleague occupancy disappears) - the database is
-- correct at that point and the app is not yet reading the new path. Land
-- them together.
-- ============================================================================
