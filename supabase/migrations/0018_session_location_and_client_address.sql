-- ============================================================================
-- Real per-session location for the scheduler calendar rebuild.
--
-- `sessions` has never had a location of its own - the calendar tab's hover
-- tooltip currently derives it from the assigned staff member's location_id,
-- while the booking detail panel derives it from the CLIENT's location_id
-- instead (two different, sometimes-disagreeing paths for the same concept,
-- confirmed by reading both call sites). This gives every session an
-- explicit, authoritative location: defaults to the assigned clinician's own
-- location at booking time, editable per session, with a distinct
-- "at the client's home" case rather than forcing a home visit to pretend to
-- be one of the clinic's physical `locations` rows.
--
-- `clients.address` is the fuller build decided for the home-visit case: a
-- real address on the client record (same shape as `locations.address` -
-- one free-text field, not structured street/city/etc.), auto-filled into
-- `sessions.home_address` when a session is marked as a home visit, still
-- editable per session for a one-off (a relative's house, a temporary
-- location) without touching the client's stored address.
-- ============================================================================

alter table sessions add column if not exists location_id bigint references locations(id);
alter table sessions add column if not exists is_home_visit boolean not null default false;
alter table sessions add column if not exists home_address text;

alter table clients add column if not exists address text;

-- Backfill existing sessions from the assigned clinician's location, so
-- nothing regresses to "no location shown" the moment this ships - matches
-- what the calendar tooltip already showed for these rows before this
-- migration (the staff-derived path), so the visible result doesn't change
-- for existing data.
update sessions s set location_id = st.location_id
  from staff st where s.employee_id = st.id and s.location_id is null;

-- The scheduler calendar rebuild queries sessions by clinic + real date
-- range (replacing an unfiltered `select *` that loaded every session ever
-- booked into the browser on every load) - this is the index that query
-- pattern needs.
create index if not exists sessions_clinic_date_idx on sessions(clinic_id, session_date);

-- No RLS policy changes: sessions' existing per-command policies (migration
-- 0013: admin/scheduler read+write; migration 0014: clinician/supervisor
-- read) are row-level, not column-level, and already cover the new columns.
-- clients' existing policies are equally unaffected by adding a column.
