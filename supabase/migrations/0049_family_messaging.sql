-- 0049 · Secure family ↔ clinic messaging
--
-- THE ONE REQUIREMENT EVERYTHING ELSE BENDS AROUND
--
-- Internal staff notes must never reach the family. Not "are filtered out in
-- the portal query" — never reachable, by any query, from any client-side
-- session, however the request is shaped.
--
-- So `visibility` lives on the message and the family SELECT policy filters on
-- it in the database. A page that forgets a where-clause returns nothing
-- instead of leaking, and there is a test that reads the table as a parent with
-- no filter at all and expects the internal note to be absent.
--
-- The tempting alternative is a separate internal_notes table. That is worse:
-- two tables means two orderings to merge for staff, and the merge is where an
-- internal note ends up in a parent-facing list.
--
-- WHAT A THREAD IS ABOUT
--
-- Every thread names a household, and optionally one child. "Regarding" is the
-- brief's own question and it matters for access: a thread about Maya is
-- readable by guardians who may message about Maya, which is not automatically
-- every adult in the household.
--
-- ROUTING
--
-- category decides which queue a thread lands in. Staff assignment is a
-- separate column so a thread can be reassigned without changing what it is
-- about, and so an unassigned thread is a real state rather than an absence.

-- ---------------------------------------------------------------------------
-- 1. Threads
-- ---------------------------------------------------------------------------
create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  household_id uuid not null references households(id) on delete cascade,

  -- Null means the thread is about the family rather than one child.
  client_id bigint references clients(id) on delete set null,

  subject text not null,

  category text not null default 'general' check (category in (
    'general', 'scheduling', 'billing', 'clinical', 'forms_documents', 'other')),

  status text not null default 'open'
    check (status in ('open', 'awaiting_family', 'resolved')),

  -- Set by staff only. A family cannot mark their own question urgent, which
  -- is not distrust: an urgency everyone can claim stops sorting anything.
  priority text not null default 'normal' check (priority in ('normal', 'high')),

  assigned_to uuid references profiles(id) on delete set null,

  started_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),

  constraint message_threads_resolved_stamp
    check ((status = 'resolved') = (resolved_at is not null))
);
create index if not exists message_threads_household_idx
  on message_threads(household_id, last_message_at desc);
create index if not exists message_threads_queue_idx
  on message_threads(clinic_id, status, category, last_message_at desc);
create index if not exists message_threads_assigned_idx
  on message_threads(assigned_to, status) where assigned_to is not null;

-- ---------------------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  thread_id uuid not null references message_threads(id) on delete cascade,

  author_user_id uuid not null references auth.users(id) on delete restrict,
  -- Denormalized so a staff reply still says "from the clinic" after the
  -- author leaves and their profile is deactivated.
  author_kind text not null check (author_kind in ('family', 'staff')),

  body text not null,

  -- The load-bearing column. 'internal' is staff-only for ever; the family
  -- policy below cannot return it.
  visibility text not null default 'shared'
    check (visibility in ('shared', 'internal')),

  created_at timestamptz not null default now(),
  -- Per reader, so "unread" means unread by you rather than by anyone.
  -- Tracked in message_reads below rather than a boolean here.
  edited_at timestamptz,

  constraint messages_family_never_internal
    check (author_kind = 'staff' or visibility = 'shared')
);
create index if not exists messages_thread_idx on messages(thread_id, created_at);

comment on column messages.visibility is
  'shared reaches the family; internal is staff-only and is filtered in the '
  'RLS policy rather than in application code, so a query that forgets a '
  'where-clause returns nothing instead of leaking.';
comment on constraint messages_family_never_internal on messages is
  'A family author cannot produce an internal note. Without this, a crafted '
  'insert from the portal could hide a message from the staff who need it.';

