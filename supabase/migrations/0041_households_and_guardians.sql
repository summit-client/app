-- 0041 · Households, guardians, and per-relationship permissions
--
-- WHAT IS WRONG TODAY
--
-- The client portal binds one login to one child, and does it with a scalar:
--
--   create function auth_client_row_id() returns bigint as
--   $$ select id from public.clients where user_id = auth.uid() $$;
--
-- plus a unique index on clients(user_id). Every client-facing policy in 0020
-- and 0023 reads `client_id = auth_client_row_id()`.
--
-- Two consequences. A parent of two children cannot be represented at all, so
-- families are given one login per child, or a second child is entered under a
-- fabricated email. And if a parent ever WERE linked to two clients, that
-- scalar subquery does not return the first row — it raises "more than one row
-- returned by a subquery used as an expression", and every client policy on the
-- schema starts erroring at once.
--
-- THE MODEL
--
-- Three concepts that today are collapsed into one:
--
--   an AUTH USER      someone who signs in. A parent. Not every family member
--                     needs one, and a child should never need one.
--
--   a HOUSEHOLD       the family. Owns shared things: contacts, announcements,
--                     documents that belong to the family rather than a child.
--
--   a PERSON          anyone in the household. A child receiving services, a
--                     sibling who is not, a parent, a grandmother who is an
--                     emergency contact. A person may point at a `clients` row
--                     (they receive services) or a login (they sign in), or
--                     neither, or both.
--
-- Access is not "parent, therefore everything". It is a RELATIONSHIP between an
-- auth user and a client, carrying its own permissions, so separated parents,
-- a caseworker, or a grandparent with scheduling access only are all
-- expressible without special cases.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- It does not rewrite the existing client policies. `auth_client_row_id()`
-- keeps working, unchanged, for every family that has one child — which today
-- is all of them, because the schema could not express anything else. The new
-- functions sit alongside it, and policies move over per table with their own
-- verification. A migration that swings every client-facing policy at once is
-- how a family loses access to their own child's record on a Friday.

-- ---------------------------------------------------------------------------
-- 1. The household
-- ---------------------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  -- What the family calls itself. "The Yankov Family". Display only; nothing
  -- keys off it, because families rename and merge.
  name text not null,

  -- The address, phone and language the clinic writes to. Per household rather
  -- than per person: a letter goes to a family, not to a four-year-old.
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text,
  phone text,
  preferred_language text not null default 'en',
  timezone text not null default 'America/Toronto',

  notes text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'MERGED')),
  -- Set when this household was merged into another. Kept rather than deleted:
  -- a merged household's audit trail has to stay resolvable.
  merged_into uuid references households(id),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint households_merged_has_target
    check ((status = 'MERGED') = (merged_into is not null))
);
create index if not exists households_clinic_idx on households(clinic_id, name);

