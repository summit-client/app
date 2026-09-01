-- 0042 · What the family still has to do, derived rather than stored
--
-- The brief asks for a "For You" list: what needs the parent's attention. The
-- obvious implementation is a `reminders` table that something writes to.
--
-- This is not that, deliberately. A reminders table is a second copy of a fact
-- that already exists somewhere, and second copies go stale: the invoice gets
-- paid and the reminder stays, the appointment is cancelled and the reminder
-- stays, and within a month the family stops believing the list. Every row here
-- is computed from the entity it is about, so a task disappears the moment the
-- thing it describes is no longer true. Nothing marks a task complete, because
-- nothing can: completing the underlying thing is what removes it.
--
-- ONLY REAL SOURCES
--
-- Four, because four is what this schema can honestly support today:
--
--   an appointment that is still unconfirmed
--   funding that is nearly used up
--   a funding period about to end
--   a progress note a clinician has shared
--
-- Forms and consents are the obvious fifth and sixth. There are no forms or
-- consents tables in this schema, so they are absent rather than mocked. When
-- those land, they become two more branches of this union and the portal needs
-- no change.
--
-- PERMISSIONS
--
-- Each branch carries the permission it requires, and the view filters on it.
-- A guardian with scheduling access but not billing gets appointment tasks and
-- never learns from a task list that the family's funding is nearly gone.

create or replace view family_tasks as

-- 1. An upcoming session nobody has confirmed. The window is deliberately
--    short: a task about something three weeks away is noise, and the parent
--    can see it on the calendar anyway.
select
  'appointment:' || s.id::text                as task_id,
  s.client_id,
  'appointment'                               as kind,
  'Confirm appointment'                       as title,
  coalesce(s.type, 'Session') || ' on ' || to_char(s.session_date, 'FMDay FMDD FMMonth')
                                              as detail,
  s.session_date                              as due_on,
  case when s.session_date <= current_date + 2 then 'high' else 'normal' end as priority,
  'view_appointments'                         as required_permission,
  '/appointments'                             as href
from sessions s
where s.status = 'scheduled'
  and s.session_date >= current_date
  and s.session_date <= current_date + 14
  and s.client_id in (select public.auth_accessible_client_ids())

union all

-- 2. Funding nearly used up. 85% is the point at which a family can still do
--    something about it; at 100% the conversation is different and later.
select
  'funding-low:' || p.budget_id::text,
  p.client_id,
  'funding',
  'Funding is nearly used',
  p.name || ' is ' || round(p.percent_used)::text || '% used',
  p.period_end,
  case when p.percent_used >= 95 then 'high' else 'normal' end,
  'view_billing',
  '/statement'
from client_budget_positions p
where p.status = 'ACTIVE'
  and p.percent_used >= 85
  and p.client_id in (select public.auth_accessible_client_ids())

union all

-- 3. A funding period ending. Renewal usually needs paperwork, so this is
--    worth surfacing before the last week.
select
  'funding-ends:' || b.id::text,
  b.client_id,
  'funding',
  'Funding period ending',
  b.name || ' ends ' || to_char(b.period_end, 'FMDD FMMonth'),
  b.period_end,
  case when b.period_end <= current_date + 14 then 'high' else 'normal' end,
  'view_billing',
  '/statement'
from client_budgets b
where b.status = 'ACTIVE'
  and b.period_end is not null
  and b.period_end between current_date and current_date + 45
  and b.client_id in (select public.auth_accessible_client_ids())

union all

-- 4. A note a clinician signed and shared. Not a task in the "do something"
--    sense, but it is the thing a parent most wants to know has arrived, and
--    the brief's "For You" is what needs attention rather than strictly what
--    needs doing. Fourteen days so it ages out on its own.
select
  'note:' || n.id::text,
  n.client_id,
  'update',
  'New progress update',
  'Shared ' || to_char(coalesce(n.countersigned_at, n.signed_at), 'FMDD FMMonth'),
  coalesce(n.countersigned_at, n.signed_at)::date,
  'normal',
  'view_clinical_progress',
  '/updates'
from session_notes n
where n.status in ('signed', 'countersigned')
  and coalesce(n.countersigned_at, n.signed_at) >= now() - interval '14 days'
  and n.client_id in (select public.auth_accessible_client_ids());

comment on view family_tasks is
  'What still needs a family''s attention, computed from the entities it is '
  'about rather than stored. A task disappears when the underlying thing stops '
  'being true, so nothing can go stale and nothing needs marking complete. '
  'required_permission is the guardian permission a caller must hold; filter on '
  'auth_guardian_can(client_id, required_permission).';

/**
 * The same list, already filtered to what this caller may see.
 *
 * The view exposes required_permission so a staff-side surface can reason about
 * it; the portal should read this function instead, so the permission check is
 * applied in one place rather than in every page that shows a task.
 */
create or replace function public.my_family_tasks()
returns setof family_tasks
language sql stable security definer set search_path = public, pg_temp as $$
  select t.* from public.family_tasks t
   where public.auth_guardian_can(t.client_id, t.required_permission)
$$;

comment on function public.my_family_tasks() is
  'family_tasks filtered to the caller''s own permissions, per child. A '
  'guardian with scheduling access but not billing sees appointment tasks and '
  'never learns from this list that funding is nearly gone.';
