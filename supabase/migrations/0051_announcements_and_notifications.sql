-- 0051 · Announcements, notification preferences, and the notification centre
--
-- THE CENTRE IS DERIVED, NOT STORED
--
-- Same decision as `family_tasks` in 0048, for the same reason. A stored
-- notifications table has to be written by every feature that might notify, and
-- then unwritten when the thing it referred to changes: the appointment is
-- cancelled, the message is read, the announcement expires. Miss one unwind and
-- a family is chasing something that already happened.
--
-- So `my_notifications` reads the live rows every time. There is nothing to
-- keep in sync, and a notification cannot outlive its cause.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not send anything. There is no email or SMS sender in this repo, and
-- inventing a `sent_at` column for a sender that does not exist would make the
-- schema lie. What it does have is `notification_preferences`, because consent
-- has to be recorded before the first message goes out, not after — and because
-- the brief is firm that PHI must never appear in an external preview, which is
-- a decision that has to be storable before anyone can honour it.

-- ---------------------------------------------------------------------------
-- 1. Announcements
--
-- The clinic writing to families. Either to everyone, or to one household.
-- Not to "everyone in a program": that needs a targeting model this schema
-- cannot express yet, and a half-targeted announcement is worse than a
-- clinic-wide one because staff will believe it was narrower than it was.
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  audience text not null default 'all_families'
    check (audience in ('all_families', 'household')),
  -- Required exactly when the audience is one household. The constraint is
  -- what stops a "household" announcement with no household from quietly
  -- reaching everyone.
  household_id uuid references households(id) on delete cascade,

  title text not null,
  body text not null,

  category text not null default 'general' check (category in (
    'general', 'closure', 'policy', 'event', 'billing', 'safety')),

  -- Urgent announcements pin to the top of the family's centre. Staff-set;
  -- there is no family write path to this table at all.
  is_urgent boolean not null default false,

  -- A window, not a boolean. "Published" that nobody ever unpublishes is how a
  -- notice about a 2024 closure is still on a portal in 2026.
  publish_at timestamptz not null default now(),
  expires_at timestamptz,

  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint announcements_household_matches_audience
    check ((audience = 'household') = (household_id is not null)),
  constraint announcements_window_ordered
    check (expires_at is null or expires_at > publish_at)
);
create index if not exists announcements_live_idx
  on announcements(clinic_id, publish_at desc);
create index if not exists announcements_household_idx
  on announcements(household_id) where household_id is not null;

comment on constraint announcements_household_matches_audience on announcements is
  'Without this, a "household" announcement with a null household_id reaches '
  'every family in the clinic — the exact mistake that is invisible until it '
  'has already happened.';

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Notification preferences
--
-- Per person and per kind, so "tell me about appointments but not billing" is
-- expressible. Channels are separate columns rather than rows: a person has
-- exactly these three, and a row-per-channel model invites a fourth to be added
-- as data and then silently ignored by every reader.
-- ---------------------------------------------------------------------------
create table if not exists notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,

  kind text not null check (kind in (
    'appointment_reminder', 'appointment_change', 'message_reply',
    'form_due', 'billing', 'announcement', 'progress_update')),

  in_portal boolean not null default true,
  email boolean not null default true,
  sms boolean not null default false,

  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- False by default, and set only by an explicit action a person took. A default
-- of true here would mean every family is opted into detail-in-preview from the
-- day the sender ships, which is not consent.
alter table notification_preferences
  add column if not exists allow_detail_in_preview boolean not null default false;

comment on column notification_preferences.allow_detail_in_preview is
  'Whether this person has agreed that an external notification (email, SMS) '
  'may name the child or the subject. Default false: an email preview lands on '
  'a lock screen, and a family has not consented to that by signing up for a '
  'portal. No sender exists yet; this exists so the first one cannot ship '
  'without a value to read.';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table notification_preferences enable row level security;

/**
 * Whether an announcement is live for the caller right now.
 *
 * The publish window is applied here rather than in the view, so an
 * unpublished draft is not merely hidden from one query — it is not selectable
 * by a family at all, however the request is shaped.
 */
drop policy if exists announcements_family_read on announcements;
create policy announcements_family_read on announcements for select
  using (
    publish_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      (audience = 'household' and household_id = public.auth_household_id())
      or (audience = 'all_families'
          and exists (select 1 from public.household_members hm
                       where hm.household_id = public.auth_household_id()
                         and hm.client_id is not null))
    )
  );

