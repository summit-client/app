-- ============================================================================
-- dummy-calendar-sessions-2026.sql
--
-- DEMO / MOCK DATA. Not a schema migration, deliberately not numbered into
-- supabase/migrations/ (same reasoning as aria-bennett-demo-data.sql in this
-- directory): it seeds fictional bookings for exactly one clinic, and a
-- `db reset` must not replay it.
--
-- READ THIS WHOLE HEADER BEFORE PASTING IT INTO A PRODUCTION DATABASE.
--
-- ----------------------------------------------------------------------------
-- WHAT IT DOES
-- ----------------------------------------------------------------------------
-- Fills the scheduler calendar from today through 2026-12-31 with plausible
-- bookings: every active client gets sessions, every session-delivering staff
-- member gets sessions, every client-facing session type appears, spread
-- across the org's working days and across morning and afternoon.
--
-- It builds ONE conflict-free week first (a template) and then projects that
-- week across the date range, which is how the app's own recurring booking
-- works. Each template row becomes one weekly series with its own
-- recurrence_id, so dragging a session with "this and all future occurrences"
-- moves that one series and not the whole seed.
--
-- The schedule is pseudo-random in appearance but fully DETERMINISTIC: the
-- same database produces the same schedule on every run. There is no random()
-- anywhere, so a re-run is a true replace, not a reshuffle.
--
-- ----------------------------------------------------------------------------
-- WHAT IT WRITES (all three are real writes to real tables)
-- ----------------------------------------------------------------------------
--  1. sessions          INSERT only, every row status = 'scheduled', every row
--                       tagged with a recurrence_id under the marker prefix
--                       below. Prior rows carrying that marker are deleted
--                       first, so re-running replaces rather than duplicates.
--
--  2. staff_availability / client_availability
--                       INSERT of a full working week for anyone who has NO
--                       availability rows at all, and UPDATE of rows whose
--                       start_time or end_time is NULL, setting them to the
--                       effective work window.
--
--                       The INSERT half is deliberately limited to people
--                       with ZERO rows. A partial week is a real preference
--                       and filling in the rest of it would silently widen
--                       someone's availability into something they never
--                       agreed to; zero rows expresses nothing, so there is
--                       nothing to overwrite. Confirmed live 2026-09-18 that
--                       this matters: one clinic had 14 staff and not a
--                       single staff_availability row, so the UPDATE-only
--                       version fixed nothing and the run died on an empty
--                       weekly template.
--
--                       This is
--                       NOT cosmetic: every staff member and client created
--                       through the scheduler's admin form or through
--                       invite-teammate gets six Mon-Sat availability rows
--                       with NULL times, which the app reads as "available
--                       for nothing". Without this, those people can never be
--                       booked and "every clinician and every client gets
--                       sessions" is impossible.
--                       It is reversible: every row this touches is recorded
--                       in mock_data_availability_backfill (created by this
--                       script) so the cleanup below can put the NULLs back.
--                       It changes who the app's own matcher considers
--                       bookable from now on. If that is not acceptable, set
--                       v_backfill_availability := false below and accept
--                       that only people with real availability get sessions.
--
--  3. calendars         INSERT of ONE row, and only if no ACTIVE calendar
--                       already covers the whole date range. Creating one is
--                       not free: apps/scheduler/pages/index.jsx picks the
--                       first active calendar out of an unordered select, so
--                       a new active calendar can silently become the term
--                       that future real quick-bookings land in. The script
--                       says loudly in its run log when it had to create one.
--
--  4. mock_data_availability_backfill
--                       Created if absent. Bookkeeping for #2 only. Carries
--                       clinic_id and has RLS enabled with no policies at all
--                       (deny-all to everyone but the service role), which is
--                       the correct posture for a table nothing in the apps
--                       reads.
--
--  5. locations / staff.location_id / clients.location_id
--                       Spreads people across sites so the seeded calendar
--                       reads like a multi-site clinic: the location filter,
--                       the location column and visibleLocation() all have
--                       something real to show. Round-robin, deterministic,
--                       and it only ever fills a location_id that is already
--                       NULL - a real assignment made in the app is never
--                       overwritten.
--
--                       THIS IS COSMETIC, NOT A PREREQUISITE. The pairing
--                       rule is `is not distinct from`, which treats NULL as
--                       equal to NULL, so a clinic with every location_id
--                       unset seeds perfectly well with everyone eligible
--                       for everyone. Set v_assign_locations := false to
--                       skip it entirely.
--
--                       If the clinic has NO locations at all - which is the
--                       normal state, since nothing in the monorepo wrote
--                       that table until the Locations screen shipped - it
--                       INSERTs the few named in v_demo_locations first.
--                       Those are real rows in a real table that the admin
--                       UI will show; the run log says when it created them.
--
--  7. staff / clients  (NEW PEOPLE - read this one carefully)
--                       Tops the clinic UP TO v_target_staff session-
--                       delivering staff and v_target_clients ACTIVE clients,
--                       with generated fictional names. Nobody is ever
--                       removed and a roster already above the target is left
--                       alone. It also fills staff.role - the CLINICAL
--                       CREDENTIAL, not profiles.role - for existing staff
--                       who have none, spread across RBT / BCaBA / BCBA /
--                       Supervisor so the roster does not read as one job
--                       title. That is the only edit it makes to a person who
--                       was already here, and it only ever fills a blank.
--
--                       These are rows in your real `clients` and `staff`
--                       tables. They show up in the roster, the client picker,
--                       the waitlist screens and anywhere else those tables
--                       are read - not only on the calendar. Every id is
--                       recorded in mock_data_seed_people so the cleanup
--                       removes exactly these and nothing else.
--
--  8. mock_data_seed_people
--                       Created if absent. Bookkeeping for #7, including the
--                       previous staff.role of anyone whose credential was
--                       filled in. Same deny-all RLS posture as #4 and #6.
--
--  6. mock_data_location_backfill
--                       Created if absent. Bookkeeping for #5: the previous
--                       location_id of every row changed, and the id of every
--                       location created. Same deny-all RLS posture as #4.
--
-- ----------------------------------------------------------------------------
-- WHAT IT NEVER WRITES, AND WHY THAT MATTERS
-- ----------------------------------------------------------------------------
-- Every generated row is status = 'scheduled'. Never 'completed'.
--
-- Nothing in the application ever sets sessions.status = 'completed' (see
-- apps/scheduler/pages/index.jsx's own comment on the engagement leaderboard),
-- so a 'completed' row is not something an operator could have created by
-- hand. More importantly, migration 0031's derive_pending_session_deliveries()
-- selects exactly `status = 'completed'` and turns each one into a real
-- time_entries row (payroll hours) and a real budget_entries charge against a
-- client's funded budget. Seeding completed sessions would arm that function
-- to mint fictional payroll and fictional spend on real families' budgets.
-- Both of those FKs are ON DELETE SET NULL, so the cleanup below would orphan
-- them rather than remove them.
--
-- DO NOT run derive_pending_session_deliveries() while this demo data is in
-- the database.
--
-- It also never writes staff.booked. Nothing in the schema increments it,
-- invite-teammate's own comment doubts it is a real column, and this script
-- has no business being the first thing to write it.
--
-- ----------------------------------------------------------------------------
-- WHO ELSE SEES THESE ROWS
-- ----------------------------------------------------------------------------
-- These are not scheduler-only rows:
--   * apps/client (the FAMILY portal) lists them under Upcoming Sessions, and
--     a guardian can file a session change request against one.
--   * apps/data (the CLINICIAN portal) reads them.
--   * Four ICS feed endpoints serve every non-cancelled future session to any
--     calendar-feed token that has already been issued. Those events land in
--     real Google/Apple calendars and are cached there. The cleanup below
--     removes the rows from the database; it cannot reach into a subscriber's
--     calendar app. If any feed tokens are live, consider revoking them (see
--     calendar_feed_tokens, migration 0044) before running this.
--
-- ----------------------------------------------------------------------------
-- VOLUME
-- ----------------------------------------------------------------------------
-- v_max_total below caps the run at roughly 900 sessions, deliberately under
-- PostgREST's default 1000-row cap. It is approximate by one weekly series:
-- a series is placed whole, so the last one can carry the total a dozen or so
-- rows past the cap. apps/scheduler/pages/index.jsx's
-- loadData()/refreshBookings() still run an unbounded `select("*")` on
-- sessions with no date filter and no range, so once the sessions table passes
-- that cap the bookings list, the past-bookings list, the engagement
-- leaderboard and the wizard's in-memory conflict pre-check all silently
-- truncate - and it reads as the app being broken, not as the seed being too
-- big. Raise v_max_total only after that query is bounded (pending task:
-- "Fix blank sessions list + blank clients list"). The calendar tab itself is
-- date-range scoped and is fine either way.
--
-- ----------------------------------------------------------------------------
-- ASSUMPTIONS YOU SHOULD VERIFY BEFORE RUNNING
-- ----------------------------------------------------------------------------
--  1. v_clinic below is Mount Etna. Confirm with `select id, name from
--     clinics;` - a second clinic has been seeded since migration 0013 wrote
--     that id everywhere, so it is pinned here rather than derived.
--  2. Migration 0045 (the double-booking index and overlap trigger) is
--     applied. Its own header says it was not applied by the session that
--     wrote it. The script is correct either way, but if 0045 is missing then
--     nothing but this script is protecting the schedule from double-books.
--  3. session_types.duration is the real duration column. If a
--     duration_minutes column also exists and disagrees with duration on any
--     row, the script REFUSES to run: 0045's trigger reads duration while the
--     calendar UI prefers duration_minutes, so rows the database accepts would
--     visually overlap. Reconcile the two columns first.
--  4. Availability rows use a recognisable weekday spelling. The script
--     normalises with left(initcap(day),3), which handles 'Mon', 'mon',
--     'Monday' and 'monday' alike, and it prints the distinct raw values it
--     found in its run log. If that list contains something else, stop.
--  5. staff.capacity is treated as a PER-WEEK ceiling (capped at
--     v_staff_week_max), not a lifetime total. Staff with capacity 0 or NULL
--     - which is what invite-teammate writes - are given the default weekly
--     ceiling instead and listed in the run log, because the app's own
--     booking wizard filters on `booked < capacity` and would exclude them
--     entirely today. If a clinician appears in this seed but you cannot book
--     them by hand in the wizard, that capacity is why.
--  6. Run it as the postgres/service role (the Supabase SQL editor does).
--     RLS is bypassed there; the two BEFORE-INSERT triggers on sessions still
--     fire on every row, which is the point.
--
-- ----------------------------------------------------------------------------
-- COVERAGE GAPS, STATED HONESTLY
-- ----------------------------------------------------------------------------
--  * Session types with is_client_optional = true (Break, Lunch, Meeting -
--    seeded per clinic by migration 0019) are excluded, so the seeded weeks
--    contain client sessions only and no breaks.
--    This was originally a hard blocker rather than a choice: 0016's
--    clinic-consistency trigger had no NULL guard on client_id, so the
--    client-less clinician block those types were designed for could not be
--    inserted at all. Migration 0078 added that guard, and the scheduler's
--    click-to-create now has a "Staff block" mode that books them - so they
--    ARE creatable by hand from the app. They stay out of this script
--    because a generated lunch break competes with real ones for the same
--    slot and 0045's unique index would then reject the real booking; if you
--    want them seeded too, that is a deliberate future change to the
--    template builder, not an oversight.
--  * Group session types (max_clients > 1) are booked, but only ever as a
--    single client per slot. 0045's partial unique index is on (employee_id,
--    session_date, hour, minute), so a group of N clients sharing one
--    clinician and one slot cannot be represented as N rows. That is a schema
--    limitation, not a choice made here.
--  * Home visits are not generated. Every row gets the assigned clinician's
--    location_id, is_home_visit = false, home_address = null - the exact
--    shape insertQuickSlot writes.
--
-- ----------------------------------------------------------------------------
-- HOW TO RE-RUN
-- ----------------------------------------------------------------------------
-- Just run it again. It deletes its own prior output first (including any
-- family-filed change requests against those rows, whose FK is NO ACTION and
-- would otherwise abort the delete), then regenerates. It refuses to run if a
-- previously generated session has since been referenced by a time entry, a
-- budget charge or a clinical session record, rather than silently orphaning
-- financial or clinical data.
--
-- ----------------------------------------------------------------------------
-- HOW TO REMOVE EVERYTHING THIS CREATED
-- ----------------------------------------------------------------------------
-- Run these five statements, in this order:
--
--   begin;
--
--   delete from session_change_requests scr using sessions s
--    where scr.session_id = s.id
--      and s.clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'
--      and s.recurrence_id::text like 'dddddddd-dddd-4ddd-8ddd-%';
--
--   delete from sessions
--    where clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'
--      and recurrence_id::text like 'dddddddd-dddd-4ddd-8ddd-%';
--
--   update staff_availability a set start_time = null, end_time = null
--     from mock_data_availability_backfill b
--    where b.kind = 'staff' and b.row_id = a.id
--      and b.clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9';
--
--   update client_availability a set start_time = null, end_time = null
--     from mock_data_availability_backfill b
--    where b.kind = 'client' and b.row_id = a.id
--      and b.clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9';
--
--   -- Undo the location assignment (#5). Order matters: clear the references
--   -- before deleting the locations they point at.
--   update staff s set location_id = b.previous_location_id
--     from mock_data_location_backfill b
--    where b.kind = 'staff' and b.row_id = s.id;
--   update clients c set location_id = b.previous_location_id
--     from mock_data_location_backfill b
--    where b.kind = 'client' and b.row_id = c.id;
--   delete from locations l
--    using mock_data_location_backfill b
--    where b.kind = 'location' and b.row_id = l.id;
--   delete from mock_data_location_backfill;
--
--   -- People this script created, and credentials it filled in. Do this
--   -- AFTER the sessions delete above: sessions.employee_id and .client_id
--   -- carry neither ON DELETE CASCADE nor SET NULL, so a surviving session
--   -- row blocks the delete outright.
--   update staff s set role = b.previous_role
--     from mock_data_seed_people b
--    where b.kind = 'staff_role_set' and b.row_id = s.id;
--   delete from clients c using mock_data_seed_people b
--    where b.kind = 'client_created' and b.row_id = c.id;
--   delete from staff s using mock_data_seed_people b
--    where b.kind = 'staff_created' and b.row_id = s.id;
--   delete from mock_data_seed_people;
--
--   -- Rows this script CREATED are deleted, not nulled.
--   delete from staff_availability a
--    using mock_data_availability_backfill b
--    where b.kind = 'staff_inserted' and b.row_id = a.id;
--   delete from client_availability a
--    using mock_data_availability_backfill b
--    where b.kind = 'client_inserted' and b.row_id = a.id;
--
--   delete from mock_data_availability_backfill
--    where clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9';
--
--   commit;
--
-- Restoring availability puts back exactly the NULLs this script overwrote -
-- it never touches a window a human set. If someone has since edited one of
-- those rows in the availability grid, that edit is what gets reverted, so
-- check `select count(*) from mock_data_availability_backfill` against how
-- long the demo data has been in place before running the two updates.
--
-- The calendar row, if one had to be created, is left alone deliberately -
-- real bookings may have landed in it by then. Remove it by hand only after
-- checking `select count(*) from sessions where calendar_id = <id>`.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Run log. The Supabase SQL editor does not reliably surface RAISE NOTICE, so
-- every notice is also written here and selected back at the end of the file.
-- ----------------------------------------------------------------------------
create temp table if not exists mock_data_run_log (
  ord bigint generated by default as identity primary key,
  logged_at timestamptz not null default now(),
  note text not null
);
delete from mock_data_run_log;

create or replace function pg_temp.say(p_note text) returns void
language plpgsql as $fn$
begin
  raise notice '%', p_note;
  insert into pg_temp.mock_data_run_log(note) values (p_note);
end $fn$;


begin;

set local statement_timeout = '600s';

do $seed$
declare
  -- ==========================================================================
  -- PARAMETERS
  -- ==========================================================================

  -- TEMPORARY, clinic-specific: Mount Etna Child & Family Services. Migration
  -- 0013 backfilled every legacy scheduler table to this id. It is pinned
  -- rather than derived from `select id from clinics` because that table no
  -- longer holds exactly one row. Change this one line to seed a different
  -- clinic; nothing else in the file names a clinic.
  v_clinic  uuid := 'ee78d13c-eec9-4512-98bc-d00bca2d08c9';

  v_from    date := current_date;
  v_to      date := date '2026-12-31';

  -- The re-run marker. Every generated recurrence_id is this 24-character
  -- prefix plus 12 hex digits, which is a well-formed uuid and is what the
  -- delete and the cleanup statements match on. Nothing else in the schema
  -- writes a recurrence_id shaped like this.
  v_marker  text := 'dddddddd-dddd-4ddd-8ddd-';

  -- See VOLUME in the header before changing this. Raised from 900 to 3000 on
  -- 2026-09-18 at the account owner's explicit direction, for a demo dataset
  -- that will be wiped before go-live. READ THE TRADE-OFF: PostgREST caps a
  -- request at 1000 rows by default and loadData()/refreshBookings() still
  -- issue an unbounded select on sessions, so above ~1000 the Sessions tab,
  -- the past-bookings list and the engagement leaderboard silently truncate -
  -- and it reads as the app being broken rather than the seed being large.
  -- The Calendar tab is date-range scoped and is unaffected.
  v_max_total        int := 3000;
  v_client_week_max  int := 3;   -- most sessions one client gets in a week
  v_staff_week_max   int := 8;   -- most sessions one clinician gets in a week

  v_backfill_availability boolean := true;   -- see WHAT IT WRITES #2
  v_assign_locations      boolean := true;   -- see WHAT IT WRITES #5
  v_skip_holidays         boolean := true;   -- public_holidays, migration 0027

  -- Only used when the clinic has NO locations at all. Nothing in the
  -- monorepo wrote this table until the Locations screen shipped, so an
  -- untouched clinic has zero, and "spread people across sites" needs sites
  -- to spread them across. Set v_assign_locations := false to leave every
  -- location_id exactly as it is.
  v_demo_locations text[] := array['Main Clinic', 'North Site', 'East Site'];

  -- People top-up. The clinic is brought UP TO these counts; nobody is ever
  -- removed, and an existing roster larger than the target is left alone.
  v_target_staff   int := 20;    -- session-delivering staff
  v_target_clients int := 100;   -- clients with status = 'active'

  -- staff.role is the CLINICAL CREDENTIAL (see CLAUDE.md - not profiles.role,
  -- which is the permission). Spread so the roster looks like a real clinic:
  -- mostly RBTs delivering, fewer BCaBAs, fewer BCBAs, a couple of
  -- supervisors. The seed's own "is this person session-delivering" test
  -- accepts any of these four, so assigning them also makes the new people
  -- bookable without relying on capacity alone.
  v_creds text[] := array['RBT','RBT','RBT','RBT','BCaBA','BCaBA','BCBA','Supervisor'];

  v_first text[] := array['Amara','Ben','Chloe','Dev','Elena','Farid','Grace','Hugo',
                          'Imani','Jonas','Kira','Liam','Maya','Noor','Omar','Pia',
                          'Quinn','Rosa','Sami','Tara'];
  v_last  text[] := array['Alvarez','Boateng','Chen','Dufresne','Eriksen','Fontaine',
                          'Gallagher','Haddad','Ibrahim','Jensen','Kowalski','Lindqvist'];

  -- The operator's explicit bound, intersected with the org's own hours.
  v_floor_m int := 9 * 60;
  v_ceil_m  int := 17 * 60;

  v_nloc      int;
  v_loc_name  text;
  v_loc_id    bigint;
  v_orphan    text;
  v_need      int;
  v_rec       record;

  -- ==========================================================================
  -- DERIVED / WORKING STATE
  -- ==========================================================================
  v_ws_txt text; v_we_txt text; v_wd_txt text;
  v_inc int;
  v_anchor_m int; v_start_m int; v_end_m int; v_band_n int;
  v_days text[]; v_day_n int; v_type_n int;
  v_cal bigint;
  v_series int := 0;
  v_projected int := 0;
  v_ins bigint := 0;
  v_proj_rows bigint := 0;
  v_n bigint; v_m bigint;
  v_txt text;
  v_has_dm boolean;
  v_phase int; v_phase_max int;
  rq record;
  v_pick_staff bigint; v_pick_type text; v_pick_dur int;
  v_pick_gb int; v_pick_ga int; v_pick_dow text; v_pick_start int;
  v_pick_loc bigint;
begin
  perform pg_temp.say(format('clinic %s, range %s .. %s', v_clinic, v_from, v_to));

  if not exists (select 1 from clinics c where c.id = v_clinic) then
    raise exception 'clinic % does not exist - check `select id, name from clinics`', v_clinic;
  end if;
  if v_to < v_from then
    raise exception 'end date % is before start date %', v_to, v_from;
  end if;

  -- --------------------------------------------------------------------------
  -- 1 · Org settings. Values are jsonb scalars, read with #>> '{}'. Defaults
  --     mirror @summit/settings' own registry defaults for a clinic that has
  --     never saved these keys.
  -- --------------------------------------------------------------------------
  select coalesce((select o.value #>> '{}' from org_settings o
                    where o.clinic_id = v_clinic and o.key = 'calendar.workStart'), '08:00')
    into v_ws_txt;
  select coalesce((select o.value #>> '{}' from org_settings o
                    where o.clinic_id = v_clinic and o.key = 'calendar.workEnd'), '17:00')
    into v_we_txt;
  select coalesce((select o.value #>> '{}' from org_settings o
                    where o.clinic_id = v_clinic and o.key = 'calendar.workDays'), 'Mon,Tue,Wed,Thu,Fri')
    into v_wd_txt;
  select coalesce((select (o.value #>> '{}')::int from org_settings o
                    where o.clinic_id = v_clinic and o.key = 'calendar.gridIncrementMinutes'), 15)
    into v_inc;

  if v_inc <= 0 then
    raise exception 'calendar.gridIncrementMinutes is % - must be positive', v_inc;
  end if;

  -- None of these four keys is locked, so a role_settings row outranks the org
  -- value in the UI's resolve(). The generator can only honour one window, so
  -- say so rather than quietly disagreeing with what a scheduler sees.
  select count(*) into v_n from role_settings r
   where r.clinic_id = v_clinic
     and r.key in ('calendar.workStart', 'calendar.workEnd', 'calendar.workDays',
                   'calendar.gridIncrementMinutes');
  if v_n > 0 then
    perform pg_temp.say(format(
      'WARNING: %s role_settings row(s) override a calendar key for this clinic. '
      || 'Those roles see a different work window than this seed used.', v_n));
  end if;

  -- The grid is anchored at the ORG working-day start, exactly like the app's
  -- own slot generator, and then clamped to the 9am-5pm bound that was asked
  -- for. Anchoring at 9am instead would put slots on a different grid than the
  -- one the calendar snaps to.
  v_anchor_m := extract(hour from v_ws_txt::time)::int * 60
              + extract(minute from v_ws_txt::time)::int;
  v_start_m  := greatest(v_anchor_m, v_floor_m);
  v_end_m    := least(extract(hour from v_we_txt::time)::int * 60
                    + extract(minute from v_we_txt::time)::int, v_ceil_m);
  -- Hour-wide bands across the effective window, used to spread start times.
  v_band_n   := greatest((v_end_m - v_start_m) / 60, 1);

  if v_end_m <= v_start_m then
    raise exception 'effective work window is empty (% .. % minutes past midnight)', v_start_m, v_end_m;
  end if;

  -- Working days, normalised to the three-letter capitalised form the whole
  -- app compares on, kept in calendar order. Sunday is NOT dropped: the
  -- Settings > Working days picker offers it, so an org may legitimately have
  -- configured it. No availability writer in this codebase ever emits a Sun
  -- row, so a Sunday will simply find nobody available - which is reported
  -- below rather than silently swallowed.
  select array(
    select k.d
      from unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) with ordinality as k(d, ord)
     where exists (select 1
                     from unnest(string_to_array(v_wd_txt, ',')) as w(x)
                    where left(initcap(btrim(w.x)), 3) = k.d)
     order by k.ord
  ) into v_days;

  v_day_n := coalesce(cardinality(v_days), 0);
  if v_day_n = 0 then
    raise exception 'calendar.workDays (%) contains no recognisable weekday', v_wd_txt;
  end if;
  if 'Sun' = any(v_days) then
    perform pg_temp.say('NOTE: calendar.workDays includes Sun. Nothing in this app writes a '
      || 'Sunday availability row, so no Sunday sessions will be generated.');
  end if;

  perform pg_temp.say(format(
    'work window %s:%s..%s:%s (org %s..%s clamped to 09:00..17:00), grid %s min, days %s',
    lpad((v_start_m / 60)::text, 2, '0'), lpad((v_start_m % 60)::text, 2, '0'),
    lpad((v_end_m / 60)::text, 2, '0'), lpad((v_end_m % 60)::text, 2, '0'),
    v_ws_txt, v_we_txt, v_inc, array_to_string(v_days, ',')));

  -- --------------------------------------------------------------------------
  -- 2 · session_types.duration_minutes sanity check.
  --     0045's trigger enforces overlap using `duration`; the calendar UI
  --     prefers `duration_minutes`. If both exist and disagree, rows this
  --     script places legally will still look overlapped on screen.
  -- --------------------------------------------------------------------------
  select exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public'
                    and c.table_name = 'session_types'
                    and c.column_name = 'duration_minutes')
    into v_has_dm;
  if v_has_dm then
    execute 'select count(*) from session_types
              where clinic_id = $1 and duration_minutes is distinct from duration'
      into v_n using v_clinic;
    if v_n > 0 then
      raise exception 'session_types.duration_minutes disagrees with duration on % row(s). '
        'Migration 0045''s trigger reads duration, the calendar reads duration_minutes - '
        'reconcile them before seeding.', v_n;
    end if;
    perform pg_temp.say('session_types.duration_minutes exists and agrees with duration everywhere');
  end if;

  -- Duplicate type names make 0045's `... and st.name = new.type limit 1`
  -- duration lookup nondeterministic. The template below spaces sessions by
  -- the LARGEST duration found for a name, which is safe whichever row the
  -- trigger happens to pick.
  select coalesce(string_agg(q.name, ', '), '') into v_txt
    from (select st.name from session_types st
           where st.clinic_id = v_clinic
           group by st.name having count(*) > 1) q;
  if v_txt <> '' then
    perform pg_temp.say('WARNING: duplicate session_types names for this clinic: ' || v_txt);
  end if;

  -- --------------------------------------------------------------------------
  -- 3 · Report the raw availability day spellings BEFORE touching anything.
  --     Legacy rows were seeded as lowercase full names ('monday') and match
  --     nothing anywhere in the app. The joins below normalise, but the
  --     operator should still see what is actually in there.
  -- --------------------------------------------------------------------------
  select coalesce(string_agg(q.d, ', ' order by q.d), '(no rows)') into v_txt
    from (select distinct a.day from staff_availability a where a.clinic_id = v_clinic) q(d);
  perform pg_temp.say('staff_availability distinct day values: ' || v_txt);

  select coalesce(string_agg(q.d, ', ' order by q.d), '(no rows)') into v_txt
    from (select distinct a.day from client_availability a where a.clinic_id = v_clinic) q(d);
  perform pg_temp.say('client_availability distinct day values: ' || v_txt);

  -- --------------------------------------------------------------------------
  -- 4 · Clear the previous run. Order matters.
  --
  --     session_change_requests.session_id is NOT NULL with no ON DELETE
  --     clause (migration 0040), so one family-filed request against a
  --     previously generated session would abort the whole transaction with
  --     23503. Those requests are about rows that are about to stop existing,
  --     so they go first.
  --
  --     time_entries / budget_entries / client_sessions all point at sessions
  --     with ON DELETE SET NULL, which is worse than an error: the delete
  --     would succeed and leave a payroll or budget row pointing at nothing.
  --     Refuse instead.
  -- --------------------------------------------------------------------------
  v_n := 0;
  if to_regclass('public.time_entries') is not null then
    execute 'select count(*) from time_entries t join sessions s on s.id = t.session_id
              where s.clinic_id = $1 and s.recurrence_id::text like $2'
      into v_m using v_clinic, v_marker || '%';
    v_n := v_n + v_m;
  end if;
  if to_regclass('public.budget_entries') is not null then
    execute 'select count(*) from budget_entries b join sessions s on s.id = b.session_id
              where s.clinic_id = $1 and s.recurrence_id::text like $2'
      into v_m using v_clinic, v_marker || '%';
    v_n := v_n + v_m;
  end if;
  if to_regclass('public.client_sessions') is not null then
    execute 'select count(*) from client_sessions cs join sessions s on s.id = cs.scheduled_session_id
              where s.clinic_id = $1 and s.recurrence_id::text like $2'
      into v_m using v_clinic, v_marker || '%';
    v_n := v_n + v_m;
  end if;
  if v_n > 0 then
    raise exception 'Refusing to delete the previous seed: % time entry / budget charge / '
      'clinical session row(s) reference it, and those foreign keys are ON DELETE SET NULL - '
      'deleting would orphan them, not clean them up. Resolve those rows first.', v_n;
  end if;

  if to_regclass('public.session_change_requests') is not null then
    delete from session_change_requests scr
     using sessions s
     where scr.session_id = s.id
       and s.clinic_id = v_clinic
       and s.recurrence_id::text like v_marker || '%';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform pg_temp.say(format('removed %s family change request(s) filed against the previous seed', v_n));
    end if;
  end if;

  delete from sessions s
   where s.clinic_id = v_clinic
     and s.recurrence_id::text like v_marker || '%';
  get diagnostics v_n = row_count;
  perform pg_temp.say(format('removed %s session(s) from a previous run of this script', v_n));

  -- --------------------------------------------------------------------------
  -- 5 · The calendar every generated session belongs to.
  --     Sessions on a DRAFT calendar are filtered out of the calendar view
  --     entirely, so an ACTIVE one covering the whole range is required.
  -- --------------------------------------------------------------------------
  select c.id into v_cal
    from calendars c
   where c.clinic_id = v_clinic
     and c.status = 'active'
     and c.date_start <= v_from
     and c.date_end >= v_to
   order by c.id
   limit 1;

  if v_cal is null then
    insert into calendars (name, date_start, date_end, status, clinic_id)
    values ('Demo term 2026', v_from, v_to, 'active', v_clinic)
    returning id into v_cal;
    perform pg_temp.say(format(
      'CREATED a new ACTIVE calendar (id %s, "Demo term 2026"). The scheduler picks the '
      || 'first active calendar out of an unordered select, so real quick-bookings may now '
      || 'default into this term. Archive it once the demo data is removed.', v_cal));
  else
    perform pg_temp.say(format('reusing active calendar id %s', v_cal));
  end if;

  -- --------------------------------------------------------------------------
  -- 5b · People top-up. See WHAT IT WRITES #7 in the header.
  --
  -- Brings the clinic UP TO v_target_staff / v_target_clients. Nobody is ever
  -- removed and an existing roster bigger than the target is left alone, so
  -- this is additive in both directions of "wrong count".
  --
  -- Runs BEFORE the availability and location sections on purpose: people
  -- created here must be picked up by both, or they arrive with no window and
  -- no site and are unbookable - which is exactly the failure this whole
  -- evening was spent diagnosing.
  --
  -- Names are generated so they cannot collide: the first name is indexed by
  -- the row's own counter and the last name by that counter divided by the
  -- number of first names, which walks the full cross product before it ever
  -- repeats a pair. 20 x 12 = 240 distinct names, against a target of 100.
  --
  -- Everything created is recorded in mock_data_seed_people so the cleanup can
  -- remove exactly what this script added and nothing else.
  -- --------------------------------------------------------------------------
  create table if not exists mock_data_seed_people (
    kind text not null check (kind in ('staff_created', 'client_created', 'staff_role_set')),
    row_id bigint not null,
    clinic_id uuid not null references clinics(id) on delete cascade,
    previous_role text,
    created_at timestamptz not null default now(),
    primary key (kind, row_id)
  );
  alter table mock_data_seed_people enable row level security;

  select greatest(v_target_staff - count(*), 0) into v_need
    from staff where clinic_id = v_clinic;

  if v_need > 0 then
    with need as (select generate_series(0, v_need - 1) as i),
    ins as (
      -- Deliberately no role here. The credential pass below fills every
      -- blank in ONE cycle over v_creds; setting it in two places meant two
      -- cycles both restarting at entry 1, which over-weighted the front of
      -- the array and produced 12 RBTs, 6 BCaBAs and a single BCBA.
      insert into staff (name, clinic_id, capacity)
      select v_first[1 + (n.i % array_length(v_first, 1))] || ' ' ||
             v_last [1 + ((n.i / array_length(v_first, 1)) % array_length(v_last, 1))],
             v_clinic,
             -- 4..7 sessions a week each, varied so the capacity meters differ.
             4 + (n.i % 4)
        from need n
      returning id
    )
    insert into mock_data_seed_people (kind, row_id, clinic_id)
    select 'staff_created', id, v_clinic from ins
    on conflict (kind, row_id) do nothing;
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('created %s staff member(s) to reach a roster of %s', v_n, v_target_staff));
  else
    perform pg_temp.say(format('staff roster already at or above %s - created none', v_target_staff));
  end if;

  -- Existing staff with no credential. Their previous value (NULL) is stored
  -- so the cleanup can put it back; this is the one place the script edits a
  -- person who was already here, and it only ever fills a blank.
  insert into mock_data_seed_people (kind, row_id, clinic_id, previous_role)
  select 'staff_role_set', s.id, v_clinic, s.role
    from staff s where s.clinic_id = v_clinic and coalesce(btrim(s.role), '') = ''
  on conflict (kind, row_id) do nothing;

  with tgt as (
    select s.id, row_number() over (order by s.id) - 1 as i
      from staff s where s.clinic_id = v_clinic and coalesce(btrim(s.role), '') = ''
  )
  update staff s set role = v_creds[1 + (t.i % array_length(v_creds, 1))]
    from tgt t where s.id = t.id;
  get diagnostics v_n = row_count;
  perform pg_temp.say(format('assigned a credential to %s staff member(s) who had none', v_n));

  select greatest(v_target_clients - count(*), 0) into v_need
    from clients where clinic_id = v_clinic and status = 'active';

  if v_need > 0 then
    with need as (select generate_series(0, v_need - 1) as i),
    ins as (
      insert into clients (name, clinic_id, status)
      -- The surname block is offset by 5 against the staff generator above so
      -- a clinician and a child never come out with the same full name, which
      -- in a demo reads as a data bug rather than a coincidence.
      select v_first[1 + (n.i % array_length(v_first, 1))] || ' ' ||
             v_last [1 + (((n.i / array_length(v_first, 1)) + 5) % array_length(v_last, 1))],
             v_clinic, 'active'
        from need n
      returning id
    )
    insert into mock_data_seed_people (kind, row_id, clinic_id)
    select 'client_created', id, v_clinic from ins
    on conflict (kind, row_id) do nothing;
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('created %s client(s) to reach %s active', v_n, v_target_clients));
  else
    perform pg_temp.say(format('already at or above %s active clients - created none', v_target_clients));
  end if;

  -- --------------------------------------------------------------------------
  -- 6 · Availability backfill. See WHAT IT WRITES #2 in the header.
  -- --------------------------------------------------------------------------
  if v_backfill_availability then
    create table if not exists mock_data_availability_backfill (
      kind text not null,
      row_id bigint not null,
      clinic_id uuid not null references clinics(id) on delete cascade,
      backfilled_at timestamptz not null default now(),
      primary key (kind, row_id)
    );
    -- The constraint is added separately, and dropped first, because an
    -- earlier version of this script created the table with
    -- `check (kind in ('staff','client'))` inline. `create table if not
    -- exists` would leave that narrower constraint in place on a database
    -- that already ran it, and the two new kinds below would fail against it.
    alter table mock_data_availability_backfill
      drop constraint if exists mock_data_availability_backfill_kind_check;
    alter table mock_data_availability_backfill
      add constraint mock_data_availability_backfill_kind_check
      check (kind in ('staff', 'client', 'staff_inserted', 'client_inserted'));
    -- Deny-all: RLS on with no policy at all. Nothing in any app reads this
    -- table, and only the service role should ever touch it.
    alter table mock_data_availability_backfill enable row level security;

    -- ------------------------------------------------------------------
    -- 6a-i · MISSING availability rows, not just NULL ones.
    --
    -- Confirmed live 2026-09-18: this clinic's `staff_availability` was
    -- EMPTY - not null-windowed, absent - for all 14 staff, while every
    -- client had six. The backfill below only ever UPDATEd rows that already
    -- existed, so it fixed nothing and the weekly template came out empty
    -- with "check the distinct day values" as the only clue. A person with no
    -- availability row at all is available for nothing, which is the same
    -- outcome as a NULL window and needs the same treatment.
    --
    -- ONLY people with ZERO rows are given any. Somebody with a partial week
    -- has expressed a real preference - Mondays only, say - and filling in
    -- the rest of their week would silently widen it into something they did
    -- not agree to. Zero rows expresses nothing, so there is nothing to
    -- overwrite. That distinction is the whole rule here.
    --
    -- Reversible: every inserted row's id is recorded under the
    -- '*_inserted' kinds, which the cleanup DELETEs rather than nulls.
    -- ------------------------------------------------------------------
    -- Per-person, not one identical week for everybody. Two dimensions vary:
    --
    --   DAYS  - every odd weekday ordinal is always in (Mon/Wed/Fri against a
    --           Mon-first list), so nobody ends up with a week too sparse to
    --           book; the even ones come and go on
    --           `((i + 1) * (ord + 2)) % 7 < 4`. That floor is deliberate: a
    --           purely random subset produces the occasional person free one
    --           day a week, who then collides with everyone else competing
    --           for that day. The multiplicative form matters - an additive
    --           `(i + ord) % 3` gives every person a DIFFERENT set of days
    --           but always exactly four of them, because ordinals 2/4/6 hit
    --           all three residues mod 3 exactly once. Counts then look
    --           identical across the roster, which is not what "varied
    --           availability" means to anyone reading the screen.
    --   HOURS - three staggered windows keyed off the person's own index:
    --           09:00-17:00, 09:30-16:00, 10:00-15:00. All three overlap
    --           heavily in the middle of the day, which is what keeps a
    --           clinician and a client findable in the same slot. A window
    --           that would come out shorter than two hours falls back to the
    --           full one.
    --
    -- Deterministic despite looking arbitrary: the index is row_number() over
    -- a stable ordering, so the same database produces the same roster of
    -- windows on every run - the same property the rest of this script has.
    with tgt as (
      select s.id, row_number() over (order by s.id) - 1 as i
        from staff s
       where s.clinic_id = v_clinic
         and (lower(btrim(coalesce(s.role, ''))) = any (array['bcba','bcaba','rbt','supervisor'])
              or coalesce(s.capacity, 0) > 0)
         and not exists (select 1 from staff_availability a where a.staff_id = s.id)
    ), ins as (
      insert into staff_availability (staff_id, clinic_id, day, start_time, end_time)
      select t.id, v_clinic, d.day,
             make_time((w.s / 60)::int, (w.s % 60)::int, 0),
             make_time((w.e / 60)::int, (w.e % 60)::int, 0)
        from tgt t
        cross join unnest(v_days) with ordinality as d(day, ord)
        cross join lateral (
          select v_start_m + ((t.i % 3) * 30) as s0,
                 v_end_m   - ((t.i % 3) * 60) as e0
        ) w0
        cross join lateral (
          select case when w0.e0 - w0.s0 >= 120 then w0.s0 else v_start_m end as s,
                 case when w0.e0 - w0.s0 >= 120 then w0.e0 else v_end_m   end as e
        ) w
       where d.ord % 2 = 1 or (((t.i + 1) * (d.ord + 2)) % 7) < 4
      returning id
    )
    insert into mock_data_availability_backfill (kind, row_id, clinic_id)
    select 'staff_inserted', id, v_clinic from ins
    on conflict (kind, row_id) do nothing;
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('created %s staff_availability row(s) for staff who had none', v_n));

    -- Same shape for clients, with the phase shifted (i * 2) so the two
    -- populations do not land on identical day patterns and accidentally
    -- concentrate every booking on the same three days.
    with tgt as (
      select c.id, row_number() over (order by c.id) - 1 as i
        from clients c
       where c.clinic_id = v_clinic and c.status = 'active'
         and not exists (select 1 from client_availability a where a.client_id = c.id)
    ), ins as (
      insert into client_availability (client_id, clinic_id, day, start_time, end_time)
      select t.id, v_clinic, d.day,
             make_time((w.s / 60)::int, (w.s % 60)::int, 0),
             make_time((w.e / 60)::int, (w.e % 60)::int, 0)
        from tgt t
        cross join unnest(v_days) with ordinality as d(day, ord)
        cross join lateral (
          select v_start_m + ((t.i % 3) * 30) as s0,
                 v_end_m   - ((t.i % 3) * 60) as e0
        ) w0
        cross join lateral (
          select case when w0.e0 - w0.s0 >= 120 then w0.s0 else v_start_m end as s,
                 case when w0.e0 - w0.s0 >= 120 then w0.e0 else v_end_m   end as e
        ) w
       where d.ord % 2 = 1 or (((t.i + 2) * (d.ord + 2)) % 7) < 4
      returning id
    )
    insert into mock_data_availability_backfill (kind, row_id, clinic_id)
    select 'client_inserted', id, v_clinic from ins
    on conflict (kind, row_id) do nothing;
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('created %s client_availability row(s) for clients who had none', v_n));

    insert into mock_data_availability_backfill (kind, row_id, clinic_id)
    select 'staff', a.id, v_clinic
      from staff_availability a
     where a.clinic_id = v_clinic
       and left(initcap(a.day), 3) = any(v_days)
       and (a.start_time is null or a.end_time is null)
    on conflict (kind, row_id) do nothing;

    -- Same staggered windows as the inserts above, rather than stamping every
    -- null-windowed row with one identical 09:00-17:00. A NULL window says
    -- "nothing was ever set here", so there is no preference being overridden
    -- - but there is also no reason to make the whole clinic look like it
    -- keeps identical hours.
    with k as (
      select p.id, row_number() over (order by p.id) - 1 as i
        from staff p where p.clinic_id = v_clinic
    )
    update staff_availability a
       set start_time = make_time((w.s / 60)::int, (w.s % 60)::int, 0),
           end_time   = make_time((w.e / 60)::int, (w.e % 60)::int, 0)
      from k
      cross join lateral (
        select v_start_m + ((k.i % 3) * 30) as s0,
               v_end_m   - ((k.i % 3) * 60) as e0
      ) w0
      cross join lateral (
        select case when w0.e0 - w0.s0 >= 120 then w0.s0 else v_start_m end as s,
               case when w0.e0 - w0.s0 >= 120 then w0.e0 else v_end_m   end as e
      ) w
     where a.staff_id = k.id
       and a.clinic_id = v_clinic
       and left(initcap(a.day), 3) = any(v_days)
       and (a.start_time is null or a.end_time is null);
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('backfilled %s NULL staff_availability window(s)', v_n));

    insert into mock_data_availability_backfill (kind, row_id, clinic_id)
    select 'client', a.id, v_clinic
      from client_availability a
     where a.clinic_id = v_clinic
       and left(initcap(a.day), 3) = any(v_days)
       and (a.start_time is null or a.end_time is null)
    on conflict (kind, row_id) do nothing;

    -- Same staggered windows as the inserts above, rather than stamping every
    -- null-windowed row with one identical 09:00-17:00. A NULL window says
    -- "nothing was ever set here", so there is no preference being overridden
    -- - but there is also no reason to make the whole clinic look like it
    -- keeps identical hours.
    with k as (
      select p.id, row_number() over (order by p.id) - 1 as i
        from clients p where p.clinic_id = v_clinic and p.status = 'active'
    )
    update client_availability a
       set start_time = make_time((w.s / 60)::int, (w.s % 60)::int, 0),
           end_time   = make_time((w.e / 60)::int, (w.e % 60)::int, 0)
      from k
      cross join lateral (
        select v_start_m + ((k.i % 3) * 30) as s0,
               v_end_m   - ((k.i % 3) * 60) as e0
      ) w0
      cross join lateral (
        select case when w0.e0 - w0.s0 >= 120 then w0.s0 else v_start_m end as s,
               case when w0.e0 - w0.s0 >= 120 then w0.e0 else v_end_m   end as e
      ) w
     where a.client_id = k.id
       and a.clinic_id = v_clinic
       and left(initcap(a.day), 3) = any(v_days)
       and (a.start_time is null or a.end_time is null);
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('backfilled %s NULL client_availability window(s)', v_n));
  else
    perform pg_temp.say('availability backfill DISABLED - only people with a real availability '
      || 'window will get sessions');
  end if;

  -- --------------------------------------------------------------------------
  -- 6b · Location assignment. See WHAT IT WRITES #5 in the header.
  --
  -- NOT a prerequisite for seeding, and it is worth being precise about that
  -- because the opposite was briefly believed. The pairing rule below is
  -- `s.location_id is not distinct from rq.client_loc`, and `is not distinct
  -- from` treats NULL as equal to NULL - so a clinic where every location_id
  -- is NULL seeds perfectly well, with everyone eligible for everyone. This
  -- section exists to make the seeded calendar LOOK like a multi-site clinic
  -- (so the location filter, the location column and visibleLocation() have
  -- something real to show), not to make it possible.
  --
  -- CAPACITY-WEIGHTED, not round-robin, and the difference is the whole point.
  --
  -- An even round-robin was the first attempt and it failed badly against
  -- real data (2026-09-18): the clinic had three genuine sites with every
  -- one of its fourteen staff at a single one of them. Spreading clients
  -- evenly gave the two staffless sites thirty-odd children each against the
  -- two clinicians this script had just created there - 9 and 11 weekly
  -- capacity against 30 and 32 clients. 42 of 100 children matched nobody and
  -- came out of the run with no sessions at all, while the third site sat on
  -- 123 weekly capacity for 38 clients.
  --
  -- So both halves now follow capacity instead of headcount, greedily, one
  -- row at a time:
  --
  --   STAFF   go to the site with the worst clients-per-capacity ratio, so
  --           new hires land where the shortage actually is rather than
  --           being sprinkled evenly over sites that do not need them.
  --   CLIENTS go to the site with the most unused capacity, which by
  --           construction cannot pile a child onto a site that has nobody
  --           to see them while another sits idle.
  --
  -- Greedy rather than proportional arithmetic because it is obviously
  -- correct on inspection and self-corrects as it goes: each assignment
  -- changes the ratio the next one reads. At 3 sites and ~66 assignments the
  -- cost is irrelevant.
  --
  -- Still deterministic: ties break on location id, and the rows are
  -- processed in id order.
  --
  -- Only rows whose location_id is already NULL are touched, so a real
  -- assignment made in the app is never overwritten. Reversible: the previous
  -- value of every row it changes, and the id of every location it creates,
  -- goes into mock_data_location_backfill.
  -- --------------------------------------------------------------------------
  if v_assign_locations then
    create table if not exists mock_data_location_backfill (
      kind text not null check (kind in ('staff', 'client', 'location')),
      row_id bigint not null,
      clinic_id uuid not null references clinics(id) on delete cascade,
      previous_location_id bigint,
      assigned_at timestamptz not null default now(),
      primary key (kind, row_id)
    );
    -- Same deny-all posture as mock_data_availability_backfill: RLS on, no
    -- policy at all. Nothing in any app reads it.
    alter table mock_data_location_backfill enable row level security;

    -- Re-balance what THIS SCRIPT assigned on an earlier run, before working
    -- out where anything goes. Without this, a second run finds every row it
    -- placed last time already carrying a location_id, skips them all as
    -- "already assigned", and faithfully reproduces whatever imbalance the
    -- previous run created - which is exactly what happened live on
    -- 2026-09-18, where a re-run could not have repaired the 42 clients the
    -- even round-robin had stranded.
    --
    -- Only rows recorded in mock_data_location_backfill are reset, and they
    -- are reset to the value recorded there, which for a row this script
    -- assigned is NULL. An assignment made in the app is not in that table
    -- and is never touched.
    update staff s set location_id = b.previous_location_id
      from mock_data_location_backfill b
     where b.kind = 'staff' and b.row_id = s.id and b.clinic_id = v_clinic;
    update clients c set location_id = b.previous_location_id
      from mock_data_location_backfill b
     where b.kind = 'client' and b.row_id = c.id and b.clinic_id = v_clinic;

    select count(*) into v_nloc from locations where clinic_id = v_clinic;

    if v_nloc = 0 then
      foreach v_loc_name in array v_demo_locations loop
        insert into locations (clinic_id, name) values (v_clinic, v_loc_name)
        returning id into v_loc_id;
        insert into mock_data_location_backfill (kind, row_id, clinic_id)
        values ('location', v_loc_id, v_clinic)
        on conflict (kind, row_id) do nothing;
      end loop;
      v_nloc := array_length(v_demo_locations, 1);
      perform pg_temp.say(format('created %s demo location(s): %s - this clinic had none',
                                 v_nloc, array_to_string(v_demo_locations, ', ')));
    else
      perform pg_temp.say(format('using the %s location(s) this clinic already has', v_nloc));
    end if;

    insert into mock_data_location_backfill (kind, row_id, clinic_id, previous_location_id)
    select 'staff', s.id, v_clinic, s.location_id
      from staff s where s.clinic_id = v_clinic and s.location_id is null
    on conflict (kind, row_id) do nothing;

    v_n := 0;
    for v_rec in select id from staff
                  where clinic_id = v_clinic and location_id is null order by id loop
      select l.id into v_loc_id
        from locations l
       where l.clinic_id = v_clinic
       order by (select count(*) from clients c
                  where c.clinic_id = v_clinic and c.status = 'active'
                    and c.location_id = l.id)::numeric
                / greatest((select coalesce(sum(least(coalesce(s2.capacity, 0), v_staff_week_max)), 0)
                              from staff s2
                             where s2.clinic_id = v_clinic and s2.location_id = l.id), 1)
                desc, l.id
       limit 1;
      update staff set location_id = v_loc_id where id = v_rec.id;
      v_n := v_n + 1;
    end loop;
    perform pg_temp.say(format('assigned a location to %s staff row(s), worst-shortage-first', v_n));

    insert into mock_data_location_backfill (kind, row_id, clinic_id, previous_location_id)
    select 'client', c.id, v_clinic, c.location_id
      from clients c where c.clinic_id = v_clinic and c.location_id is null
    on conflict (kind, row_id) do nothing;

    v_n := 0;
    for v_rec in select id from clients
                  where clinic_id = v_clinic and location_id is null order by id loop
      select l.id into v_loc_id
        from locations l
       where l.clinic_id = v_clinic
       order by ((select coalesce(sum(least(coalesce(s2.capacity, 0), v_staff_week_max)), 0)
                    from staff s2
                   where s2.clinic_id = v_clinic and s2.location_id = l.id)
                 - (select count(*) from clients c
                     where c.clinic_id = v_clinic and c.status = 'active'
                       and c.location_id = l.id)) desc, l.id
       limit 1;
      update clients set location_id = v_loc_id where id = v_rec.id;
      v_n := v_n + 1;
    end loop;
    perform pg_temp.say(format('assigned a location to %s client row(s), most-spare-capacity-first', v_n));

    -- A site with clients but no clinicians books nobody. Report it rather
    -- than let those clients quietly come out of the run with zero sessions.
    select string_agg(l.name, ', ' order by l.name) into v_orphan
      from locations l
     where l.clinic_id = v_clinic
       and exists (select 1 from clients c
                    where c.clinic_id = v_clinic and c.location_id = l.id
                      and coalesce(c.status, 'active') = 'active')
       and not exists (select 1 from staff s
                        where s.clinic_id = v_clinic and s.location_id = l.id);
    if v_orphan is not null then
      perform pg_temp.say('WARNING: location(s) with active clients but no staff - their '
        || 'clients can match nobody and will get no sessions: ' || v_orphan);
    end if;
  else
    perform pg_temp.say('location assignment DISABLED - every location_id left as it is');
  end if;

  -- ==========================================================================
  -- 7 · Working sets
  -- ==========================================================================

  -- Bookable clients. The wizard's client pool is status = 'active' only;
  -- waitlist and inactive clients are never bookable anywhere in the app.
  create temp table t_client (
    seq int not null, id bigint primary key, location_id bigint, placed int not null default 0
  ) on commit drop;
  insert into t_client (seq, id, location_id)
  select row_number() over (order by c.id), c.id, c.location_id
    from clients c
   where c.clinic_id = v_clinic and c.status = 'active';

  -- Session-delivering staff. Mirrors apps/scheduler/lib/staff-roles.ts's
  -- isClinicalStaff(): a clinical credential in staff.role (the clinical
  -- credential column, NOT profiles.role), or a deliberately configured
  -- capacity. An invited admin or scheduler has neither and is correctly
  -- excluded - booking them would not be something an operator could do.
  create temp table t_staff (
    seq int not null, id bigint primary key, location_id bigint,
    cap int not null, placed int not null default 0
  ) on commit drop;
  insert into t_staff (seq, id, location_id, cap)
  select row_number() over (order by s.id), s.id, s.location_id,
         case when coalesce(s.capacity, 0) > 0
              then least(s.capacity, v_staff_week_max)
              else v_staff_week_max end
    from staff s
   where s.clinic_id = v_clinic
     and (lower(btrim(coalesce(s.role, ''))) = any (array['bcba', 'bcaba', 'rbt', 'supervisor'])
          or coalesce(s.capacity, 0) > 0);

  select coalesce(string_agg(s.name, ', '), '') into v_txt
    from staff s join t_staff t on t.id = s.id
   where coalesce(s.capacity, 0) <= 0;
  if v_txt <> '' then
    perform pg_temp.say('NOTE: these staff have capacity 0 or NULL and were given the default '
      || 'weekly ceiling here, but the app''s own booking wizard filters on `booked < capacity` '
      || 'and will not offer them: ' || v_txt);
  end if;

  -- Client-facing session types. is_client_optional types are excluded - see
  -- the COVERAGE GAPS note in the header for why they stay out even now that
  -- migration 0078 makes a client-less block insertable.
  -- Duplicate names collapse to the largest duration and gaps.
  create temp table t_type (
    seq int not null, name text primary key, duration int not null,
    gap_before int not null, gap_after int not null, grid_min int not null
  ) on commit drop;
  insert into t_type (seq, name, duration, gap_before, gap_after, grid_min)
  select row_number() over (order by min(st.id)), st.name,
         max(st.duration),
         max(st.gap_before_minutes),
         max(st.gap_after_minutes),
         max(coalesce(st.grid_increment_minutes, v_inc))
    from session_types st
   where st.clinic_id = v_clinic
     and st.is_client_optional = false
     and st.duration > 0
   group by st.name;

  delete from t_type t where t.duration > (v_end_m - v_start_m);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform pg_temp.say(format('%s session type(s) are longer than the effective work window '
      || 'and were skipped', v_n));
  end if;

  select count(*) into v_n from t_client;
  if v_n = 0 then
    raise exception 'no active clients for clinic % - nothing to book', v_clinic;
  end if;
  select count(*) into v_m from t_staff;
  if v_m = 0 then
    raise exception 'no session-delivering staff for clinic % (needs a BCBA/BCaBA/RBT/Supervisor '
      'credential in staff.role, or a capacity above 0)', v_clinic;
  end if;
  select count(*) into v_type_n from t_type;
  if v_type_n = 0 then
    raise exception 'no client-facing session types for clinic % (every type is either '
      'is_client_optional, zero-duration, or longer than the work window)', v_clinic;
  end if;
  perform pg_temp.say(format('%s active client(s), %s session-delivering staff, %s client-facing type(s)',
    v_n, v_m, v_type_n));

  -- Availability as minute ranges, day spelling normalised. `end_time` is
  -- exclusive and is stored as the next slot boundary, so requiring
  -- to_min >= start + duration is the app's own rule on the schedules panel:
  -- the whole session has to fit inside the window, not just its start.
  create temp table t_savail (
    staff_id bigint not null, dow text not null, from_min int not null, to_min int not null
  ) on commit drop;
  insert into t_savail (staff_id, dow, from_min, to_min)
  select a.staff_id, left(initcap(a.day), 3),
         extract(hour from a.start_time)::int * 60 + extract(minute from a.start_time)::int,
         extract(hour from a.end_time)::int * 60 + extract(minute from a.end_time)::int
    from staff_availability a
   where a.clinic_id = v_clinic
     and a.start_time is not null and a.end_time is not null;
  create index on t_savail (staff_id, dow);

  create temp table t_cavail (
    client_id bigint not null, dow text not null, from_min int not null, to_min int not null
  ) on commit drop;
  insert into t_cavail (client_id, dow, from_min, to_min)
  select a.client_id, left(initcap(a.day), 3),
         extract(hour from a.start_time)::int * 60 + extract(minute from a.start_time)::int,
         extract(hour from a.end_time)::int * 60 + extract(minute from a.end_time)::int
    from client_availability a
   where a.clinic_id = v_clinic
     and a.start_time is not null and a.end_time is not null;
  create index on t_cavail (client_id, dow);

  -- Every date the template can project onto. Weekday abbreviation comes from
  -- an array indexed by extract(dow), never to_char, which is locale-dependent.
  create temp table t_dates (d date primary key, dow text not null) on commit drop;
  insert into t_dates (d, dow)
  select g::date, (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from g)::int + 1]
    from generate_series(v_from, v_to, interval '1 day') g
   where (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from g)::int + 1] = any(v_days);

  -- Holidays are removed in a separate, guarded statement rather than as an
  -- `or to_regclass(...) is null` branch of the insert above: Postgres parses a
  -- whole statement before it runs one, so a reference to public_holidays in
  -- that insert would fail outright on a database without migration 0027
  -- instead of short-circuiting. A statement inside an untaken IF branch is
  -- never parsed.
  if v_skip_holidays and to_regclass('public.public_holidays') is not null then
    delete from t_dates dt
     where exists (select 1 from public_holidays ph
                    where ph.holiday_date = dt.d
                      and (ph.clinic_id = v_clinic or ph.clinic_id is null));
    get diagnostics v_n = row_count;
    perform pg_temp.say(format('%s public holiday date(s) removed from the range', v_n));
  end if;

  create index on t_dates (dow);

  create temp table t_dowcount (dow text primary key, n int not null) on commit drop;
  insert into t_dowcount (dow, n)
  select dt.dow, count(*)::int from t_dates dt group by dt.dow;

  -- A freshly created temp table has no statistics, and the candidate query in
  -- step 8 runs once per placement over the cross product of staff, types,
  -- weekdays and slots. Without this the planner guesses and can pick a plan
  -- that turns a ten-second run into a timeout.
  analyze t_client;
  analyze t_staff;
  analyze t_type;
  analyze t_savail;
  analyze t_cavail;
  analyze t_dates;

  select count(*) into v_n from t_dates;
  if v_n = 0 then
    raise exception 'no working dates between % and % - check calendar.workDays', v_from, v_to;
  end if;
  perform pg_temp.say(format('%s working date(s) in range after removing public holidays', v_n));

  -- ==========================================================================
  -- 8 · The weekly template
  --
  -- One row here is one weekly series. The template is built so that it is
  -- internally conflict-free for every clinician AND every client, padded by
  -- each session type's gap_before/gap_after. That internal guarantee is what
  -- makes the projection safe: the NOT EXISTS filters in step 9 run against
  -- the statement's snapshot and cannot see rows the same INSERT is adding.
  -- Weekdays project onto disjoint dates and no session reaches past 17:00,
  -- so nothing generated here can collide with anything else generated here.
  -- Do not weaken rules 4 and 5 below on the belief that step 9 covers them.
  -- ==========================================================================
  create temp table t_tmpl (
    series_n int primary key, phase int not null,
    client_id bigint not null, employee_id bigint not null,
    type_name text not null, duration int not null,
    gap_before int not null, gap_after int not null,
    dow text not null, start_min int not null, location_id bigint
  ) on commit drop;
  create index on t_tmpl (dow, employee_id);
  create index on t_tmpl (dow, client_id);

  -- A placement request. Phases run in order and each one generates its own.
  create temp table t_req (
    seq bigint generated by default as identity primary key,
    phase int not null, rnd int not null,
    client_id bigint not null, client_seq int not null, client_loc bigint,
    force_staff bigint, force_type text
  ) on commit drop;

  --  phase 1  every active client gets one session
  --  phase 2  every clinician still empty gets one
  --  phase 3  every client-facing type still missing gets one
  --  phase 4+ fill, one extra session per client per round
  v_phase_max := 3 + greatest(v_client_week_max - 1, 0);

  for v_phase in 1 .. v_phase_max loop
    if v_phase >= 4 and v_projected >= v_max_total then
      continue;
    end if;

    delete from t_req;

    if v_phase = 1 then
      insert into t_req (phase, rnd, client_id, client_seq, client_loc)
      select 1, 1, c.id, c.seq, c.location_id from t_client c order by c.seq;

    elsif v_phase = 2 then
      insert into t_req (phase, rnd, client_id, client_seq, client_loc, force_staff)
      select 2, 1, c.id, c.seq, c.location_id, s.id
        from t_staff s
        join lateral (
          select c2.id, c2.seq, c2.location_id
            from t_client c2
           where c2.location_id is not distinct from s.location_id
           order by c2.placed, c2.seq
           limit 2
        ) c on true
       where s.placed = 0
       order by s.seq, c.seq;

    elsif v_phase = 3 then
      insert into t_req (phase, rnd, client_id, client_seq, client_loc, force_type)
      select 3, 1, c.id, c.seq, c.location_id, t.name
        from t_type t
        join lateral (
          select c2.id, c2.seq, c2.location_id
            from t_client c2
           order by c2.placed, c2.seq
           limit 3
        ) c on true
       where not exists (select 1 from t_tmpl x where x.type_name = t.name)
       order by t.seq, c.seq;

    else
      insert into t_req (phase, rnd, client_id, client_seq, client_loc)
      select v_phase, v_phase - 2, c.id, c.seq, c.location_id
        from t_client c
       where c.placed < v_client_week_max
       order by c.placed, c.seq;
    end if;

    for rq in select * from t_req order by seq loop
      -- Coverage phases always run; only the fill phases respect the cap.
      exit when v_phase >= 4 and v_projected >= v_max_total;

      if v_phase = 2
         and coalesce((select s.placed from t_staff s where s.id = rq.force_staff), 0) > 0 then
        continue;
      end if;
      if v_phase = 3 and exists (select 1 from t_tmpl x where x.type_name = rq.force_type) then
        continue;
      end if;
      if v_phase >= 4
         and coalesce((select c.placed from t_client c where c.id = rq.client_id), 0) >= v_client_week_max then
        continue;
      end if;

      v_pick_staff := null;

      select s.id, t.name, t.duration, t.gap_before, t.gap_after, d.dow, sl.start_min, s.location_id
        into v_pick_staff, v_pick_type, v_pick_dur, v_pick_gb, v_pick_ga,
             v_pick_dow, v_pick_start, v_pick_loc
        from t_staff s
        cross join t_type t
        cross join unnest(v_days) with ordinality as d(dow, dord)
        cross join lateral generate_series(v_anchor_m, v_end_m - t.duration, t.grid_min) as sl(start_min)
       where
         -- Rule 1 · the slot itself is legal: on the calendar's own grid
         -- (anchored at the org working-day start), inside the effective
         -- window, and the whole session fits before the window closes.
             sl.start_min >= v_start_m
         and sl.start_min + t.duration <= v_end_m
         -- Rule 2 · eligibility, exactly as the app enforces it today: same
         -- location, and capacity respected. Specialties were dropped from
         -- matching entirely on 2026-09-16 and are deliberately not a filter.
         -- `is not distinct from` reproduces the JS `===` that pairs a
         -- NULL-location client with NULL-location staff.
         and s.location_id is not distinct from rq.client_loc
         and s.placed < s.cap
         and (rq.force_staff is null or s.id = rq.force_staff)
         and (rq.force_type is null or t.name = rq.force_type)
         -- Rule 3 · both parties are available for the whole session
         and exists (select 1 from t_savail a
                      where a.staff_id = s.id and a.dow = d.dow
                        and a.from_min <= sl.start_min
                        and a.to_min >= sl.start_min + t.duration)
         and exists (select 1 from t_cavail a
                      where a.client_id = rq.client_id and a.dow = d.dow
                        and a.from_min <= sl.start_min
                        and a.to_min >= sl.start_min + t.duration)
         -- Rules 4 and 5 · no gap-padded overlap with anything already placed
         -- for this clinician OR this client on this weekday. The client half
         -- has no database constraint behind it at all - this is the only
         -- thing preventing a double-booked child.
         and not exists (
               select 1 from t_tmpl x
                where x.dow = d.dow
                  and (x.employee_id = s.id or x.client_id = rq.client_id)
                  and (sl.start_min - t.gap_before) < (x.start_min + x.duration + x.gap_after)
                  and (x.start_min - x.gap_before) < (sl.start_min + t.duration + t.gap_after))
       order by
         -- Deterministic pseudo-random spread: rotate the preferred type, day
         -- and hour-band per client and per round, prefer the least-loaded
         -- clinician, then break ties with a fixed hash. No random() anywhere,
         -- so a re-run reproduces this schedule exactly. The hour-band rotation
         -- is what keeps the first slot of the day in play: a plain hash over
         -- start_min gives every slot a fixed rank, and whichever slot ranks
         -- worst simply never gets picked.
         case when t.seq = 1 + ((rq.client_seq + rq.rnd) % v_type_n) then 0 else 1 end,
         case when d.dord = 1 + ((rq.client_seq + rq.rnd * 2) % v_day_n) then 0 else 1 end,
         case when (sl.start_min - v_start_m) / 60
                     = ((rq.client_seq * 3 + rq.rnd * 5) % v_band_n) then 0 else 1 end,
         s.placed,
         ((sl.start_min * 7 + d.dord::int * 131 + t.seq * 53
           + rq.client_seq * 17 + rq.rnd * 29) % 97),
         d.dord, sl.start_min, t.seq, s.id
       limit 1;

      if v_pick_staff is not null then
        v_series := v_series + 1;
        insert into t_tmpl (series_n, phase, client_id, employee_id, type_name, duration,
                            gap_before, gap_after, dow, start_min, location_id)
        values (v_series, v_phase, rq.client_id, v_pick_staff, v_pick_type, v_pick_dur,
                v_pick_gb, v_pick_ga, v_pick_dow, v_pick_start, v_pick_loc);

        update t_staff s set placed = s.placed + 1 where s.id = v_pick_staff;
        update t_client c set placed = c.placed + 1 where c.id = rq.client_id;
        v_projected := v_projected
                     + coalesce((select dc.n from t_dowcount dc where dc.dow = v_pick_dow), 0);
      end if;
    end loop;
  end loop;

  select count(*) into v_n from t_tmpl;
  if v_n = 0 then
    raise exception 'the weekly template came out empty. The usual cause is availability: '
      'check the distinct day values reported above, and that staff and clients share a '
      'location_id.';
  end if;
  perform pg_temp.say(format('weekly template: %s session(s) across %s weekday(s)',
    v_n, (select count(distinct t.dow) from t_tmpl t)));

  -- Coverage, reported honestly rather than assumed.
  select coalesce(left(string_agg(c.name, ', '), 400), '') into v_txt
    from clients c join t_client tc on tc.id = c.id where tc.placed = 0;
  if v_txt <> '' then
    perform pg_temp.say('clients with NO sessions (no matching staff at their location, or no '
      || 'overlapping availability): ' || v_txt);
  end if;

  select coalesce(left(string_agg(s.name, ', '), 400), '') into v_txt
    from staff s join t_staff ts on ts.id = s.id where ts.placed = 0;
  if v_txt <> '' then
    perform pg_temp.say('staff with NO sessions (no active client at their location, or no '
      || 'overlapping availability): ' || v_txt);
  end if;

  select coalesce(string_agg(t.name, ', '), '') into v_txt
    from t_type t where not exists (select 1 from t_tmpl m where m.type_name = t.name);
  if v_txt <> '' then
    perform pg_temp.say('session types with NO sessions (no client/staff pair could fit one): ' || v_txt);
  end if;

  -- ==========================================================================
  -- 9 · Project the week across the range and insert
  -- ==========================================================================
  create temp table t_proj (
    series_n int not null, client_id bigint not null, employee_id bigint not null,
    type_name text not null, session_date date not null, hr int not null, mn int not null,
    location_id bigint, win_start timestamp not null, win_end timestamp not null
  ) on commit drop;

  insert into t_proj (series_n, client_id, employee_id, type_name, session_date, hr, mn,
                      location_id, win_start, win_end)
  select t.series_n, t.client_id, t.employee_id, t.type_name, dt.d,
         t.start_min / 60, t.start_min % 60, t.location_id,
         dt.d + make_time(t.start_min / 60, t.start_min % 60, 0)
           - make_interval(mins => t.gap_before),
         dt.d + make_time(t.start_min / 60, t.start_min % 60, 0)
           + make_interval(mins => t.duration + t.gap_after)
    from t_tmpl t
    join t_dates dt on dt.dow = t.dow;

  select count(*) into v_proj_rows from t_proj;

  -- The three NOT EXISTS clauses below are what keeps PRE-EXISTING real
  -- bookings safe. They reproduce 0045's own tests in the SELECT so a
  -- collision skips one row instead of raising 23505/23P01 and aborting the
  -- entire batch. The exact-slot test is kept separate from the range test on
  -- purpose: session_types.duration has no positivity check in the database,
  -- and a zero-duration type would make the range empty and the range test
  -- useless while the unique index still fired.
  insert into sessions (clinic_id, calendar_id, client_id, employee_id, session_date,
                        hour, minute, type, status, recurrence_id,
                        location_id, is_home_visit, home_address)
  select v_clinic, v_cal, p.client_id, p.employee_id, p.session_date,
         p.hr, p.mn, p.type_name, 'scheduled',
         (v_marker || lpad(to_hex(p.series_n), 12, '0'))::uuid,
         p.location_id, false, null
    from t_proj p
   where not exists (
           select 1 from sessions x
            where x.employee_id = p.employee_id
              and x.session_date = p.session_date
              and x.hour = p.hr and x.minute = p.mn
              and x.status <> 'cancelled')
     and not exists (
           select 1 from sessions x
           left join session_types xt on xt.clinic_id = x.clinic_id and xt.name = x.type
            where x.employee_id = p.employee_id
              and x.status <> 'cancelled'
              and x.session_date between p.session_date - 1 and p.session_date + 1
              and tsrange(
                    x.session_date + make_time(x.hour, x.minute, 0)
                      - make_interval(mins => coalesce(xt.gap_before_minutes, 0)),
                    x.session_date + make_time(x.hour, x.minute, 0)
                      + make_interval(mins => coalesce(xt.duration, 60)
                                            + coalesce(xt.gap_after_minutes, 0)),
                    '[)') && tsrange(p.win_start, p.win_end, '[)'))
     and not exists (
           select 1 from sessions x
           left join session_types xt on xt.clinic_id = x.clinic_id and xt.name = x.type
            where x.client_id = p.client_id
              and x.status <> 'cancelled'
              and x.session_date between p.session_date - 1 and p.session_date + 1
              and tsrange(
                    x.session_date + make_time(x.hour, x.minute, 0)
                      - make_interval(mins => coalesce(xt.gap_before_minutes, 0)),
                    x.session_date + make_time(x.hour, x.minute, 0)
                      + make_interval(mins => coalesce(xt.duration, 60)
                                            + coalesce(xt.gap_after_minutes, 0)),
                    '[)') && tsrange(p.win_start, p.win_end, '[)'));
  get diagnostics v_ins = row_count;

  -- ==========================================================================
  -- 10 · Report
  -- ==========================================================================
  perform pg_temp.say(format('INSERTED %s session(s); %s projected row(s) were skipped because '
    || 'they collided with a booking that already existed', v_ins, v_proj_rows - v_ins));

  select format('covering %s client(s), %s clinician(s), %s session type(s), %s .. %s',
                count(distinct s.client_id), count(distinct s.employee_id),
                count(distinct s.type), min(s.session_date), max(s.session_date))
    into v_txt
    from sessions s
   where s.clinic_id = v_clinic and s.recurrence_id::text like v_marker || '%';
  perform pg_temp.say(v_txt);

  select count(*) into v_n from sessions s where s.clinic_id = v_clinic;
  perform pg_temp.say(format('sessions table now holds %s row(s) for this clinic', v_n));
  if v_n > 1000 then
    perform pg_temp.say('WARNING: over 1000 sessions for this clinic. The scheduler''s '
      || 'unbounded select("*") on sessions will be truncated by PostgREST and its bookings '
      || 'list, past-bookings list and engagement leaderboard will silently under-report.');
  end if;

  perform pg_temp.say('done. Cleanup statements are in this file''s header.');
