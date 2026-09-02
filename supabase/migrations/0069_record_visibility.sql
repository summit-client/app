-- 0069 · Who can see this particular record
--
-- Three choices, made by an admin or a supervisor:
--
--   internal   staff only; no family member sees it
--   family     every guardian who may access this child
--   specific   named guardians only
--
-- THIS IS NOT THE PERMISSION GRID, AND DOES NOT REPLACE IT
--
-- `relationship_permissions` (0047) answers "may this parent see billing at
-- all". This answers "may they see THIS document". Both are needed and they
-- compose: a record marked `family` is still invisible to a guardian who lacks
-- the permission governing its surface, and a guardian with every permission
-- still cannot see a record marked `internal`.
--
-- The order matters. Visibility narrows; it never widens. Naming a guardian in
-- a `specific` grant does not hand them a surface they were never given - a
-- parent without view_clinical_progress does not gain it because one milestone
-- names them.
--
-- WHAT IT REPLACES
--
-- Sharing was expressed four different ways, none of which could say "this
-- parent only":
--
--   family_milestones.shared_with_family   a boolean
--   messages.visibility                    'shared' | 'internal'
--   client_documents.direction             which way it travelled, not who sees it
--   session_notes.status                   signed/countersigned as a proxy
--
-- The boolean and the direction are preserved and backfilled rather than
-- dropped, so nothing changes visibility on the day this migration runs. That
-- is the one thing a migration touching who-sees-what must not do.
--
-- messages.visibility is deliberately left alone. A message thread is a
-- conversation, not a record: 'internal' there means a note staff wrote to each
-- other mid-thread, and folding it into a per-record model would invite someone
-- to mark an individual message `specific` and quietly split a conversation.

-- ---------------------------------------------------------------------------
-- 1. The action
--
-- Deliberately narrower than clinical.client.write, which clinicians hold.
-- Deciding what a family sees is a supervisory judgement.
-- ---------------------------------------------------------------------------
insert into permission_actions
  (action, domain, label, description, exposes_phi, exposes_hr_confidential)
values
  ('clinical.record.share', 'clinical', 'Decide what families see',
   'Set whether a record is internal, visible to the whole family, or to named guardians.',
   true, false)
on conflict (action) do nothing;

insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, 'clinical.record.share', true
  from (values ('admin'), ('supervisor')) as r(role)
on conflict do nothing;

-- Explicit false for everyone else, clinicians included. They write the
-- clinical record; they do not decide who outside the team reads it.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, 'clinical.record.share', false
  from (values ('clinician'), ('scheduler'), ('hr_admin'), ('payroll_admin'), ('client')) as r(role)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. The columns
-- ---------------------------------------------------------------------------
-- The DEFAULT is per table, and that is the whole difficulty of this change.
--
-- A blanket default of 'internal' fails closed, which sounds like the safe
-- choice and is not: it silently stops a family seeing a document they
-- themselves uploaded, and stops a signed note reaching them, from the moment
-- this migration runs. The first draft did exactly that and three tests caught
-- it - a shared milestone and a family's own document both went invisible.
--
-- So each table keeps the behaviour it already had, and 'internal' becomes the
-- deliberate act rather than the accident:
--
--   client_documents   'family'   - a document in the family exchange is shared
--                                   by nature, in both directions
--   session_notes      'family'   - the signed/countersigned gate already
--                                   withholds drafts; visibility narrows further
--   family_milestones  'internal' - 0049 already defaults shared_with_family to
--                                   false, and the trigger below keeps the two
--                                   in step
do $$
declare t text; d text;
begin
  foreach t in array array['client_documents', 'family_milestones', 'session_notes']
  loop
    d := case t when 'family_milestones' then 'internal' else 'family' end;
    execute format($f$
      alter table %I
        add column if not exists visibility text not null default %L
          check (visibility in ('internal', 'family', 'specific')),
        add column if not exists visibility_set_by uuid references profiles(id),
        add column if not exists visibility_set_at timestamptz
    $f$, t, d);
  end loop;
end $$;

comment on column client_documents.visibility is
  'internal | family | specific. Narrows what the per-relationship permissions '
  'already allow; it never widens them. Set only by a holder of '
  'clinical.record.share.';

-- ---------------------------------------------------------------------------
-- 3. Named guardians, for `specific`
--
-- One table with a record_type discriminator rather than three grant tables.
-- A polymorphic reference is a real cost - no foreign key, so a deleted record
-- leaves its grants behind - but three near-identical tables would mean every
-- reader joining whichever one matches, and the same bug written three times.
-- The orphan risk is handled by the cleanup trigger below.
-- ---------------------------------------------------------------------------
create table if not exists record_visibility_grants (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  record_type text not null
    check (record_type in ('client_document', 'family_milestone', 'session_note')),
  record_id text not null,

  -- The guardian who may see it. Not a relationship id: a person can guardian
  -- two children, and a grant is about the person.
  guardian_user_id uuid not null references auth.users(id) on delete cascade,

  granted_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),

  unique (record_type, record_id, guardian_user_id)
);
create index if not exists record_visibility_grants_record_idx
  on record_visibility_grants(record_type, record_id);