-- ---------------------------------------------------------------------------
-- 2. People in the household
--
-- Deliberately NOT the same table as `clients`. A sibling who receives no
-- services, a grandmother who is an emergency contact and a parent are all
-- household members; none of them is a client, and giving them client rows
-- would put non-patients into every clinical query in the schema.
-- ---------------------------------------------------------------------------
create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  household_id uuid not null references households(id) on delete cascade,

  full_name text not null,
  preferred_name text,
  date_of_birth date,

  relationship text not null check (relationship in (
    'parent', 'guardian', 'step_parent', 'foster_carer', 'grandparent',
    'sibling', 'other_relative', 'caseworker', 'emergency_contact',
    'authorized_contact', 'self')),

  -- Optional links. Either, both or neither.
  --   client_id  this person receives services
  --   user_id    this person signs in
  client_id bigint references clients(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,

  email text,
  phone text,

  is_emergency_contact boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists household_members_household_idx on household_members(household_id, status);
create index if not exists household_members_user_idx on household_members(user_id) where user_id is not null;

-- A client belongs to one household. Two households claiming the same child is
-- a data-entry error that would make "which family sees this record" ambiguous.
create unique index if not exists household_members_client_unique
  on household_members(client_id) where client_id is not null;

comment on table household_members is
  'Everyone in a family, whether or not they receive services and whether or '
  'not they sign in. A child is a member with a client_id and no user_id; a '
  'parent is a member with a user_id and no client_id.';

-- ---------------------------------------------------------------------------
-- 3. The relationship that actually grants access
--
-- One row per (guardian, client) pair. This is what the portal authorizes
-- against — not household membership, because two parents in one household can
-- legitimately have different access to the same child, and a caseworker can
-- have access to one child in a household and not the sibling.
-- ---------------------------------------------------------------------------
create table if not exists guardian_relationships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  user_id uuid not null references auth.users(id) on delete cascade,
  client_id bigint not null references clients(id) on delete cascade,
  household_id uuid references households(id) on delete set null,

  relationship text not null default 'guardian',

  status text not null default 'ACTIVE'
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),

  -- Time-bounded access, for a temporary caregiver or an order with an end
  -- date. Null start means "from now"; null end means "until revoked".
  starts_on date,
  ends_on date,

  -- Why access is limited, where it is. Free text and staff-only: the reason a
  -- parent's access is restricted is frequently a court order, and it is not
  -- something the other parent should be able to read out of the portal.
  restriction_note text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),

  unique (user_id, client_id),
  constraint guardian_relationships_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint guardian_relationships_revoked
    check ((status = 'REVOKED') = (revoked_at is not null))
);
create index if not exists guardian_relationships_user_idx
  on guardian_relationships(user_id, status);
create index if not exists guardian_relationships_client_idx
  on guardian_relationships(client_id, status);

comment on table guardian_relationships is
  'One row per guardian per child. This, not household membership, is what the '
  'client portal authorizes against: two parents in one household can hold '
  'different access to the same child.';

-- ---------------------------------------------------------------------------
-- 4. What a relationship may do
--
-- The permission vocabulary is deliberately the one the brief names, and
-- deliberately separate from `permission_actions` in 0024. That catalogue is
-- about STAFF acting on the organization's data. This is about a family member
-- acting on their own child's record. Merging them would let a staff action
-- accidentally satisfy a guardian check, or the reverse.
-- ---------------------------------------------------------------------------
create table if not exists guardian_permission_kinds (
  permission text primary key,
  label text not null,
  description text not null,
  -- Whether withholding this is meaningful. Some access is structural: a
  -- guardian who cannot view the profile has no portal at all.
  is_default boolean not null default false,
  exposes_clinical boolean not null default false,
  exposes_financial boolean not null default false
);

insert into guardian_permission_kinds (permission, label, description, is_default, exposes_clinical, exposes_financial) values
  ('view_profile',                 'View profile',              'See the child''s name, age and basic details.', true,  false, false),
  ('edit_demographics',            'Edit contact details',      'Change address, phone and non-clinical details.', false, false, false),
  ('view_appointments',            'View appointments',         'See scheduled and past sessions.', true,  false, false),
  ('manage_appointments',          'Manage appointments',       'Request, confirm, reschedule or cancel.', false, false, false),
  ('view_forms',                   'View forms',                'See forms and consents assigned to this child.', true,  false, false),
  ('complete_forms',               'Complete forms',            'Fill in and sign forms.', false, false, false),
  ('view_clinical_progress',       'View progress',             'See goals, measurements and progress.', false, true,  false),
  ('view_shared_documents',        'View shared documents',     'Open documents a clinician shared with the family.', false, true,  false),
  ('view_billing',                 'View billing',              'See invoices, statements and balances.', false, false, true),
  ('manage_payment_methods',       'Manage payment methods',    'Add or remove a payment method.', false, false, true),
  ('pay_invoices',                 'Pay invoices',              'Make a payment.', false, false, true),
  ('message_clinic',               'Message the clinic',        'Start and reply to secure conversations.', true,  false, false),
  ('receive_clinical_notifications','Clinical notifications',   'Be notified about progress and clinical updates.', false, true,  false),
  ('receive_financial_notifications','Financial notifications', 'Be notified about invoices and payments.', false, false, true),
  ('manage_household',             'Manage the household',      'Edit family contacts and household details.', false, false, false),
  ('view_family_contacts',         'View family contacts',      'See who else is on the family record.', true,  false, false)
