-- ============================================================================
-- 0079 · Clinic Scoreboard persistence
--
-- WHAT WAS BROKEN
--
-- apps/employee's Clinic Scoreboard (app/scoreboard/page.tsx, the "Clinic
-- Scoreboard" tab) has never saved anything in live mode. Both of its controls
-- - the per-domain sliders and "add a site" - called hr-store.ts's saveLocal(),
-- whose live implementation in lib/hr-backend.ts was
--
--     saveLocal() { /* live mode has no local-only state to keep */ },
--
-- an empty function. The snapshot's `sites` array was also hardcoded to `[]`
-- on load. So in production a person dragged a slider, the number moved, the
-- meter moved, and nothing was written anywhere; a reload showed an empty
-- board again. It worked in preview - where the whole snapshot is one
-- localStorage blob - which is how it survived this long. The comment on the
-- snapshot field said the honest thing all along ("Org configuration, not a
-- 0007 table ... they stay local until moved"); nothing on the screen did.
--
-- WHY A TABLE AND NOT @summit/settings
--
-- @summit/settings was the obvious candidate: it already persists org- and
-- user-scoped values to the 0005 tables, already toasts on save, and would
-- need no migration. It is the wrong home, for three reasons:
--
--   1. Its value type is `string | number | boolean` against a key from a
--      STATIC registry in packages/settings/index.ts. A scoreboard is an
--      unbounded, user-created list of sites, each with a score per domain.
--      It would have to be smuggled in as one JSON string under one invented
--      key - a blob in a column built for a scalar.
--   2. Every setSetting() write is audited with its previous and next value.
--      A dragged slider would write the entire board, twice, into the audit
--      trail, per step.
--   3. The decisive one: CONCURRENT EDITORS. This board is shared. The
--      domains have named owners on the screen (Environmental Lead,
--      Collaboration Lead, Student Support Lead ...) and the whole point is
--      that several people at a site keep their own number current. A single
--      blob - in a setting or in a jsonb column - means read-modify-write, so
--      whoever saves second silently discards the other's number. One row per
--      (site, domain) makes each person's write independent. That is a
--      correctness argument, not a tidiness one, and it is why this is two
--      tables rather than a jsonb column on one.
--
-- SHAPE
--
-- Same split migration 0006 already uses for the Employee Hub: the TEMPLATE
-- lives in code and only the per-subject values live here. There, the task and
-- course catalogue is apps/employee/lib/content.ts and hub_task_progress is
-- keyed by its `task_key`. Here, the five domains are CLINIC_DOMAINS in
-- apps/employee/lib/ecosystem.ts and hub_scoreboard_scores is keyed by its
-- `domain_key`. Consistent with hub_task_progress, domain_key carries no check
-- constraint: the catalogue is versioned with the app, and a migration that
-- pinned today's five keys would have to be rewritten the first time a sixth
-- is added. A key with no matching domain in code simply renders nowhere.
--
-- A site is free text, matched on the screen against
-- hub_employee_profiles.location to decide whose board is "yours". That match
-- is by string today and it is fair to call it fragile, but unifying sites and
-- locations is a product decision with its own blast radius (the scheduler has
-- a `locations` table of its own), so this migration deliberately persists the
-- existing model rather than quietly redesigning it.
--
-- TENANCY
--
-- Both tables carry clinic_id NOT NULL. That is deliberately tighter than the
-- 0006 hub tables, whose clinic_id is nullable - a null there is invisible to
-- every policy anyway (auth_clinic_id() = null is never true), so it buys
-- nothing but a row nobody can read. Per CLAUDE.md, a new table gets clinic_id
-- and a clinic_id = auth_clinic_id() policy from the start.
--
-- Every policy below is written PER COMMAND. `for all` would reuse `using` as
-- the insert check and, more importantly, would grant DELETE - which is denied
-- by default across this entire schema and must stay that way. A site is
-- removed by an administrator with a deliberate SQL statement, not by a stray
-- click on a shared board.
--
-- Safe to run once, by hand, in the Supabase SQL editor. Idempotent
-- throughout: create ... if not exists, drop policy if exists before each
-- create, on conflict do nothing on both seeds.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sites
-- ---------------------------------------------------------------------------
create table if not exists hub_scoreboard_sites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  site text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  -- A board with "Main Clinic" and "Main Clinic " on it is two competing
  -- entries for one place, and the screen's own duplicate check compares
  -- trimmed strings. Enforce it here too, since the screen is not the only
  -- thing that can insert.
  constraint hub_scoreboard_sites_name_not_blank check (btrim(site) <> ''),
  constraint hub_scoreboard_sites_unique unique (clinic_id, site)
);

comment on table hub_scoreboard_sites is
  'Clinic Scoreboard sites (apps/employee Scoreboard, migration 0079). Free '
  'text, matched against hub_employee_profiles.location to decide whose board '
  'is whose.';

create index if not exists hub_scoreboard_sites_clinic_idx
  on hub_scoreboard_sites(clinic_id);

