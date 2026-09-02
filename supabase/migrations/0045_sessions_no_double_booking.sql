-- 0045 · Close the double-booking race on `sessions` at the database level
--
-- BLOCKED-scheduler.md item 1: nothing in `sessions` prevented two rows from
-- sharing the same employee_id + session_date + hour + minute (an exact
-- double-book), or from overlapping once a session type's duration is taken
-- into account (e.g. a 60-minute 9:00 session and a 9:15 session for the
-- same clinician). A prior pass added `lib/checkSlotConflict.ts` - a fresh
-- pre-write re-check immediately before every insert/update in this app's
-- five create/move paths - which shrinks the staleness window from "since
-- the page loaded" to "since this one request," but it is a read-then-write
-- check from the application, not a constraint: two writes issued within the
-- same round trip can still both pass it and both succeed. This migration is
-- what actually closes the race, the same way migration 0016 closed the
-- cross-clinic reference gap on this same table - a real constraint the
-- database enforces regardless of what already ran in application code.
--
-- Two layers, per BLOCKED-scheduler.md's own analysis:
--
--  1. A partial unique index for the exact-slot case (two requests hitting
--     the literal same grid cell for the same clinician) - cheap, and by
--     itself already covers the overwhelmingly common case.
--
--  2. A BEFORE INSERT OR UPDATE trigger for the overlapping-but-not-identical
--     case a unique index can't express: a session type's `duration`
--     (session_types.duration, minutes) longer than the grid increment means
--     two rows with different hour/minute for the same clinician can still
--     overlap in time. `sessions.type` is a denormalized copy of
--     `session_types.name` (see migration 0000's own comment on that
--     column and 0029's `left join session_types st on st.name = s.type and
--     st.clinic_id = e.clinic_id` for the established pattern this mirrors),
--     so duration is looked up by (clinic_id, name) rather than a foreign
--     key. An exclusion constraint over a computed tsrange (btree_gist)
--     would be the more declarative way to express layer 2, but a trigger
--     was chosen instead to match 0016's actual style on this exact table,
--     per BLOCKED-scheduler.md's own suggestion to mirror it rather than
--     introduce a new extension for one constraint.
--
-- Trigger function is plain plpgsql - NOT `security definer` - matching
-- 0016's four trigger functions on this table exactly (checked: none of
-- 0016's functions carry `security definer`). That's the right choice here
-- for the same reason 0016 gives: the overlap lookup below runs under the
-- CALLER's own RLS, so if the caller can't even see a conflicting row (wrong
-- clinic), the lookup simply won't find it - "can't see it" and "verified no
-- conflict" both correctly allow the write, and a real cross-clinic
-- collision can't occur in the first place because 0016's own trigger
-- already refuses a session whose clinic_id disagrees with its staff
-- member's clinic. `set search_path = public, pg_temp` (pg_temp last)
-- follows CLAUDE.md's hard constraint on schema-qualification even though
-- this function isn't security definer - cheap to do and removes any doubt.
--
-- Both layers raise an error class the application can recognize and turn
-- into the same friendly "scheduling conflict" message the existing
-- app-layer pre-check already shows, instead of a raw Postgres error
-- reaching the UI: the unique index raises the standard 23505
-- (unique_violation), and the trigger below deliberately raises with
-- errcode 23P01 (exclusion_violation) - not the default P0001 - so app code
-- can treat "23505 or 23P01 on a sessions write" as one case. See
-- apps/scheduler/lib/checkSlotConflict.ts's `isBookingConflictError` and its
-- call sites for the app-side half of this change.
--
-- NOT applied by this session - the Supabase MCP available here is
-- read-only. A human needs to run this migration against the live database.

-- ---------------------------------------------------------------------------
-- Layer 1 · exact-slot double-booking
-- ---------------------------------------------------------------------------
create unique index if not exists sessions_no_exact_double_book
  on sessions (employee_id, session_date, hour, minute)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Layer 2 · overlapping-but-not-identical slots, once duration is considered
-- ---------------------------------------------------------------------------
create or replace function enforce_sessions_no_overlap() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_duration integer;
  v_new_start timestamp;
  v_new_end timestamp;
  v_hit_id bigint;
  v_hit_date date;
  v_hit_hour integer;
  v_hit_minute integer;
begin
  -- A cancelled session never occupies a slot (matches the partial unique
  -- index above and every existing app-side check, which all filter on
  -- `status <> 'cancelled'`). employee_id is nullable on this table (an
  -- unassigned session) - nothing to overlap with until it's assigned.
  if new.status = 'cancelled' or new.employee_id is null then
    return new;
  end if;

  select st.duration into v_duration
    from session_types st
    where st.clinic_id = new.clinic_id and st.name = new.type
    limit 1;
  -- Same fallback the app uses when a type lookup misses
  -- (`quickType.duration_minutes ?? quickType.duration ?? 60` throughout
  -- apps/scheduler) - most commonly hit when `new.type` is null or doesn't
  -- match any of this clinic's configured session_types.
  v_duration := coalesce(v_duration, 60);

  v_new_start := new.session_date + make_time(new.hour, new.minute, 0);
  v_new_end := v_new_start + make_interval(mins => v_duration);

  -- `session_date between new.session_date - 1 and new.session_date + 1` is
  -- an index-friendly pre-filter, not the actual overlap test - it just
  -- bounds the candidate set to the (at most) one day either side that a
  -- realistic session duration could ever spill into, since a session's
  -- start and end are computed as full timestamps below and compared with a
  -- real tsrange overlap, not by comparing session_date alone.
  select s.id, s.session_date, s.hour, s.minute
    into v_hit_id, v_hit_date, v_hit_hour, v_hit_minute
  from sessions s
  left join session_types st on st.clinic_id = s.clinic_id and st.name = s.type
  where s.employee_id = new.employee_id
    and s.status <> 'cancelled'
    and s.id is distinct from new.id
    and s.session_date between new.session_date - 1 and new.session_date + 1
    and tsrange(
          s.session_date + make_time(s.hour, s.minute, 0),
          s.session_date + make_time(s.hour, s.minute, 0) + make_interval(mins => coalesce(st.duration, 60)),
          '[)'
        ) && tsrange(v_new_start, v_new_end, '[)')
  limit 1;

  if v_hit_id is not null then
    raise exception 'clinician % already has an overlapping session on % at %:% (session id %)',
      new.employee_id, v_hit_date, v_hit_hour, lpad(v_hit_minute::text, 2, '0'), v_hit_id
      using errcode = 'exclusion_violation';
  end if;

  return new;
end $$;

drop trigger if exists sessions_no_overlap on sessions;
create trigger sessions_no_overlap before insert or update on sessions
  for each row execute function enforce_sessions_no_overlap();
