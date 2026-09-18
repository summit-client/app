-- ============================================================================
-- 0085 · Give a session a pointer to its session type, not a copy of its name
--
-- WHAT IS WRONG TODAY
--
-- `sessions.type` is text holding a copy of `session_types.name`. Migration
-- 0000's comment on the column says so, 0045's header calls it "a
-- denormalized copy", and 0078 names it as the reason a constraint it wanted
-- was not worth writing. Nothing points at the session type row; the name is
-- re-matched every time it is needed, in the app and in the database alike.
--
-- Rename a session type in the scheduler's admin modal - `session_types_admin_update`
-- permits it - and every session already booked under the old name detaches
-- from the catalogue. Silently, because every one of these lookups is a LEFT
-- join or a `.find()` with a fallback:
--
--   * 0045's `sessions_no_overlap` trigger reads the duration by
--     `(clinic_id, name)`, misses, and falls back to `coalesce(v_duration, 60)`
--     - so the double-booking check starts measuring a 90-minute session as a
--     60-minute one and stops catching real overlaps. This is the one that
--     costs something: a clash that should have been refused gets written.
--   * 0029's `time_entry_economics` view joins `st.name = s.type` for the
--     billing rate. No match, no rate, the session bills at zero.
--   * 0031's `session_delivery` derivation resolves the type through the same
--     name join and skips a session it cannot resolve.
--   * apps/scheduler's calendar colours fall to #888 and durations to 60,
--     through roughly a dozen `sessionTypes.find(t => t.name === s.type)`
--     call sites.
--
-- None of these raise. A rename looks like it worked.
--
-- WHAT THIS DOES, IN ONE LINE EACH
--
--   1. refuses to run if any clinic has two session types with the same name,
--      then makes that impossible;
--   2. adds `sessions.session_type_id`, a real foreign key;
--   3. backfills it from the name match being retired;
--   4. derives `sessions.type` FROM the pointer on every session write;
--   5. propagates a rename to the sessions that carry the renamed type;
--   6. teaches 0045's overlap trigger to read the duration through the
--      pointer, and to skip re-checking a write that cannot have changed the
--      answer;
--   7. republishes `sessions_visible()` carrying the new column.
--
-- Steps 4 and 5 together are what let 0029 and 0031 keep working untouched:
-- `sessions.type` stays in agreement with the catalogue in both directions,
-- so a join on the name still resolves. They should move onto the key
-- eventually; neither is rewritten here, because replacing a revenue view and
-- a 200-line derivation function is a bigger diff than this fix needs and
-- 0029's join carries a separate oddity of its own (it matches
-- `st.clinic_id = e.clinic_id`, the TIME ENTRY's clinic, not the session's)
-- that wants looking at on its own terms rather than inside this change.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * It does not drop `sessions.type`. Dropping it is a separate migration,
--     worth taking only once a release has shown the backfill left nothing
--     behind - and step 3's report is what measures that.
--   * It does not touch `clients.session_type` (the waitlist's "what service
--     does this child need"). Same shape of problem, different table, smaller
--     stakes: no trigger, no billing and no conflict check reads it.
--   * It does not touch `staff.specialties`. That looks like the same bug and
--     is not - apps/scheduler/pages/admin.tsx records that specialties were
--     dropped from staff-matching entirely because the two vocabularies never
--     agreed ("Direct Therapy" the session type vs "DTT" the specialty). They
--     are descriptive tags from a fixed list now, not an identifier.
--
-- THE BEHAVIOUR CHANGES, STATED RATHER THAN ABSORBED
--
--   * The foreign key is `on delete set null`, NOT the default `restrict`.
--     `restrict` is the stricter choice and would be a real change: today an
--     admin can delete a session type that booked sessions still name, and
--     those sessions keep the orphaned text. `set null` reproduces exactly
--     that - pointer clears, `type` keeps the orphaned name, nothing is
--     refused. Whether a session type in use should be deletable at all is a
--     product decision, not this file's.
--   * Step 4 adds one new refusal: a session may not point at ANOTHER
--     clinic's session type. That is a cross-tenant write, which 0016's
--     trigger already refuses on this same table for clients, staff and
--     calendars; without it the sync would quietly stamp another clinic's
--     name onto the row.
--   * Step 6 makes the overlap check skip an UPDATE that changes nothing it
--     depends on. That is a narrowing of when it runs, so it is written
--     conservatively: it skips only when the clinician, the date, the time,
--     the status, the clinic AND the duration source are all unchanged. Any
--     doubt and it runs.
--
-- NOT APPLIED by the session that wrote it - the Supabase MCP available here
-- is read-only, and this repo's rule is that a human runs migrations.
-- Verification queries are at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Refuse to guess.
--
--    Two session types with the same name in one clinic make the backfill
--    below ambiguous, and nothing stops that today - `session_types` has no
--    unique constraint beyond its primary key. 0045's trigger already
--    resolves the ambiguity with a bare `limit 1`, i.e. arbitrarily, so if
--    this raises it has also been picking a duration at random for those
--    sessions. Deduplicate by hand, decide which row the affected sessions
--    belong to, then re-run this file.
-- ---------------------------------------------------------------------------
do $$
declare v_dupes text;
begin
  select string_agg(format('clinic %s: %L x%s', clinic_id, name, n), '; ')
    into v_dupes
    from (
      select clinic_id, name, count(*) as n
        from public.session_types
       group by clinic_id, name
      having count(*) > 1
    ) d;

  if v_dupes is not null then
    raise exception
      'session_types has duplicate (clinic_id, name) rows, so sessions.type cannot be resolved unambiguously: %',
      v_dupes;
  end if;
end $$;

create unique index if not exists session_types_clinic_name_uniq
  on public.session_types (clinic_id, name);

comment on index public.session_types_clinic_name_uniq is
  'A session type name identifies a row within its clinic. Required by 0085''s '
  'backfill, and by 0029/0031, which still resolve a session''s type by name '
  'and whose match was ambiguous without it.';

-- ---------------------------------------------------------------------------
-- 2. The column.
--
--    Nullable, and it stays nullable. A session written before this migration
--    whose `type` matches no catalogue row cannot be resolved (step 3 reports
--    how many), and a write that names a type the clinic does not have is
--    allowed today. Neither becomes an error here; both carry a null pointer
--    and the text they always had, which is what every app fallback handles.
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists session_type_id bigint
  references public.session_types(id) on delete set null;

create index if not exists sessions_session_type_id_idx
  on public.sessions (session_type_id);

comment on column public.sessions.session_type_id is
  'The session type this session IS. `sessions.type` is that row''s name, kept '
  'in agreement in both directions by sessions_apply_session_type (write side) '
  'and session_types_propagate_rename (rename side), and retained for display '
  'and for 0029/0031, which still join on it. Null means the type could not be '
  'resolved - a pre-0085 row whose name matched nothing, or a type deleted '
  'since; read `type` in that case, exactly as before 0085.';

-- ---------------------------------------------------------------------------
-- 3. Backfill, through the same (clinic_id, name) match being retired.
--
--    With user triggers off for the duration, and that needs justifying
--    rather than assuming: this UPDATE touches every session row in the
--    database, and `sessions` carries two BEFORE triggers that would each run
--    per row. Neither can have anything to say about this write -
--    `sessions_clinic_consistency` (0016) re-validates client/staff/calendar
--    clinics that this statement does not touch, and `sessions_no_overlap`
--    (0045) re-runs a conflict scan whose answer cannot change, because the
--    pointer being written resolves to the row whose name is already in
--    `type`. What they CAN do is fail: either check may raise on historical
--    data that predates it, which would abort a migration that changed
--    nothing meaningful. Disabled explicitly, re-enabled immediately, inside
--    the same transaction - so a failure anywhere leaves the triggers on.
-- ---------------------------------------------------------------------------
alter table public.sessions disable trigger user;

update public.sessions s
   set session_type_id = st.id
  from public.session_types st
 where st.clinic_id = s.clinic_id
   and st.name = s.type
   and s.session_type_id is null;

alter table public.sessions enable trigger user;

do $$
declare
  v_total     bigint;
  v_resolved  bigint;
  v_null_type bigint;
  v_unmatched bigint;
begin
  select count(*),
         count(session_type_id),
         count(*) filter (where type is null)
    into v_total, v_resolved, v_null_type
    from public.sessions;

  v_unmatched := v_total - v_resolved - v_null_type;

  raise notice '0085 backfill: % sessions, % resolved, % with no type at all, % naming a type their clinic does not have',
    v_total, v_resolved, v_null_type, v_unmatched;

  if v_unmatched > 0 then
    raise notice '0085: those % rows keep their `type` text and a null pointer - verification query 2 at the end of this file lists them', v_unmatched;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Write side: derive `type` from the pointer.
--
--    The id is the identity from here on, so `type` is written from it
--    whenever it is set. Two consequences worth being explicit about:
--
--      * a caller that sets session_type_id and leaves `type` alone gets the
--        right name written for it, which is what lets the app's call sites
--        move over one at a time rather than all at once;
--      * a caller that sets BOTH and disagrees loses the argument - the id
--        wins. That is the point: a stale client must not be able to
--        re-introduce a name the catalogue has moved on from.
--
--    A write that sets no session_type_id is left exactly as it arrives, so
--    every existing write path keeps working unchanged.
--
--    Named `sessions_apply_...` so it sorts before `sessions_clinic_consistency`
--    (0016) and `sessions_no_overlap` (0045): Postgres fires same-event BEFORE
--    triggers in name order, so both of those see the corrected `type`.
--
--    Plain plpgsql, not `security definer`, matching 0016's and 0045's trigger
--    functions on this table. The lookup runs under the caller's own RLS, and
--    `session_types_read` (0078) plus `session_types_clinical_staff_select`
--    (0046) make a clinic's own types readable to every role that can write a
--    session, so a legitimate write always resolves. A caller naming a type
--    they cannot see gets the clinic exception below - the correct failure -
--    rather than a silent mismatch.
-- ---------------------------------------------------------------------------
create or replace function public.apply_session_type_name() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_name text;
declare v_clinic uuid;
begin
  if new.session_type_id is null then
    return new;
  end if;

  select st.name, st.clinic_id into v_name, v_clinic
    from public.session_types st
   where st.id = new.session_type_id;

  if v_name is null then
    -- Unreachable through the foreign key; reachable if this function is ever
    -- called outside it. Fail loudly rather than blanking `type`.
    raise exception 'session_type_id % does not exist', new.session_type_id;
  end if;

  if v_clinic is distinct from new.clinic_id then
    raise exception 'session clinic_id (%) does not match its session type''s clinic (%)',
      new.clinic_id, v_clinic;
  end if;

  new.type := v_name;
  return new;
end $$;

comment on function public.apply_session_type_name() is
  'Derives sessions.type from sessions.session_type_id so a stale client '
  'cannot write a name the catalogue has moved on from (0085). Leaves a row '
  'with no session_type_id exactly as written.';

drop trigger if exists sessions_apply_session_type on public.sessions;
create trigger sessions_apply_session_type before insert or update on public.sessions
  for each row execute function public.apply_session_type_name();

-- ---------------------------------------------------------------------------
-- 5. Rename side: carry a new name to the sessions that hold the old one.
--
--    Step 4 alone does not fix the defect this migration is about. It fires
--    on writes to `sessions`, and a rename is a write to `session_types` - so
--    without this, every already-booked session would keep the old text until
--    something happened to touch it, which is the detachment described at the
--    top, just with a pointer added.
--
--    This is the half that keeps `sessions.type` a TRUE copy rather than a
--    historical one, which is what lets 0029's view, 0031's derivation and
--    every screen that only displays `session.type` (apps/client,
--    apps/data, both ICS feeds) go on reading the name and be right.
--
--    Cost, stated: renaming a type rewrites every session that carries it.
--    Step 6's early return is what keeps that from re-running a conflict scan
--    per row; 0016's clinic check does still run per row, which is three
--    lookups against rows this statement does not change. A rename is a rare
--    administrative act on a table with a handful of rows per clinic, so this
--    is accepted rather than optimised - but it is the reason the trigger is
--    `when (old.name is distinct from new.name)` and not a bare AFTER UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.propagate_session_type_rename() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.sessions s
     set type = new.name
   where s.session_type_id = new.id
     and s.type is distinct from new.name;
  return null;
end $$;

comment on function public.propagate_session_type_rename() is
  'Keeps sessions.type in agreement with session_types.name after a rename '
  '(0085). Without it a rename detaches every session booked under the old '
  'name from 0029''s billing join, 0031''s derivation and every screen that '
  'displays the name.';

drop trigger if exists session_types_propagate_rename on public.session_types;
create trigger session_types_propagate_rename after update on public.session_types
  for each row when (old.name is distinct from new.name)
  execute function public.propagate_session_type_rename();

-- ---------------------------------------------------------------------------
-- 6. 0045's overlap trigger, reading the duration through the pointer.
--
--    Two changes to the function, and nothing else about 0045 moves - the
--    partial unique index (layer 1), the trigger's timing and the exception
--    it raises are all as they were.
--
--    (a) The duration lookup prefers `session_type_id` and falls back to the
--        name, for both the incoming row and each candidate it scans. This is
--        the defect at the top of this file: a renamed type made this lookup
--        miss and the check silently measured every affected session as 60
--        minutes.
--
--    (b) An UPDATE that cannot have changed the answer returns before
--        scanning. Written conservatively - it skips only when the clinician,
--        the date, the hour, the minute, the status, the clinic AND the
--        duration source are ALL unchanged. Anything else, including any
--        INSERT, runs the full check. Step 5's rename propagation is the
--        write this exists for: it changes `type` on rows whose pointer,
--        clinician and time are untouched, so re-running a conflict scan per
--        row would be pure cost - and, on data that predates 0045, a way for
--        an unrelated rename to fail.
--
--    `coalesce(st.duration, 60)` is kept exactly as 0045 had it, matching the
--    app's own `?? 60` fallback for a type that resolves to nothing.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_sessions_no_overlap() returns trigger
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
  -- (b) Nothing this check depends on has moved.
  --
  -- Nested rather than one `tg_op = 'UPDATE' and old.x ...` condition: during
  -- an INSERT, OLD is unassigned in plpgsql and reading a field off it raises
  -- outright. SQL's AND is not required to short-circuit, so the tg_op test
  -- has to be a statement of its own rather than the first conjunct.
  if tg_op = 'UPDATE' then
    if new.employee_id     is not distinct from old.employee_id
       and new.session_date is not distinct from old.session_date
       and new.hour         is not distinct from old.hour
       and new.minute       is not distinct from old.minute
       and new.status       is not distinct from old.status
       and new.clinic_id    is not distinct from old.clinic_id
       and new.session_type_id is not distinct from old.session_type_id
       -- Only consult the name when there is no pointer: with one, the name
       -- is derived from it and cannot change the duration.
       and (new.session_type_id is not null
            or new.type is not distinct from old.type)
    then
      return new;
    end if;
  end if;

  -- A cancelled session never occupies a slot (matches the partial unique
  -- index above and every existing app-side check, which all filter on
  -- `status <> 'cancelled'`). employee_id is nullable on this table (an
  -- unassigned session) - nothing to overlap with until it's assigned.
  if new.status = 'cancelled' or new.employee_id is null then
    return new;
  end if;

  -- (a) Pointer first, name second.
  select st.duration into v_duration
    from session_types st
    where (new.session_type_id is not null and st.id = new.session_type_id)
       or (new.session_type_id is null
           and st.clinic_id = new.clinic_id and st.name = new.type)
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
  left join session_types st
    on (s.session_type_id is not null and st.id = s.session_type_id)
    or (s.session_type_id is null
        and st.clinic_id = s.clinic_id and st.name = s.type)
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

-- ---------------------------------------------------------------------------
-- 7. Republish sessions_visible() with the new column.
--
--    0077 returns a named composite type listing its columns explicitly, "so
--    that a column added to `sessions` later is not published until someone
--    decides it should be". Decided: publish it. A session type id is the
--    same disclosure `type` already is - which service, not which child - and
--    the scheduler's calendar reads every session through this function, so
--    without it the app cannot use the new key at all.
--
--    `drop type ... cascade` drops the function with it, which is why this
--    whole file is one transaction: a half-applied run would leave the
--    scheduler's calendar reading nothing.
--
--    The body below is 0077's, unchanged but for the added column. In
--    particular `created_at` is still absent, for the reason 0077 records:
--    the live table does not have it, whatever 0000 declares.
-- ---------------------------------------------------------------------------
drop function if exists public.sessions_visible(date, date);
drop type if exists public.visible_session cascade;

create type public.visible_session as (
  id              bigint,
  client_id       bigint,
  employee_id     bigint,
  calendar_id     bigint,
  session_date    date,
  hour            integer,
  minute          integer,
  type            text,
  session_type_id bigint,
  status          text,
  recurrence_id   uuid,
  clinic_id       uuid,
  location_id     bigint,
  is_home_visit   boolean,
  home_address    text,
  client_masked   boolean
);

comment on type public.visible_session is
  'The row shape public.sessions_visible() returns: the columns of `sessions` '
  'this boundary publishes, plus client_masked. Listed explicitly rather than '
  'inherited from the table so that a column added to `sessions` later is not '
  'published until someone decides it should be. Deliberately excludes '
  'created_at - see 0077. session_type_id added by 0085: the same disclosure '
  '`type` already is, and the key callers should now join on.';

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
  -- - see 0077's header on why revealing these is not a disclosure.
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
    s.session_type_id,
    s.status,
    s.recurrence_id,
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
  'Clinic-scoped session read with the client association masked for a '
  'clinician who may not make it (0077). Republished by 0085 to carry '
  'session_type_id.';

revoke all on function public.sessions_visible(date, date) from public;
grant execute on function public.sessions_visible(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICATION - run these after the file above. They change nothing except
-- query 6, which rolls itself back.
-- ============================================================================
--
-- 1. How the backfill landed. `unmatched` is the number that matters: those
--    sessions name a type their clinic does not have, and they are exactly
--    the rows that would be lost if `sessions.type` were dropped today.
--
-- select count(*) as total,
--        count(session_type_id) as resolved,
--        count(*) filter (where type is null) as no_type_at_all,
--        count(*) filter (where type is not null and session_type_id is null) as unmatched
--   from public.sessions;
--
-- 2. Name the unmatched ones. Expect either nothing, or a short list of
--    retired type names - each one a rename that already happened and already
--    detached these sessions.
--
-- select s.clinic_id, s.type, count(*) as sessions,
--        min(s.session_date) as earliest, max(s.session_date) as latest
--   from public.sessions s
--  where s.type is not null and s.session_type_id is null
--  group by s.clinic_id, s.type
--  order by sessions desc;
--
-- 3. Pointer and name agree wherever the pointer is set. Expect 0.
--
-- select count(*) as disagreements
--   from public.sessions s
--   join public.session_types st on st.id = s.session_type_id
--  where st.name is distinct from s.type;
--
-- 4. No session points across clinics. Expect 0.
--
-- select count(*) as cross_clinic
--   from public.sessions s
--   join public.session_types st on st.id = s.session_type_id
--  where st.clinic_id is distinct from s.clinic_id;
--
-- 5. The function still returns rows and now carries the column. Run as
--    yourself; expect your clinic's sessions with session_type_id populated.
--
-- select id, session_date, type, session_type_id, client_masked
--   from public.sessions_visible(current_date - 30, current_date + 30)
--  order by session_date desc
--  limit 20;
--
-- 6. The rename this migration exists to survive. Rolls itself back, so it is
--    safe to run as-is - but read the counts before the rollback.
--
-- begin;
--   select id, name, duration from public.session_types
--    where id = (select session_type_id from public.sessions
--                 where session_type_id is not null limit 1);
--   update public.session_types set name = name || ' (renamed)'
--    where id = (select session_type_id from public.sessions
--                 where session_type_id is not null limit 1);
--   -- Both of these should be IDENTICAL and non-zero. Before 0085 the second
--   -- would have dropped to zero for the renamed type: that is the bug.
--   select count(*) as by_pointer from public.sessions s
--    where s.session_type_id is not null;
--   select count(*) as still_resolving_by_name from public.sessions s
--     join public.session_types st
--       on st.clinic_id = s.clinic_id and st.name = s.type
--    where s.session_type_id is not null;
-- rollback;
-- ============================================================================
