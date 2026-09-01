-- 0040 · Family-initiated session change requests
--
-- apps/client's "Upcoming Sessions" view lets a family ask staff to
-- reschedule or cancel a booked session. This is deliberately a REQUEST, not
-- a self-service edit: a family has never had (and does not get here) write
-- access to `sessions` itself — that stays staff-only, via the scheduler app.
-- This table is the queue a family's ask lands in; a staff-side UI to work
-- that queue is a separate, later piece of work (see the PR this migration
-- ships with) — this migration only adds the table and its RLS so nothing
-- blocks on it existing.
--
-- Modelled directly on 0020/0023's client-read shape (auth_client_row_id(),
-- the same helper both of those use) for the family's own two commands, and
-- on 0024's guidance that new tables gate staff access on auth_can() rather
-- than role names. The action chosen is 'scheduling.session.book' — "create,
-- move and cancel bookings" — which is what reviewing one of these requests
-- actually is. Per the seed in 0024 that reaches admin, supervisor and
-- scheduler but deliberately not clinician: a clinician can read the
-- schedule (scheduling.calendar.read) but does not action bookings, which
-- matches who this app's own booking flows already involve.

create table if not exists session_change_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),

  session_id bigint not null references sessions(id),
  client_id bigint not null references clients(id),

  request_type text not null check (request_type in ('reschedule', 'cancel')),
  note text,                                -- the family's own words: a preferred window, why they're asking, etc.

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),

  -- Set by whoever actions the request (the not-yet-built staff UI this
  -- migration's PR flags as a follow-up). Left nullable rather than
  -- defaulted so "has this been looked at" is answerable from these two
  -- columns alone.
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_note text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists session_change_requests_session_idx
  on session_change_requests(session_id);
create index if not exists session_change_requests_client_idx
  on session_change_requests(client_id, created_at desc);
-- What the (future) staff queue will actually query by: this clinic's
-- not-yet-reviewed requests, newest first.
create index if not exists session_change_requests_clinic_status_idx
  on session_change_requests(clinic_id, status, created_at desc);

alter table session_change_requests enable row level security;

-- The family: may see and file requests for their own child only. The
-- session_id check below isn't defense-in-depth on top of the client_id
-- check — the two could otherwise disagree (a request row naming a real
-- client_id but a session_id belonging to someone else's session, or to a
-- different clinic), which the FK columns alone don't prevent.
create policy session_change_requests_client_select on session_change_requests
  for select
  using (
    public.auth_role() = 'client'
    and client_id = public.auth_client_row_id()
  );

create policy session_change_requests_client_insert on session_change_requests
  for insert
  with check (
    public.auth_role() = 'client'
    and client_id = public.auth_client_row_id()
    and clinic_id = public.auth_clinic_id()
    and exists (
      select 1 from public.sessions s
       where s.id = session_id
         and s.client_id = session_change_requests.client_id
         and s.clinic_id = session_change_requests.clinic_id
    )
  );

-- Staff: clinic-wide read and the ability to action (approve/decline) a
-- request — no delete, matching CLAUDE.md's "deletes are denied by default"
-- rule, and no staff-side insert (this table only ever originates from a
-- family, by design).
create policy session_change_requests_staff_select on session_change_requests
  for select
  using (
    clinic_id = public.auth_clinic_id()
    and public.auth_can('scheduling.session.book')
  );

create policy session_change_requests_staff_update on session_change_requests
  for update
  using (
    clinic_id = public.auth_clinic_id()
    and public.auth_can('scheduling.session.book')
  );

-- ============================================================================
-- APPLY MANUALLY. The Supabase MCP configured for this repo (.mcp.json) is
-- --read-only by design (see CLAUDE.md's "Supabase access for Claude
-- sessions") — no Claude session, including the one that wrote this file,
-- has run this against the live database. A human with database access
-- needs to run this migration (`supabase db push`, or paste it into the SQL
-- editor) before apps/client's request-a-change feature has anything to
-- write to.
-- ============================================================================