on conflict (permission) do nothing;

create table if not exists relationship_permissions (
  relationship_id uuid not null references guardian_relationships(id) on delete cascade,
  permission text not null references guardian_permission_kinds(permission) on delete cascade,
  granted boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (relationship_id, permission)
);

-- A new relationship starts with the default set rather than with nothing,
-- because a guardian with zero permissions is a support ticket, and with
-- everything is a privacy incident. The defaults are the ones a family needs to
-- use the portal at all: see the child, see appointments, see forms, message.
create or replace function public.guardian_relationship_defaults() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.relationship_permissions (relationship_id, permission, granted)
  select new.id, k.permission, k.is_default
    from public.guardian_permission_kinds k
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists guardian_relationships_defaults on guardian_relationships;
create trigger guardian_relationships_defaults
  after insert on guardian_relationships
  for each row execute function public.guardian_relationship_defaults();

-- ---------------------------------------------------------------------------
-- 5. The functions the portal and its policies authorize against
--
-- Hardened the way 0009 hardened the originals: schema-qualified throughout,
-- pg_temp named last, so a shadowing temp table cannot change the answer.
-- ---------------------------------------------------------------------------

/**
 * Every client the caller may see, as a SET rather than a scalar.
 *
 * This is the fix for the failure mode described at the top: the existing
 * auth_client_row_id() raises the moment a parent has two children. A set
 * returns two rows, which is what `client_id in (...)` wants anyway.
 *
 * Both paths are honoured: the legacy clients.user_id link, so nothing that
 * works today stops working, and the new guardian relationship.
 */
create or replace function public.auth_accessible_client_ids()
returns setof bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id
    from public.clients c
   where c.user_id = auth.uid()
  union
  select gr.client_id
    from public.guardian_relationships gr
   where gr.user_id = auth.uid()
     and gr.status = 'ACTIVE'
     and (gr.starts_on is null or gr.starts_on <= current_date)
     and (gr.ends_on is null or gr.ends_on >= current_date)
$$;

comment on function public.auth_accessible_client_ids() is
  'Every client the signed-in user may access, from the legacy clients.user_id '
  'link and from active guardian relationships. Replaces auth_client_row_id() '
  'for anything that must survive a parent having more than one child.';

/**
 * Whether the caller holds a permission for one specific child.
 *
 * Per relationship, not per user: the same parent can hold billing access to
 * one child and not to their sibling, which is exactly the case a custody
 * arrangement produces.
 *
 * The legacy path (clients.user_id) grants everything, because that is what it
 * grants today and this migration does not take access away from anyone.
 */
