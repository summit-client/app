-- 0030 · Delivered session -> time entry -> budget charge
--
-- THE GAP THIS CLOSES
--
-- After 0022 through 0028 the platform can hold budgets, time and rates, and
-- can derive hours, overtime, revenue and cost from them. Nothing writes the
-- atoms. `time_entries` and `budget_entries` have no producer, so every view
-- built on them returns an empty set forever, and the family dashboard shows a
-- budget that is never spent no matter how much work is delivered.
--
-- This is the producer. One session marked delivered becomes:
--
--   a time entry     the clinician's hours, with the activity derived from the
--                    session type rather than chosen
--   a budget charge  where the activity is billable and the client holds an
--                    open budget, at the rate resolved for that day
--   two events       so the timeline can show what the schedule caused
--
-- All three from one fact, which is the point. The alternative is a clinician
-- entering their hours, an administrator entering the charge, and the two
-- disagreeing by the end of the month with no way to tell which is right.
--
-- IDEMPOTENT, BECAUSE IT WILL BE CALLED TWICE
--
-- A session can be marked delivered, corrected, and marked delivered again. A
-- backfill can run over sessions that already have entries. Both are normal.
-- Calling this twice for one session produces one time entry and one charge:
-- the unique indexes below are what guarantee it, not the function's own
-- carefulness, because a guarantee that depends on remembering to check is not
-- one.
--
-- WHAT IT REFUSES TO GUESS
--
-- If the session's staff member has no employment record linked to their
-- scheduler row, there is nobody to attribute the hours to. It says so and
-- writes nothing. That is the staff_id/user_id gap 0025 describes, and the
-- correct behaviour here is to surface it, not to pick a plausible employee.
--
-- If no billing rate resolves for the day, the charge is not written at a
-- guessed rate and not written at zero. A zero charge is worse than a missing
-- one: it reconciles, and it is wrong.

-- ---------------------------------------------------------------------------
-- Two corrections that writing the producer exposed
--
-- 1. budget_entries.session_id pointed at the WRONG TABLE.
--
-- 0022 declared it `references client_sessions(id)`. client_sessions is the
-- clinical workspace record — the thing a clinician opens to run a session and
-- record observations. `sessions` is the scheduler's booking: it is what has a
-- date, a type, a duration and a delivered status, and it is the billable
-- unit. time_entries.session_id in 0027 already points at `sessions`, so as
-- shipped the two halves of one derivation referenced two different tables and
-- no single session could satisfy both.
--
-- Corrected here rather than by editing 0022, because 0022 has been pushed and
-- may already have been applied somewhere.
--
-- 2. client_sessions and sessions are not linked to each other AT ALL.
--
-- The same class of gap as staff/profiles that 0025 closed, and it was
-- invisible until something tried to use both. A clinician runs a session in
-- the workspace and nothing records which booking it was. So:
--
--   the schedule knows an appointment happened
--   the clinical record knows what was done in it
--   nothing knows they are the same event
--
-- Which means a delivered-but-undocumented session cannot be distinguished
-- from a documented one, and a statement line cannot be traced from a charge
-- to the clinical evidence behind it. The column below closes that.
--
-- It is nullable and unenforced going backwards: existing client_sessions rows
-- have no booking to point at and guessing which one would be inventing a
-- clinical record's provenance. New sessions started from a booking should set
-- it; the rest stay null and are visibly unlinked rather than wrongly linked.
-- ---------------------------------------------------------------------------
alter table budget_entries drop constraint if exists budget_entries_session_id_fkey;
alter table budget_entries
  add constraint budget_entries_session_id_fkey
  foreign key (session_id) references sessions(id) on delete set null;

alter table client_sessions
  add column if not exists scheduled_session_id bigint references sessions(id) on delete set null;
create index if not exists client_sessions_scheduled_idx
  on client_sessions(scheduled_session_id) where scheduled_session_id is not null;

comment on column client_sessions.scheduled_session_id is
  'The scheduler booking this clinical session was run against. Null for sessions '
  'started without a booking, and for every row predating migration 0030.';

-- One charge per session, the same way there is one time entry per session.
create unique index if not exists budget_entries_one_per_session
  on budget_entries(session_id) where session_id is not null;