-- Read state per person. A boolean on the message would mean "read by
-- somebody", which is not a thing anyone wants to know.
create table if not exists message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. Attachments
--
-- Metadata only. The bytes live in storage behind signed URLs; a row here is
-- the record that a file belongs to a message, and its visibility follows the
-- message it hangs off.
-- ---------------------------------------------------------------------------
create table if not exists message_attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  message_id uuid not null references messages(id) on delete cascade,

  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),

  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  -- An allow-list, not a deny-list. Deny-lists are a promise to have thought
  -- of every dangerous type, which nobody can keep.
  constraint message_attachments_allowed_type check (content_type in (
    'application/pdf',
    'image/png', 'image/jpeg', 'image/heic', 'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
);
create index if not exists message_attachments_message_idx on message_attachments(message_id);

comment on constraint message_attachments_allowed_type on message_attachments is
  'Allow-list. 25 MB ceiling. A deny-list is a promise to have thought of every '
  'dangerous type, which is not a promise anyone can keep.';

-- Threads sort by their newest message. Maintained here so no writer has to
-- remember, and so a thread cannot sink because someone forgot to touch it.
create or replace function public.messages_touch_thread() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.message_threads
     set last_message_at = new.created_at,
         -- A family reply reopens a resolved thread. Silently appending to a
         -- closed thread is how a family's question goes unanswered for a week.
         status = case
           when new.author_kind = 'family' and status = 'resolved' then 'open'
           when new.author_kind = 'family' then 'open'
           when new.author_kind = 'staff' and status = 'open' then 'awaiting_family'
           else status
         end,
         resolved_at = case
           when new.author_kind = 'family' and status = 'resolved' then null
           else resolved_at end,
         resolved_by = case
           when new.author_kind = 'family' and status = 'resolved' then null
           else resolved_by end
   where id = new.thread_id
     -- An internal note is staff talking to staff. It must not move the thread
     -- into "awaiting family" or tell the family anything happened.
     and new.visibility = 'shared';
  return new;
end $$;

drop trigger if exists messages_touch on messages;
create trigger messages_touch
  after insert on messages
  for each row execute function public.messages_touch_thread();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table message_reads enable row level security;
alter table message_attachments enable row level security;

/**
 * Whether the caller may take part in a thread as a family member.
 *
 * A thread about one child needs message_clinic for THAT child. A thread about
 * the household needs it for at least one child in it — otherwise a guardian
 * with access to one sibling could not ask a general question, which is not
 * what anyone means by scoping.
 */
create or replace function public.auth_can_use_thread(p_thread uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.message_threads t
     where t.id = p_thread
       and (
         (t.client_id is not null and public.auth_guardian_can(t.client_id, 'message_clinic'))
         or (t.client_id is null
             and t.household_id = public.auth_household_id()
             and exists (
               select 1 from public.household_members hm
                where hm.household_id = t.household_id
                  and hm.client_id is not null
                  and public.auth_guardian_can(hm.client_id, 'message_clinic')))
       )
  )
$$;

drop policy if exists message_threads_family_read on message_threads;
create policy message_threads_family_read on message_threads for select
  using (public.auth_can_use_thread(id));

drop policy if exists message_threads_family_write on message_threads;
create policy message_threads_family_write on message_threads for insert
  with check (
    started_by = auth.uid()
    and household_id = public.auth_household_id()
    -- Priority is staff-set. A family opening a thread gets 'normal'.
    and priority = 'normal'
    and (
      (client_id is not null and public.auth_guardian_can(client_id, 'message_clinic'))
      or (client_id is null and exists (
            select 1 from public.household_members hm
             where hm.household_id = message_threads.household_id
               and hm.client_id is not null
               and public.auth_guardian_can(hm.client_id, 'message_clinic')))
    )
  );

-- No family UPDATE on threads: assignment, priority, category and resolution
-- are the clinic's to set.

drop policy if exists message_threads_staff_read on message_threads;
create policy message_threads_staff_read on message_threads for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists message_threads_staff_write on message_threads;
create policy message_threads_staff_write on message_threads for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists message_threads_staff_update on message_threads;
create policy message_threads_staff_update on message_threads for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

-- THE POLICY THAT MATTERS. A family reads shared messages in threads they may
-- use. `visibility = 'shared'` is here, in the database, not in a page.
drop policy if exists messages_family_read on messages;
create policy messages_family_read on messages for select
  using (visibility = 'shared' and public.auth_can_use_thread(thread_id));

drop policy if exists messages_family_write on messages;
create policy messages_family_write on messages for insert
  with check (
    author_user_id = auth.uid()
    and author_kind = 'family'
    and visibility = 'shared'
    and public.auth_can_use_thread(thread_id)
  );

-- No family UPDATE or DELETE. A sent message is part of a record the clinic
-- acted on; editing it after the fact rewrites what they replied to.

drop policy if exists messages_staff_read on messages;
create policy messages_staff_read on messages for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists messages_staff_write on messages;
create policy messages_staff_write on messages for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and author_user_id = auth.uid()
    and author_kind = 'staff'
    and public.auth_can('clinical.client.read')
  );

