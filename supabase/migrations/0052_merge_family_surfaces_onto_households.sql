-- 0052 · Merging two parallel builds of the same portal
--
-- Two branches built family-facing features at the same time. Main added
-- care-team messaging (0035), documents (0036), home-program activities (0038)
-- and session change requests (0040). This branch replaced one-login-one-child
-- with households and guardian relationships (0041) and built threaded
-- messaging on top of it (0044).
--
-- Both are wanted. Neither works beside the other as written, for one reason:
--
--   every family policy main added is keyed on auth_client_row_id()
--
-- which reads `clients.user_id = auth.uid()` — the single-child link the
-- household model exists to replace. Under that model it returns null, so on
-- the merged tree all four of main's new portal features are dead for any
-- household family. Measured, not assumed:
--
--   client_messages           read 0 rows, insert refused by RLS
--   client_documents          read 0 rows
--   home_program_activities   read 0 rows
--   session_change_requests   read 0 rows
--
-- So this migration moves them onto the household model, keeping every other
-- condition main wrote exactly as it was — the direction check on documents,
-- the session-belongs-to-this-client check on change requests, the
-- uploaded_by pinning. Only the identity predicate changes, and each is also
-- gated on the specific guardian permission that governs that surface, so a
-- parent with appointments but not billing gets change requests and not
-- funding documents.

-- ---------------------------------------------------------------------------
-- 1. Documents
--
-- Read and upload both gate on view_shared_documents. A separate "may upload"
-- permission would be more precise, but inventing a permission kind that no
-- clinic has ever set means every existing guardian silently loses the ability
-- to send a form back. A guardian who can see the document exchange can add to
-- it; that is the honest reading of the permission that exists.
-- ---------------------------------------------------------------------------
drop policy if exists client_documents_client_read on client_documents;
create policy client_documents_family_read on client_documents for select
  using (public.auth_guardian_can(client_id, 'view_shared_documents'));