create or replace function public.auth_guardian_can(p_client bigint, p_permission text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    exists (select 1 from public.clients c
             where c.id = p_client and c.user_id = auth.uid())
    or exists (
      select 1
        from public.guardian_relationships gr
        join public.relationship_permissions rp on rp.relationship_id = gr.id
       where gr.user_id = auth.uid()
         and gr.client_id = p_client
         and gr.status = 'ACTIVE'
         and (gr.starts_on is null or gr.starts_on <= current_date)
         and (gr.ends_on is null or gr.ends_on >= current_date)
         and rp.permission = p_permission
         and rp.granted
    )
$$;

comment on function public.auth_guardian_can(bigint, text) is
  'Whether the caller holds one permission for one child. Per relationship, so '
  'a guardian can hold billing access to one child and not to a sibling.';

/** The household the caller belongs to, if any. */
create or replace function public.auth_household_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select hm.household_id
    from public.household_members hm
   where hm.user_id = auth.uid() and hm.status = 'ACTIVE'
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
--
-- Families read their own household and the people in it. Staff work within
-- their clinic and need the HR-style separation they already have elsewhere:
-- managing family records is client administration, so it gates on the client
-- actions from 0024 rather than on anything HR.
-- ---------------------------------------------------------------------------
alter table households enable row level security;
alter table household_members enable row level security;
alter table guardian_relationships enable row level security;
alter table relationship_permissions enable row level security;
alter table guardian_permission_kinds enable row level security;

drop policy if exists guardian_permission_kinds_read on guardian_permission_kinds;
create policy guardian_permission_kinds_read on guardian_permission_kinds for select
  using (auth.uid() is not null);

drop policy if exists households_family_read on households;
create policy households_family_read on households for select
  using (id = public.auth_household_id());

drop policy if exists households_staff_read on households;
create policy households_staff_read on households for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists households_staff_write on households;
create policy households_staff_write on households for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

drop policy if exists households_staff_update on households;
create policy households_staff_update on households for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

-- Family contacts are visible to a guardian who holds view_family_contacts for
-- at least one child in the household. Without that qualifier, a scheduling-only
-- grandparent would read the whole family's contact list.
drop policy if exists household_members_family_read on household_members;
create policy household_members_family_read on household_members for select
  using (
    household_id = public.auth_household_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.household_members sibling
         where sibling.household_id = household_members.household_id
           and sibling.client_id is not null
           and public.auth_guardian_can(sibling.client_id, 'view_family_contacts')
      )
    )
  );

drop policy if exists household_members_staff_read on household_members;
create policy household_members_staff_read on household_members for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists household_members_staff_write on household_members;
create policy household_members_staff_write on household_members for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

drop policy if exists household_members_staff_update on household_members;
create policy household_members_staff_update on household_members for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

-- A guardian reads their OWN relationships, so the portal can show "you have
-- access to Maya and Noah". They never read another guardian's row: that would
-- disclose what the other parent can and cannot see, and restriction_note in
-- particular is frequently the substance of a court order.
drop policy if exists guardian_relationships_own_read on guardian_relationships;
create policy guardian_relationships_own_read on guardian_relationships for select
  using (user_id = auth.uid());

drop policy if exists guardian_relationships_staff_read on guardian_relationships;
create policy guardian_relationships_staff_read on guardian_relationships for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

-- Only staff create or change a relationship. A guardian cannot grant
-- themselves access to a child, or widen their own permissions, which is the
-- whole point of keeping this out of the family's hands.
drop policy if exists guardian_relationships_staff_write on guardian_relationships;
create policy guardian_relationships_staff_write on guardian_relationships for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'));

drop policy if exists guardian_relationships_staff_update on guardian_relationships;
create policy guardian_relationships_staff_update on guardian_relationships for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.staff.manage'));

-- A guardian may read the permissions on their own relationship — the portal
-- shows "you have access to: appointments, progress" during invitation
-- acceptance — but never write them.
drop policy if exists relationship_permissions_own_read on relationship_permissions;
create policy relationship_permissions_own_read on relationship_permissions for select
  using (exists (select 1 from public.guardian_relationships gr
                  where gr.id = relationship_permissions.relationship_id
                    and gr.user_id = auth.uid()));

drop policy if exists relationship_permissions_staff_read on relationship_permissions;
create policy relationship_permissions_staff_read on relationship_permissions for select
  using (exists (select 1 from public.guardian_relationships gr
                  where gr.id = relationship_permissions.relationship_id
                    and gr.clinic_id = public.auth_clinic_id()
                    and public.auth_can('clinical.client.read')));

drop policy if exists relationship_permissions_staff_write on relationship_permissions;
create policy relationship_permissions_staff_write on relationship_permissions for insert
  with check (exists (select 1 from public.guardian_relationships gr
                       where gr.id = relationship_permissions.relationship_id
                         and gr.clinic_id = public.auth_clinic_id()
                         and public.auth_can('admin.staff.manage')));