-- ---------------------------------------------------------------------------
-- 2. Scores: one row per site per domain
--
-- clinic_id is carried here as well as on the parent, rather than reached
-- through the FK. Every policy in this schema is shaped
-- `clinic_id = auth_clinic_id()`, and a policy that has to join to its parent
-- to find the clinic is the kind of policy that gets written slightly wrong
-- the next time somebody adds a table next to it.
-- ---------------------------------------------------------------------------
create table if not exists hub_scoreboard_scores (
  site_id uuid not null references hub_scoreboard_sites(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  domain_key text not null,               -- CLINIC_DOMAINS[].key, in app code
  score integer not null default 0 check (score between 0 and 100),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (site_id, domain_key)
);

comment on table hub_scoreboard_scores is
  'One row per site per scoreboard domain (migration 0079). Deliberately not a '
  'jsonb blob on hub_scoreboard_sites: the domains have different owners and '
  'are edited concurrently, and a blob loses whichever write lands first.';

create index if not exists hub_scoreboard_scores_clinic_idx
  on hub_scoreboard_scores(clinic_id);

-- ---------------------------------------------------------------------------
-- 3. Actions
--
-- New tables gate on actions rather than role names (migration 0024). Two of
-- them, because reading the board and changing it are genuinely different
-- decisions: the plausible thing a clinic will want to tighten is "everyone
-- watches, the domain leads edit", and with two actions that is a change to
-- the matrix rather than a migration.
--
-- Neither exposes PHI, and neither is an HR confidence: a site-level score is
-- an aggregate about a place, never about a person. That distinction is the
-- entire premise of the screen - "sites compete; people do not", with
-- individual standing shown only as a private band to the person it belongs
-- to - and it is why this board can be clinic-readable when the person-level
-- HR tables in 0006/0007 are not.
-- ---------------------------------------------------------------------------
insert into permission_actions
  (action, domain, label, description, exposes_phi, exposes_hr_confidential)
values
  ('hr.scoreboard.read', 'hr', 'View the clinic scoreboard',
   'See every site on the clinic scoreboard and its domain scores.',
   false, false),
  ('hr.scoreboard.write', 'hr', 'Update the clinic scoreboard',
   'Add a site to the clinic scoreboard and set its domain scores.',
   false, false)
on conflict (action) do nothing;

-- Seeded to reproduce exactly what the screen does today, which is: any
-- signed-in staff member may read the board and move a slider on it. This
-- migration is not the place to change who may do that - it is the place to
-- make what they do survive a reload. Every role that holds 'hr.self.read'
-- (i.e. every staff role) holds both of these.
--
-- Worth being explicit, since it is the one loose grant here: a clinician can
-- add a site and can move any domain on their own site's board. That is
-- today's behaviour, not a new grant, and a clinic that wants the tighter
-- posture revokes hr.scoreboard.write for 'clinician' in role_permissions
-- without touching this schema.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, true
  from (values ('admin'), ('supervisor'), ('clinician'), ('scheduler'),
               ('hr_admin'), ('payroll_admin')) as r(role)
  cross join (values ('hr.scoreboard.read'), ('hr.scoreboard.write')) as a(action)
on conflict do nothing;

-- Families do not see the organization's internal scoreboard at all. Stated
-- explicitly rather than left to the absence of a row, matching how 0024 and
-- 0069 state a denial.
insert into role_permissions (clinic_id, role, action, granted)
select null, 'client', a.action, false
  from (values ('hr.scoreboard.read'), ('hr.scoreboard.write')) as a(action)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table hub_scoreboard_sites enable row level security;
alter table hub_scoreboard_scores enable row level security;

drop policy if exists hub_scoreboard_sites_read on hub_scoreboard_sites;
create policy hub_scoreboard_sites_read on hub_scoreboard_sites for select
  using (clinic_id = public.auth_clinic_id()
         and public.auth_can('hr.scoreboard.read'));

-- created_by = auth.uid() for the same reason forum_posts pins `author`:
-- a row that records who added a site should record the person who actually
-- added it.
drop policy if exists hub_scoreboard_sites_add on hub_scoreboard_sites;
create policy hub_scoreboard_sites_add on hub_scoreboard_sites for insert
  with check (clinic_id = public.auth_clinic_id()
              and public.auth_can('hr.scoreboard.write')
              and created_by = auth.uid());

-- No UPDATE policy on hub_scoreboard_sites, and no DELETE policy on either
-- table. Nothing renames a site and nothing removes one; when something does,
-- it arrives with its own migration and its own reasoning rather than
-- inheriting the permission by accident today.

drop policy if exists hub_scoreboard_scores_read on hub_scoreboard_scores;
create policy hub_scoreboard_scores_read on hub_scoreboard_scores for select
  using (clinic_id = public.auth_clinic_id()
         and public.auth_can('hr.scoreboard.read'));

-- Insert and update are separate policies carrying the same test, because the
-- app upserts: the first person to touch a domain inserts its row and everyone
-- after that updates it. Both carry an explicit `with check` so a write cannot
-- move a row into another clinic or onto another clinic's site on the way out.
drop policy if exists hub_scoreboard_scores_insert on hub_scoreboard_scores;
create policy hub_scoreboard_scores_insert on hub_scoreboard_scores for insert
  with check (clinic_id = public.auth_clinic_id()
              and public.auth_can('hr.scoreboard.write')
              and exists (select 1 from public.hub_scoreboard_sites s
                           where s.id = hub_scoreboard_scores.site_id
                             and s.clinic_id = public.auth_clinic_id()));

drop policy if exists hub_scoreboard_scores_update on hub_scoreboard_scores;
create policy hub_scoreboard_scores_update on hub_scoreboard_scores for update
  using (clinic_id = public.auth_clinic_id()
         and public.auth_can('hr.scoreboard.write'))
  with check (clinic_id = public.auth_clinic_id()
              and public.auth_can('hr.scoreboard.write')
              and exists (select 1 from public.hub_scoreboard_sites s
                           where s.id = hub_scoreboard_scores.site_id
                             and s.clinic_id = public.auth_clinic_id()));