drop policy if exists message_reads_own on message_reads;
create policy message_reads_own on message_reads for select using (user_id = auth.uid());
drop policy if exists message_reads_own_write on message_reads;
create policy message_reads_own_write on message_reads for insert with check (user_id = auth.uid());

-- An attachment inherits the visibility of its message: if the message cannot
-- be read, neither can the fact that a file hangs off it.
drop policy if exists message_attachments_family_read on message_attachments;
create policy message_attachments_family_read on message_attachments for select
  using (exists (
    select 1 from public.messages m
     where m.id = message_attachments.message_id
       and m.visibility = 'shared'
       and public.auth_can_use_thread(m.thread_id)));

drop policy if exists message_attachments_family_write on message_attachments;
create policy message_attachments_family_write on message_attachments for insert
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.messages m
                 where m.id = message_attachments.message_id
                   and m.author_user_id = auth.uid()));

drop policy if exists message_attachments_staff_read on message_attachments;
create policy message_attachments_staff_read on message_attachments for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists message_attachments_staff_write on message_attachments;
create policy message_attachments_staff_write on message_attachments for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

-- ---------------------------------------------------------------------------
-- 5. The family's inbox
--
-- Unread is counted per reader against shared messages only, so an internal
-- note cannot even produce a badge — which would tell a family something
-- happened that they are not permitted to see.
-- ---------------------------------------------------------------------------
create or replace view my_message_threads as
select
  t.id                        as thread_id,
  t.client_id,
  t.household_id,
  t.subject,
  t.category,
  t.status,
  t.last_message_at,
  t.created_at,
  (select count(*) from messages m
    where m.thread_id = t.id
      and m.visibility = 'shared'
      and not exists (select 1 from message_reads r
                       where r.message_id = m.id and r.user_id = auth.uid())
  )                           as unread_count,
  (select m.body from messages m
    where m.thread_id = t.id and m.visibility = 'shared'
    order by m.created_at desc limit 1
  )                           as last_message_preview,
  (select m.author_kind from messages m
    where m.thread_id = t.id and m.visibility = 'shared'
    order by m.created_at desc limit 1
  )                           as last_message_from
from message_threads t
where public.auth_can_use_thread(t.id);

-- `my_family` gained a clinic_id. Appended at the end of the select list, which
-- is the only shape `create or replace view` accepts — inserting a column in
-- the middle requires a drop, and this view has dependents.
--
-- The portal needs it because starting a thread has to name a clinic, and the
-- browser is the wrong place to learn which one. Reading it back from the
-- family record the caller can already see is the same trust boundary they are
-- already inside.
create or replace view my_family as
select
  c.id                                  as client_id,
  c.name                                as client_name,
  c.status                              as client_status,
  hm.preferred_name,
  hm.date_of_birth,
  h.id                                  as household_id,
  h.name                                as household_name,
  gr.id                                 as relationship_id,
  gr.relationship,
  gr.status                             as relationship_status,
  coalesce(
    (select array_agg(rp.permission order by rp.permission)
       from relationship_permissions rp
      where rp.relationship_id = gr.id and rp.granted),
    array[]::text[]
  )                                     as permissions,
  c.clinic_id
from clients c
left join household_members hm on hm.client_id = c.id and hm.status = 'ACTIVE'
left join households h on h.id = hm.household_id
left join guardian_relationships gr
  on gr.client_id = c.id and gr.user_id = auth.uid() and gr.status = 'ACTIVE'
where c.id in (select public.auth_accessible_client_ids());

comment on view my_message_threads is
  'A family''s inbox. Unread counts and previews consider shared messages only, '
  'so an internal staff note cannot produce a badge that tells a family '
  'something happened which they may not see.';
