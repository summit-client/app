-- 0050 · Who actually works with this child
--
-- The appointments page has always rendered a clinician name beside each
-- session. A family cannot read `staff` — there is no policy admitting them —
-- so that nested select has been returning null the whole time, and the field
-- has never shown anybody a name. Found by reading the table as a guardian.
--
-- WHY A FUNCTION AND NOT A POLICY
--
-- The obvious fix is a family-read policy on `staff` scoped to people who have
-- sessions with their child. It works, and it hands the family every column of
-- those rows: `capacity` (how many sessions the matcher will give this person),
-- `specialties`, `location_id`. RLS is row-level; it cannot return a name
-- without also returning the operational fields beside it.
--
-- So this is a `security definer` function that selects three columns. It is
-- also the only shape that survives 0046's sweep, which forces
-- security_invoker on every view and would undo a definer view.
--
-- WHY IT IS DERIVED FROM SESSIONS
--
-- There is no clinician-to-client assignment anywhere in this schema — 0014's
-- header established that, and every clinical table since has granted
-- clinic-wide staff access rather than inventing one. So "care team" cannot be
-- looked up; it can only be observed. Who has actually delivered sessions for
-- this child, and who is scheduled to, is a true answer to the question a
-- family is really asking. A fabricated assignment table would be a more
-- confident answer to a question this schema cannot yet answer at all.

create or replace function public.my_care_team()
returns table (
  client_id bigint,
  staff_id bigint,
  staff_name text,
  staff_role text,
  sessions_delivered integer,
  last_seen_on date,
  next_on date
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    s.client_id,
    st.id,
    st.name,
    -- A free-text job title, not a permission. Null where the clinic has not
    -- set one, which the portal renders as nothing rather than as "Unknown".
    st.role,
    count(*) filter (where s.status = 'completed')::integer,
    max(s.session_date) filter (where s.session_date <= current_date),
    min(s.session_date) filter (
      where s.session_date >= current_date and s.status = 'scheduled')
  from public.sessions s
  join public.staff st on st.id = s.employee_id
  where s.client_id in (select public.auth_accessible_client_ids())
    -- The same permission that governs seeing the appointments these are
    -- derived from. A guardian who may not see the calendar should not learn
    -- the clinician's name from a different page.
    and public.auth_guardian_can(s.client_id, 'view_appointments')
    -- A cancelled session says nothing about who works with this child.
    and s.status <> 'cancelled'
  group by s.client_id, st.id, st.name, st.role
$$;

comment on function public.my_care_team() is
  'The people who have actually delivered or are scheduled to deliver this '
  'family''s sessions, with name and job title only. A security definer '
  'function rather than a policy on `staff`, because RLS is row-level and a '
  'policy would hand the family capacity, specialties and location alongside '
  'the name. Derived from sessions because this schema has no '
  'clinician-to-client assignment to look up.';