drop policy if exists announcements_staff_read on announcements;
create policy announcements_staff_read on announcements for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

-- Writing an announcement is an act of clinic communication, not clinical work.
-- Tied to the settings action, which is the one already held by the people who
-- speak for the clinic.
drop policy if exists announcements_staff_write on announcements;
create policy announcements_staff_write on announcements for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists announcements_staff_update on announcements;
create policy announcements_staff_update on announcements for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists announcements_staff_delete on announcements;
create policy announcements_staff_delete on announcements for delete
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists announcement_reads_own on announcement_reads;
create policy announcement_reads_own on announcement_reads for select using (user_id = auth.uid());
drop policy if exists announcement_reads_own_write on announcement_reads;
create policy announcement_reads_own_write on announcement_reads for insert with check (user_id = auth.uid());

-- A person's own preferences, and nobody else's. Staff cannot read them either:
-- whether a parent wants SMS is that parent's business, and a clinic that needs
-- to know can ask.
drop policy if exists notification_preferences_own on notification_preferences;
create policy notification_preferences_own on notification_preferences for select
  using (user_id = auth.uid());
drop policy if exists notification_preferences_own_write on notification_preferences;
create policy notification_preferences_own_write on notification_preferences for insert
  with check (user_id = auth.uid());
drop policy if exists notification_preferences_own_update on notification_preferences;
create policy notification_preferences_own_update on notification_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. The family's announcements, with read state
-- ---------------------------------------------------------------------------
-- `security_invoker = true` is load-bearing, not decoration. A plain Postgres
-- view executes as its OWNER, which for a view created by a migration is a
-- superuser, and RLS on the underlying table is then NOT applied. This view has
-- no scoping of its own — it relies entirely on `announcements_family_read`
-- above — so without this option it would return every announcement in every
-- clinic to any signed-in user.
create or replace view my_announcements with (security_invoker = true) as
select
  a.id            as announcement_id,
  a.title,
  a.body,
  a.category,
  a.is_urgent,
  a.publish_at,
  a.expires_at,
  a.audience,
  not exists (select 1 from announcement_reads r
               where r.announcement_id = a.id and r.user_id = auth.uid())
                  as is_unread
from announcements a;
-- No where-clause of its own: `announcements_family_read` restricts this to
-- live announcements for the caller's household, and `security_invoker` above
-- is what makes that policy apply here at all.

-- ---------------------------------------------------------------------------
-- 5. The notification centre
--
-- One list of everything waiting on this family, assembled from live rows.
-- Every entry names its source and carries a link target, so the portal renders
-- it without a lookup table of its own.
--
-- Returns a set rather than being a view, because `my_family_tasks()` is a
-- function (it applies per-child permissions) and a view cannot select from it
-- without losing the caller's identity.
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications()
returns table (
  source text,
  ref_id text,
  title text,
  detail text,
  occurred_at timestamptz,
  is_urgent boolean,
  href text
)
language sql stable security invoker set search_path = public, pg_temp as $$
  -- Unread replies from the clinic. Counted per reader, and only from shared
  -- messages, because `my_message_threads` is built that way.
  select
    'message'::text,
    t.thread_id::text,
    t.subject,
    case when t.unread_count = 1 then '1 new reply'
         else t.unread_count::text || ' new replies' end,
    t.last_message_at,
    false,
    '/messages?thread=' || t.thread_id::text
  from my_message_threads t
  where t.unread_count > 0

  union all

  -- Announcements this person has not opened.
  select
    'announcement'::text,
    a.announcement_id::text,
    a.title,
    a.category,
    a.publish_at,
    a.is_urgent,
    '/updates#announcement-' || a.announcement_id::text
  from my_announcements a
  where a.is_unread

  union all

  -- Things needing the family to act, from 0048. Derived there too, so a task
  -- that has been done stops appearing without anything having to clear it.
  select
    'task'::text,
    k.task_id,
    k.title,
    k.detail,
    -- family_tasks carries a calendar date. Cast so the union has one type;
    -- ordering across a date and a timestamp is what the portal needs, and a
    -- date sorts as that day's start, which is the right end of it for a due
    -- date.
    k.due_on::timestamptz,
    k.priority = 'high',
    k.href
  from public.my_family_tasks() k
$$;

comment on function public.my_notifications() is
  'Everything waiting on this family, assembled from live rows at read time. '
  'Nothing is stored, so a notification cannot outlive the thing that caused '
  'it — the failure mode a stored inbox has and this does not.';