-- ---------------------------------------------------------------------------
-- The result type, so a caller learns what happened rather than guessing from
-- whether an exception was raised.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_delivery_result') then
    create type session_delivery_result as (
      time_entry_id uuid,
      budget_entry_id uuid,
      minutes integer,
      charged numeric,
      skipped_reason text
    );
  end if;
end $$;

create or replace function public.record_session_delivery(p_session bigint)
returns session_delivery_result
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s              record;
  employment     uuid;
  activity       record;
  duration_min   integer;
  rate           numeric;
  budget         record;
  out_result     session_delivery_result;
  new_time       uuid;
  new_charge     uuid;
  correlation    uuid := gen_random_uuid();
begin
  out_result := (null, null, null, null, null)::session_delivery_result;

  select ses.id, ses.clinic_id, ses.client_id, ses.employee_id, ses.session_date,
         ses.type, ses.status, st.id as session_type_id, st.duration
    into s
    from public.sessions ses
    left join public.session_types st
      on st.name = ses.type and st.clinic_id = ses.clinic_id
   where ses.id = p_session;

  if s.id is null then
    out_result.skipped_reason := 'no such session';
    return out_result;
  end if;
  if s.status is distinct from 'completed' then
    out_result.skipped_reason := format('session is %s, not completed', coalesce(s.status, 'unset'));
    return out_result;
  end if;

  -- Who worked it. The staff_id -> employment link is the one thing this
  -- cannot invent; see 0025.
  select r.id into employment
    from public.employment_records r
   where r.staff_id = s.employee_id
     and r.clinic_id = s.clinic_id
     and r.start_date <= s.session_date
     and (r.end_date is null or r.end_date >= s.session_date);

  if employment is null then
    out_result.skipped_reason :=
      'the staff member on this session has no employment record for that date';
    return out_result;
  end if;

  -- What was done. Mapped from the session type where the clinic has said so,
  -- and otherwise the platform's direct-service default, which is the honest
  -- assumption for a delivered session.
  select a.* into activity
    from public.session_type_activity_map m
    join public.activity_codes a on a.id = m.activity_code_id
   where m.clinic_id = s.clinic_id and m.session_type_id = s.session_type_id;

  if activity.id is null then
    select * into activity from public.activity_codes
     where code = 'DIRECT' and clinic_id is null;
  end if;
  if activity.id is null then
    out_result.skipped_reason := 'no activity code to attribute this session to';
    return out_result;
  end if;

  duration_min := coalesce(s.duration, 60);
  out_result.minutes := duration_min;

  -- The time entry. On conflict do nothing, so a second call is a no-op rather
  -- than a duplicate or an error.
  insert into public.time_entries
    (clinic_id, employment_id, work_date, work_week_start, activity_code_id,
     minutes, client_id, session_id, source, note)
  values
    (s.clinic_id, employment, s.session_date, s.session_date, activity.id,
     duration_min,
     case when activity.requires_client then s.client_id else null end,
     s.id, 'session', format('Derived from %s on %s', coalesce(s.type, 'session'), s.session_date))
  on conflict (session_id) where session_id is not null do nothing
  returning id into new_time;

  if new_time is null then
    select id into new_time from public.time_entries where session_id = s.id;
  end if;
  out_result.time_entry_id := new_time;

  -- The charge, only where the work is billable.
  if not activity.billable then
    out_result.skipped_reason := 'activity is not billable; time recorded, no charge';
    return out_result;
  end if;

  select b.* into budget
    from public.client_budgets b
   where b.client_id = s.client_id
     and b.clinic_id = s.clinic_id
     and b.status = 'ACTIVE'
     and b.period_start <= s.session_date
     and (b.period_end is null or b.period_end >= s.session_date)
   order by b.period_start desc
   limit 1;

  if budget.id is null then
    out_result.skipped_reason := 'no open budget for this client on that date; time recorded, no charge';
    return out_result;
  end if;

  rate := public.billing_rate_for(
    s.clinic_id, activity.id, s.session_type_id, budget.funding_source, s.session_date);

  if rate is null then
    out_result.skipped_reason :=
      'no billing rate is set for this service on that date; time recorded, no charge';
    return out_result;
  end if;

  insert into public.budget_entries
    (clinic_id, budget_id, entry_date, kind, description, session_id,
     service_type, quantity, unit_rate, amount)
  values
    (s.clinic_id, budget.id, s.session_date, 'CHARGE',
     coalesce(s.type, 'Session'), s.id,
     activity.label, round(duration_min / 60.0, 2), rate,
     round((duration_min / 60.0) * rate, 2))
  on conflict (session_id) where session_id is not null do nothing
  returning id, amount into new_charge, out_result.charged;

  if new_charge is null then
    select id, amount into new_charge, out_result.charged
      from public.budget_entries where session_id = s.id;
  end if;
  out_result.budget_entry_id := new_charge;

  -- The events. Written with source 'system' because the platform derived
  -- them; a person marked the session delivered, and everything after that was
  -- the platform's own inference.
  insert into public.organization_events
    (clinic_id, event_type, occurred_at, actor_id, subject_type, subject_id,
     payload, correlation_id, source)
  values
    (s.clinic_id, 'scheduling.session_delivered', s.session_date::timestamptz,
     auth.uid(), 'session', s.id::text,
     jsonb_build_object('minutes', duration_min, 'activity', activity.code),
     correlation, 'system'),
    (s.clinic_id, 'finance.budget_charged', s.session_date::timestamptz,
     auth.uid(), 'budget', budget.id::text,
     jsonb_build_object('amount', out_result.charged, 'session_id', s.id, 'rate', rate),
     correlation, 'system');

  return out_result;
