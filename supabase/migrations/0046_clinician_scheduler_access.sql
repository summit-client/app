-- ============================================================================
-- 0046 · Clinician access to apps/scheduler: full read parity, own-session
-- write only.
--
-- Product ask, confirmed with the product owner: a clinician should be able
-- to use apps/scheduler exactly like a scheduler does for VIEWING - every
-- staff member's sessions clinic-wide, every client's sessions, the full
-- staff roster, locations, session types, calendars and availability - but
-- may only CREATE, RESCHEDULE or CANCEL a session where they themselves are
-- the assigned staff member (sessions.employee_id). They must not be able to
-- touch another staff member's sessions, and nothing about client records,
-- staff records, locations, session types or calendars becomes writable for
-- them - that surface (apps/scheduler/pages/admin.tsx) stays admin/scheduler
-- only, untouched by this migration.
--
-- READ SIDE - what's already true, and what's missing
--
-- `select policyname, cmd from pg_policies where tablename in (...)` against
-- the eight scheduler tables (0013) shows:
--
--   sessions        - already clinic-wide readable by admin/supervisor/
--                      clinician (sessions_clinical_staff_select, 0014, via
--                      auth_is_staff()). Nothing to add.
--   clients         - same shape, same migration (clients_clinical_staff_select).
--                      Nothing to add.
--   staff           - already clinic-wide readable by admin/supervisor/
--                      clinician (staff_clinical_staff_select, 0039, added
--                      specifically anticipating this follow-up - see that
--                      file's "PORTAL ACCESS NOTE, NOT DECIDED HERE"). Nothing
--                      to add.
--   session_types   - select restricted to role in ('scheduler','client')
--                      only (0013). Zero clinician read today. Needs the
--                      additive policy below.
--   locations       - same shape as session_types (0013). Same gap, same fix.
--   calendars       - select restricted to admin/scheduler (0013). Same gap,
--                      same fix.
--   client_availability - select restricted to admin/scheduler, plus each
--                      client's own row via a separate, untouched mechanism
--                      (0013). Same gap, same fix.
--   staff_availability  - same shape as client_availability (0013). Same gap,
--                      same fix.
--
-- The five additive policies below all follow 0014/0039's exact shape -
-- `clinic_id = auth_clinic_id() and auth_is_staff()`, select only, named
-- `<table>_clinical_staff_select` - and are additive: Postgres ORs multiple
-- permissive policies together on the same table, so none of the existing
-- admin/scheduler/client policies on any of these five tables are touched or
-- narrowed. auth_is_staff() (0009) is admin/supervisor/clinician, so this
-- also - correctly, per 0039's own note - gives supervisor the same read the
-- moment @summit/portals admits supervisor to this portal, without
-- supervisor being able to reach apps/scheduler at all until that separate,
-- not-made-here product decision happens.
--
-- WRITE SIDE - own-session only, via employment_records
--
-- `auth_is_scheduling_staff()` (0013) gates INSERT/UPDATE/DELETE on
-- `sessions` (and full CRUD on clients/staff/calendars/locations/
-- session_types/client_availability) and is deliberately NOT touched here -
-- widening it would hand clinicians client-record edits, staff HR edits and
-- config changes, none of which this task asks for. Instead this adds two
-- new, clinician-only, ADDITIVE policies scoped to a single session at a
-- time: the one whose employee_id resolves to the caller's own staff row.
--
-- "The caller's own staff row" is NOT staff.user_id - that column does not
-- exist (confirmed against 0000's reconstruction of `staff`; this is the
-- staff_id/user_id gap 0026's header describes and apps/data's
-- BLOCKED-data.md documents the caseload-equivalent of). The mechanism the
-- live application already relies on is `employment_records`
-- (user_id -> auth.users, staff_id -> staff, filtered to end_date is null
-- for "currently employed"), exactly as apps/data/lib/data.ts's
-- myEmployeeId() already queries it for the equivalent clinician-facing
-- lookup in that portal. The two new policies below mirror that same join
-- directly in SQL rather than inventing a second mechanism.
--
-- INSERT: with check only, since there is no OLD row - a clinician may
-- create a session whose employee_id already names their own linked staff
-- row (the app-side Create wizard is being changed in this same PR to
-- default-and-lock the assignee to the signed-in clinician, so this is the
-- server-side backstop for that, not the only enforcement).
--
-- UPDATE: both using and with check carry the same employment_records
-- check, deliberately. `using` alone would let a clinician's update SEE only
-- their own rows to modify (correct) but `with check` is what stops the
-- write from REASSIGNING a session away to another employee_id in the same
-- statement - without it, a clinician could point their own session at a
-- colleague's employee_id and the row would then vanish from their own view
-- (having become, in effect, unowned-by-them) rather than being rejected.
-- Repeating the same check in `with check` closes that: the row must belong
-- to the caller both before AND after the write.
--
-- No new DELETE policy. The app never hard-deletes a session in any write
-- path that matters (cancellation is `status = 'cancelled'`, a plain
-- update) - matching CLAUDE.md's "deletes are denied by default" default
-- posture, and the existing admin/scheduler-only sessions_staff_delete
-- (0013) is untouched.
--
-- REAL, EXPECTED CONSEQUENCE - not a bug, and not fixed here
--
-- A clinician whose employment_records row has no staff_id set yet (an
-- admin links this manually, via the employee portal's Settings ->
-- Workforce screen - 0026's own header calls this "the one thing nothing in
-- the database can currently do" automatically, on purpose: names collide
-- and a wrong match silently misdirects pay/hours) will correctly have ZERO
-- booking capability in apps/scheduler until that link exists - the exists()
-- below simply never matches. Same shape of gap as apps/data's caseload
-- feature (see BLOCKED-data.md), same fix (an admin makes the link), not
-- something this migration can or should paper over. If this surfaces as
-- "my clinician account can view but not book," check
-- `select staff_id from employment_records where user_id = '<their auth id>'
--  and end_date is null` before assuming the RLS policy itself is wrong.
--
-- STYLE NOTE: this table family (0013/0014/0039) does not schema-qualify
-- auth_clinic_id()/auth_is_staff()/auth_role() calls inside policy bodies,
-- unlike some newer migrations elsewhere in this schema. Matched here rather
-- than a repo-wide default, per that precedent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Read parity: the five tables clinician currently cannot read at all.
-- ----------------------------------------------------------------------------

create policy session_types_clinical_staff_select on session_types for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy locations_clinical_staff_select on locations for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy calendars_clinical_staff_select on calendars for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy client_availability_clinical_staff_select on client_availability for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

create policy staff_availability_clinical_staff_select on staff_availability for select
  using (clinic_id = auth_clinic_id() and auth_is_staff());

-- ----------------------------------------------------------------------------
-- Write parity: a clinician may create/reschedule only their own sessions.
-- ----------------------------------------------------------------------------

create policy sessions_clinician_own_insert on sessions for insert
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'clinician'
    and exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = sessions.employee_id
         and er.end_date is null
    )
  );

create policy sessions_clinician_own_update on sessions for update
  using (
    clinic_id = auth_clinic_id()
    and auth_role() = 'clinician'
    and exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = sessions.employee_id
         and er.end_date is null
    )
  )
  with check (
    clinic_id = auth_clinic_id()
    and auth_role() = 'clinician'
    and exists (
      select 1 from employment_records er
       where er.user_id = auth.uid()
         and er.staff_id = sessions.employee_id
         and er.end_date is null
    )
  );

-- ============================================================================
-- APPLY MANUALLY. The Supabase MCP configured for this repo (.mcp.json) is
-- --read-only by design (see CLAUDE.md's "Supabase access for Claude
-- sessions") - no Claude session, including the one that wrote this file,
-- has run this against the live database. Verified instead by applying the
-- full migration chain (0000 through this file) against an isolated scratch
-- Postgres and exercising it with real insert/update attempts as admin,
-- scheduler, and clinician accounts (own session, a colleague's session, and
-- an unlinked clinician) - see supabase/tests/ for that harness and its
-- output. A human with database access needs to run this migration
-- (`supabase db push`, or paste it into the SQL editor) before any of this
-- takes effect live.
-- ============================================================================