end
$seed$;

commit;

-- The run log. The Supabase SQL editor shows the last statement's result, so
-- this is what you will see; RAISE NOTICE carried the same lines.
select ord, note from mock_data_run_log order by ord;


-- ============================================================================
-- VERIFY THE RESULT (run separately)
--
--   select session_date, hour, minute, type, client_id, employee_id
--     from sessions
--    where clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'
--      and recurrence_id::text like 'dddddddd-dddd-4ddd-8ddd-%'
--    order by session_date, hour, minute
--    limit 50;
--
--   -- must return zero rows: a clinician booked twice in one slot
--   select employee_id, session_date, hour, minute, count(*)
--     from sessions
--    where clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'
--      and status <> 'cancelled'
--    group by 1, 2, 3, 4 having count(*) > 1;
--
--   -- must return zero rows: a child booked twice in one slot
--   select client_id, session_date, hour, minute, count(*)
--     from sessions
--    where clinic_id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9'
--      and status <> 'cancelled'
--    group by 1, 2, 3, 4 having count(*) > 1;
--
--   -- must return 0: this script never writes anything but 'scheduled'
--   select count(*) from sessions
--    where recurrence_id::text like 'dddddddd-dddd-4ddd-8ddd-%'
--      and status <> 'scheduled';
-- ============================================================================