drop policy if exists client_documents_client_write on client_documents;
create policy client_documents_family_write on client_documents for insert
  with check (
    public.auth_guardian_can(client_id, 'view_shared_documents')
    -- Both conditions kept verbatim from main. A family can only add to the
    -- client-to-staff direction, and only under their own name.
    and direction = 'client_to_staff'
    and uploaded_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 2. Home-program activities
--
-- Between-session work assigned against a program, so it reads as clinical
-- progress and gates the same way. The update is how a family marks something
-- done; it is deliberately the same permission, because a parent who can see
-- the homework is the parent who does it.
-- ---------------------------------------------------------------------------
drop policy if exists home_program_activities_client_read on home_program_activities;
create policy home_program_activities_family_read on home_program_activities for select
  using (public.auth_guardian_can(client_id, 'view_clinical_progress'));

drop policy if exists home_program_activities_client_update on home_program_activities;
create policy home_program_activities_family_update on home_program_activities for update
  using (public.auth_guardian_can(client_id, 'view_clinical_progress'))
  with check (public.auth_guardian_can(client_id, 'view_clinical_progress'));

-- ---------------------------------------------------------------------------
-- 3. Session change requests
--
-- Asking to move a session is exactly what `manage_appointments` means, and
-- separating it from `view_appointments` is the point: a grandparent who may
-- see the calendar should not be able to reschedule from it.
-- ---------------------------------------------------------------------------
drop policy if exists session_change_requests_client_select on session_change_requests;
create policy session_change_requests_family_select on session_change_requests for select
  using (public.auth_guardian_can(client_id, 'view_appointments'));

drop policy if exists session_change_requests_client_insert on session_change_requests;
create policy session_change_requests_family_insert on session_change_requests for insert
  with check (
    public.auth_guardian_can(client_id, 'manage_appointments')
    and clinic_id = public.auth_clinic_id()
    -- Kept verbatim from main: the session must actually be this client's, in
    -- this clinic. Without it a request could name someone else's session.
    and exists (
      select 1 from public.sessions s
       where s.id = session_id
         and s.client_id = session_change_requests.client_id
         and s.clinic_id = session_change_requests.clinic_id
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The two messaging systems
--
-- `client_messages` (main, 0035) is one flat thread per child. `messages` +
-- `message_threads` (0044) is the same conversation with a subject, a
-- category, a status, attachments, per-reader unread counts, and — the
-- requirement that decided it — internal staff notes that the family policy
-- cannot return.
--
-- Running both would mean two inboxes and a clinic that has to check each. So
-- the threaded model is the live one and `client_messages` becomes an archive:
-- existing rows are carried forward into a thread per child, the family and
-- staff write paths are dropped so nothing new lands there, and reads are kept
-- so the original record stays inspectable rather than being deleted.
--
-- Deliberately not a `drop table`. Main's migration header says it had not
-- been applied to any live database, but "probably empty" is not a reason to
-- destroy a table on the way past.
-- ---------------------------------------------------------------------------

-- Carry every existing message into the thread model. One thread per client
-- that has any, which is exactly the shape client_messages could represent.
do $$
declare c record; t uuid;
begin
  for c in
    select distinct m.client_id, m.clinic_id,
           min(m.created_at) as started_at,
           (select m2.sender_user_id from public.client_messages m2
             where m2.client_id = m.client_id order by m2.created_at limit 1) as starter
      from public.client_messages m
     group by m.client_id, m.clinic_id
  loop
    -- household_members is where a client's household is recorded. A client
    -- with no household cannot be represented as a thread, so it is left in
    -- the archive rather than attached to an invented one.
    select h.household_id into t
      from public.household_members h
     where h.client_id = c.client_id and h.household_id is not null
     limit 1;
    if t is null then continue; end if;

    insert into public.message_threads
      (clinic_id, household_id, client_id, subject, category, started_by,
       created_at, last_message_at)
    values (c.clinic_id, t, c.client_id, 'Care team', 'clinical', c.starter,
            c.started_at, c.started_at)
    returning id into t;

    insert into public.messages
      (clinic_id, thread_id, author_user_id, author_kind, body, visibility, created_at)
    select c.clinic_id, t, m.sender_user_id,
           case when m.sender_role = 'client' then 'family' else 'staff' end,
           m.body,
           -- Everything in client_messages was visible to the family; nothing
           -- there was ever an internal note. Marking it shared is the only
           -- reading that does not change what a family can see.
           'shared',
           m.created_at
      from public.client_messages m
     where m.client_id = c.client_id
     order by m.created_at;
  end loop;
end $$;

-- No new writes. Read policies stay so the archive is inspectable.
drop policy if exists client_messages_client_write on client_messages;
drop policy if exists client_messages_staff_write on client_messages;

drop policy if exists client_messages_client_read on client_messages;
create policy client_messages_family_read on client_messages for select
  using (public.auth_guardian_can(client_id, 'message_clinic'));

comment on table client_messages is
  'ARCHIVE. The flat one-thread-per-child model that message_threads/messages '
  'replaced in 0052. Rows were carried forward; the write policies are gone, '
  'so nothing new lands here. Kept readable rather than dropped so the original '
  'record stays inspectable.';

-- Main's two messaging actions are more precise than the clinical.client.read
-- that 0049's staff policies were written against: a scheduler who may look at
-- a client file has no business in the family's care conversation. Adopting
-- them here also means main's role matrix — admin/supervisor/clinician true,
-- scheduler/hr_admin/payroll_admin false — actually governs something.
drop policy if exists message_threads_staff_read on message_threads;
create policy message_threads_staff_read on message_threads for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.read'));

drop policy if exists message_threads_staff_write on message_threads;
create policy message_threads_staff_write on message_threads for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.write'));

drop policy if exists message_threads_staff_update on message_threads;
create policy message_threads_staff_update on message_threads for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.write'));

drop policy if exists messages_staff_read on messages;
create policy messages_staff_read on messages for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.read'));

drop policy if exists messages_staff_write on messages;
create policy messages_staff_write on messages for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and author_user_id = auth.uid()
    and author_kind = 'staff'
    and public.auth_can('clinical.message.write')
  );

drop policy if exists message_attachments_staff_read on message_attachments;
create policy message_attachments_staff_read on message_attachments for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.read'));

drop policy if exists message_attachments_staff_write on message_attachments;
create policy message_attachments_staff_write on message_attachments for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.write'));

-- ---------------------------------------------------------------------------
-- 5. clinic_id cannot disagree with client_id
--
-- Main's messaging migration flagged a real, still-open gap first raised in
-- 0013: nothing stops a row's clinic_id being written to clinic A while its
-- client_id points at a client in clinic B, which would put a thread in the
-- wrong clinic's queue. Main solved it for client_messages with a BEFORE
-- INSERT trigger that derives clinic_id from the client rather than trusting
-- the payload. That is the better pattern and it is adopted here, so retiring
-- client_messages does not retire the protection with it.
-- ---------------------------------------------------------------------------
create or replace function public.message_threads_derive_clinic() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare derived uuid;
begin
  if new.client_id is not null then
    select c.clinic_id into derived from public.clients c where c.id = new.client_id;
  else
    select h.clinic_id into derived from public.households h where h.id = new.household_id;
  end if;
  if derived is null then
    raise exception 'Cannot derive a clinic for this thread';
  end if;
  new.clinic_id := derived;
  return new;
end $$;

drop trigger if exists message_threads_clinic on message_threads;
create trigger message_threads_clinic
  before insert on message_threads
  for each row execute function public.message_threads_derive_clinic();

-- The same for a message: its clinic is its thread's, never the request's.
create or replace function public.messages_derive_clinic() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select t.clinic_id into new.clinic_id
    from public.message_threads t where t.id = new.thread_id;
  if new.clinic_id is null then
    raise exception 'Cannot derive a clinic for this message';
  end if;
  return new;
end $$;

drop trigger if exists messages_clinic on messages;
create trigger messages_clinic
  before insert on messages
  for each row execute function public.messages_derive_clinic();

-- ---------------------------------------------------------------------------
-- 6. Re-run the view sweep from 0051
--
-- 0046 turned security_invoker on for every view that existed when it ran.
-- Main's migrations sort before it, so those are covered — but this is the
-- migration that would miss a view added after, and repeating an idempotent
-- loop costs nothing next to another schema-wide RLS bypass.
-- ---------------------------------------------------------------------------
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker'), 'false') <> 'true'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
end $$;