create index if not exists record_visibility_grants_guardian_idx
  on record_visibility_grants(guardian_user_id);

/**
 * Whether the caller may see one record, given its visibility.
 *
 * security definer because a family session cannot read
 * record_visibility_grants - a parent should not be able to enumerate which
 * other guardians a record was shared with, which is itself information about
 * the household.
 */
create or replace function public.auth_can_see_record(
  p_visibility text, p_record_type text, p_record_id text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_visibility
    when 'family' then true
    when 'specific' then exists (
      select 1 from public.record_visibility_grants g
       where g.record_type = p_record_type
         and g.record_id = p_record_id
         and g.guardian_user_id = auth.uid())
    -- 'internal', and anything unrecognised. A visibility value this function
    -- does not know is treated as internal rather than as visible: an unknown
    -- state must fail closed.
    else false
  end
$$;

comment on function public.auth_can_see_record(text, text, text) is
  'Whether the caller may see a record with this visibility. Fails closed on an '
  'unrecognised value. security definer so a family cannot enumerate which '
  'other guardians a record was shared with.';

-- ---------------------------------------------------------------------------
-- 4. Backfill, so nothing changes visibility today
-- ---------------------------------------------------------------------------

-- A shared milestone was visible to the whole family; an unshared one was not.
update family_milestones
   set visibility = case when shared_with_family then 'family' else 'internal' end;

-- Documents were visible to the family in both directions: staff_to_client is
-- something the clinic sent them, client_to_staff is something they sent.
update client_documents set visibility = 'family';

-- Signed and countersigned notes reached families; drafts did not.
update session_notes
   set visibility = case when status in ('signed', 'countersigned')
                         then 'family' else 'internal' end;

-- shared_with_family is kept rather than dropped. It is the column 0049's
-- constraint and trigger are written against, and removing it in the same
-- migration that introduces its replacement would mean two behavioural changes
-- landing at once with no way to tell which caused a regression.
/**
 * `shared_with_family` and `visibility` must not be able to disagree.
 *
 * 0049's model - and everything written against it - shares a milestone by
 * setting the boolean. Adding a second column that also decides visibility
 * created two sources of truth, and the first draft of this migration let them
 * drift: setting the boolean no longer made a milestone visible, which a test
 * caught as "shared milestone: expected 1, got 0".
 *
 * The boolean drives the column, except where a supervisor has narrowed to
 * `specific` - a deliberate choice the boolean must not overwrite.
 */
create or replace function public.sync_milestone_visibility() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.visibility = 'specific' then
    return new;
  end if;
  new.visibility := case when new.shared_with_family then 'family' else 'internal' end;
  return new;
end $$;

drop trigger if exists family_milestones_visibility_sync on family_milestones;
create trigger family_milestones_visibility_sync
  before insert or update on family_milestones
  for each row execute function public.sync_milestone_visibility();

comment on column family_milestones.shared_with_family is
  'SUPERSEDED by `visibility` (0069). Kept because 0049''s share-stamp '
  'constraint is written against it. New readers should use visibility.';

-- ---------------------------------------------------------------------------
-- 5. Only a supervisor changes it
-- ---------------------------------------------------------------------------
-- UPDATE only, and that is deliberate.
--
-- A trigger cannot distinguish "the caller explicitly wrote visibility =
-- 'family'" from "the column default supplied it", so guarding INSERT means
-- guarding every insert. The first draft did, and a family uploading their own
-- document was refused with a message about needing a supervisor's action -
-- for a row whose visibility they had not chosen and could not have chosen.
--
-- CHANGING visibility is the decision, and that is what this guards. An insert
-- takes the table's default; a record that starts more restrictive than the
-- default (a clinician inserting 'internal') is narrowing, which needs no
-- supervisory sign-off. Widening only ever happens through an update.
create or replace function public.guard_record_visibility() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.visibility is not distinct from old.visibility then
    return new;
  end if;
  if not public.auth_can('clinical.record.share') then
    raise exception
      'Deciding what a family sees needs the clinical.record.share action, held by admins and supervisors.';
  end if;
  new.visibility_set_by := auth.uid();
  new.visibility_set_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['client_documents', 'family_milestones', 'session_notes']
  loop
    execute format('drop trigger if exists %I on %I', t || '_visibility_guard', t);
    execute format(
      'create trigger %I before update on %I '
      'for each row execute function public.guard_record_visibility()',
      t || '_visibility_guard', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table record_visibility_grants enable row level security;

drop policy if exists record_visibility_grants_staff_read on record_visibility_grants;
create policy record_visibility_grants_staff_read on record_visibility_grants for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists record_visibility_grants_write on record_visibility_grants;
create policy record_visibility_grants_write on record_visibility_grants for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'));

drop policy if exists record_visibility_grants_delete on record_visibility_grants;
create policy record_visibility_grants_delete on record_visibility_grants for delete
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'));

-- No family SELECT policy at all: a parent should not be able to enumerate who
-- else a record was shared with. auth_can_see_record() answers that question
-- for them without exposing the rows.

-- ---------------------------------------------------------------------------
-- client_documents had NO update policy of any kind
--
-- 0036 gave it select and insert for staff and for families, and nothing else.
-- Under RLS that means no role could update a row - so setting `visibility` on
-- a document matched zero rows and returned success, and the control would
-- have shipped looking like it worked. A test caught it as "expected 0, got 1"
-- on a document that had just been marked internal.
--
-- Scoped to the sharing action rather than to staff generally: this policy
-- exists to make the visibility decision possible, not to open documents to
-- editing.
-- ---------------------------------------------------------------------------
drop policy if exists client_documents_share_update on client_documents;
create policy client_documents_share_update on client_documents for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'));

-- Same gap on session_notes for this purpose: its staff update policy is
-- clinical.client.write, which clinicians hold. Adding the share action as a
-- second route keeps a supervisor able to set visibility without widening what
-- a clinician may edit.
drop policy if exists session_notes_share_update on session_notes;
create policy session_notes_share_update on session_notes for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.record.share'));

-- The family read policies now consult visibility as well as the permission.
drop policy if exists client_documents_family_read on client_documents;
create policy client_documents_family_read on client_documents for select
  using (
    public.auth_guardian_can(client_id, 'view_shared_documents')
    and public.auth_can_see_record(visibility, 'client_document', id::text)
  );

drop policy if exists family_milestones_family_read on family_milestones;
create policy family_milestones_family_read on family_milestones for select
  using (
    public.auth_guardian_can(client_id, 'view_clinical_progress')
    and public.auth_can_see_record(visibility, 'family_milestone', id::text)
  );

-- The signed/countersigned condition stays. A draft note is a clinician's
-- working document whatever its visibility says, and visibility narrows rather
-- than widens.
drop policy if exists session_notes_family_read on session_notes;
create policy session_notes_family_read on session_notes for select
  using (
    public.auth_guardian_can(client_id, 'view_clinical_progress')
    and status in ('signed', 'countersigned')
    and public.auth_can_see_record(visibility, 'session_note', id::text)
  );

-- ---------------------------------------------------------------------------
-- 7. Grants outlive their record without this
-- ---------------------------------------------------------------------------
create or replace function public.clean_record_visibility_grants() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.record_visibility_grants
   where record_type = tg_argv[0] and record_id = old.id::text;
  return old;
end $$;

do $$
declare t text; k text;
begin
  foreach t in array array['client_documents', 'family_milestones', 'session_notes']
  loop
    k := case t when 'client_documents' then 'client_document'
                when 'family_milestones' then 'family_milestone'
                else 'session_note' end;
    execute format('drop trigger if exists %I on %I', t || '_visibility_cleanup', t);
    execute format(
      'create trigger %I after delete on %I for each row '
      'execute function public.clean_record_visibility_grants(%L)',
      t || '_visibility_cleanup', t, k);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. What a supervisor reads when deciding
-- ---------------------------------------------------------------------------
create or replace view record_visibility_summary with (security_invoker = true) as
select
  'client_document'  as record_type, d.id::text as record_id, d.clinic_id,
  d.client_id, d.title as label, d.visibility, d.visibility_set_by, d.visibility_set_at,
  (select count(*)::int from record_visibility_grants g
    where g.record_type = 'client_document' and g.record_id = d.id::text) as named_guardians
from client_documents d
union all
select
  'family_milestone', m.id::text, m.clinic_id, m.client_id, m.title,
  m.visibility, m.visibility_set_by, m.visibility_set_at,
  (select count(*)::int from record_visibility_grants g
    where g.record_type = 'family_milestone' and g.record_id = m.id::text)
from family_milestones m;

comment on view record_visibility_summary is
  'Every shareable record with who can see it, for the screen where a '
  'supervisor decides. session_notes are deliberately absent: they are read '
  'through the clinical surfaces that already carry their own context, and a '
  'flat list of note ids is not a thing anybody reviews.';