end $$;

comment on function public.record_session_delivery(bigint) is
  'Turns one delivered session into a time entry and, where billable and funded, '
  'a budget charge. Idempotent. Returns skipped_reason rather than raising when '
  'it lacks something it refuses to guess at.';

-- ---------------------------------------------------------------------------
-- Backfill and catch-up
--
-- Deliberately a function to call rather than a trigger on sessions.
--
-- A trigger would fire inside the scheduler's own transaction, which means a
-- missing billing rate or an unlinked staff member would roll back the act of
-- marking a session delivered. Booking software that refuses to record what
-- happened because the finance configuration is incomplete is worse than
-- useless, and the clinician looking at it cannot fix the cause.
--
-- So derivation runs after the fact and reports what it could not do. The
-- unlinked-staff and missing-rate cases become a queue somebody works through,
-- not an error a clinician sees at the end of a session.
-- ---------------------------------------------------------------------------
create or replace function public.derive_pending_session_deliveries(
  p_clinic uuid, p_from date default null, p_to date default null
) returns table (session_id bigint, time_entry_id uuid, budget_entry_id uuid, skipped_reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
  r session_delivery_result;
begin
  for s in
    select ses.id from public.sessions ses
     where ses.clinic_id = p_clinic
       and ses.status = 'completed'
       and (p_from is null or ses.session_date >= p_from)
       and (p_to is null or ses.session_date <= p_to)
       and not exists (select 1 from public.time_entries t where t.session_id = ses.id)
     order by ses.session_date
  loop
    r := public.record_session_delivery(s.id);
    session_id := s.id;
    time_entry_id := r.time_entry_id;
    budget_entry_id := r.budget_entry_id;
    skipped_reason := r.skipped_reason;
    return next;
  end loop;
end $$;

-- What the catch-up queue looks like: delivered sessions with no time entry,
-- and why each one is stuck. This is the screen an administrator works from.
create or replace view underived_sessions as
select
  ses.id as session_id,
  ses.clinic_id,
  ses.session_date,
  ses.type,
  ses.client_id,
  ses.employee_id,
  case
    when not exists (
      select 1 from employment_records r
       where r.staff_id = ses.employee_id and r.clinic_id = ses.clinic_id
         and r.start_date <= ses.session_date
         and (r.end_date is null or r.end_date >= ses.session_date))
      then 'staff member is not linked to an employment record'
    when not exists (
      select 1 from client_budgets b
       where b.client_id = ses.client_id and b.status = 'ACTIVE'
         and b.period_start <= ses.session_date
         and (b.period_end is null or b.period_end >= ses.session_date))
      then 'client has no open budget for that date'
    else 'ready to derive'
  end as blocked_by
from sessions ses
where ses.status = 'completed'
  and not exists (select 1 from time_entries t where t.session_id = ses.id);