drop policy if exists relationship_permissions_staff_update on relationship_permissions;
create policy relationship_permissions_staff_update on relationship_permissions for update
  using (exists (select 1 from public.guardian_relationships gr
                  where gr.id = relationship_permissions.relationship_id
                    and gr.clinic_id = public.auth_clinic_id()
                    and public.auth_can('admin.staff.manage')))
  with check (exists (select 1 from public.guardian_relationships gr
                       where gr.id = relationship_permissions.relationship_id
                         and gr.clinic_id = public.auth_clinic_id()
                         and public.auth_can('admin.staff.manage')));

-- ---------------------------------------------------------------------------
-- 7. What the portal reads to build its switcher
--
-- One view, so the client app does not assemble this from four queries and get
-- the permission join subtly wrong.
-- ---------------------------------------------------------------------------
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
  -- The permission set, so the portal can hide what it must not offer. RLS is
  -- what actually enforces it; this is so the UI does not present a button
  -- that would fail.
  coalesce(
    (select array_agg(rp.permission order by rp.permission)
       from relationship_permissions rp
      where rp.relationship_id = gr.id and rp.granted),
    array[]::text[]
  )                                     as permissions
from clients c
left join household_members hm on hm.client_id = c.id and hm.status = 'ACTIVE'
left join households h on h.id = hm.household_id
left join guardian_relationships gr
  on gr.client_id = c.id and gr.user_id = auth.uid() and gr.status = 'ACTIVE'
where c.id in (select public.auth_accessible_client_ids());

comment on view my_family is
  'The children the signed-in user may access, with the household they belong '
  'to and the permissions held over each. What the portal''s family switcher '
  'reads. Empty for staff, who reach clients through their own policies.';

-- ---------------------------------------------------------------------------
-- 8. Backfill
--
-- Every existing linked family becomes a household of one child plus the
-- parent, so nothing regresses and the new model has real rows in it from the
-- first deploy. Their guardian relationship gets every permission, because
-- that is exactly what clients.user_id grants them today and this migration
-- takes nothing away.
-- ---------------------------------------------------------------------------
insert into households (clinic_id, name, created_at)
select c.clinic_id, c.name || ' Family', now()
  from clients c
 where c.user_id is not null
   and c.clinic_id is not null
   and not exists (select 1 from household_members hm where hm.client_id = c.id)
on conflict do nothing;

do $$
declare
  r record;
  h uuid;
begin
  for r in
    select c.id as client_id, c.name, c.clinic_id, c.user_id
      from clients c
     where c.user_id is not null
       and c.clinic_id is not null
       and not exists (select 1 from household_members hm where hm.client_id = c.id)
  loop
    select id into h from households
     where clinic_id = r.clinic_id and name = r.name || ' Family'
     order by created_at desc limit 1;
    if h is null then continue; end if;

    -- The child, as a member with a client row and no login.
    insert into household_members (clinic_id, household_id, full_name, relationship, client_id)
    values (r.clinic_id, h, r.name, 'self', r.client_id)
    on conflict do nothing;

    -- The parent, as a member with a login and no client row. Named
    -- "Parent/Guardian" rather than guessed: the existing schema records the
    -- link but never the person's name, and inventing one would put a wrong
    -- name on a family record.
    insert into household_members (clinic_id, household_id, full_name, relationship, user_id)
    values (r.clinic_id, h, 'Parent/Guardian', 'guardian', r.user_id)
    on conflict do nothing;

    insert into guardian_relationships (clinic_id, user_id, client_id, household_id, status)
    values (r.clinic_id, r.user_id, r.client_id, h, 'ACTIVE')
    on conflict (user_id, client_id) do nothing;
  end loop;
end $$;

-- The backfilled relationships get everything, matching what clients.user_id
-- grants today. Run after the loop so the defaults trigger has already fired.
update relationship_permissions rp
   set granted = true
  from guardian_relationships gr
 where rp.relationship_id = gr.id
   and exists (select 1 from clients c
                where c.id = gr.client_id and c.user_id = gr.user_id);
