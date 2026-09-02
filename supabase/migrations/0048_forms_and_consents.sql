-- 0048 · Forms and consents
--
-- The portal's sidebar has advertised "Consents · Soon" since its first pass.
-- This is the schema behind it, and behind the forms half of the family
-- portal brief.
--
-- CONSENT IS NOT A FORM SUBMISSION
--
-- The tempting shortcut is one table: a form, some answers, a signature. It
-- does not survive contact with what consent actually is.
--
-- A submitted form is a fact about a moment: these were the answers on this
-- date. A consent is a state that persists and can end — a parent who agreed
-- to photography in March and withdraws it in September has not amended their
-- March answer, they have revoked a permission that was live in between. If
-- withdrawal is modelled as an edit, the record loses the window during which
-- the clinic was entitled to act, which is the one thing anybody looks at a
-- consent record to find out.
--
-- So consents get their own table with granted_at / withdrawn_at, and nothing
-- is ever updated in place.
--
-- VERSIONING, BECAUSE WORDING CHANGES
--
-- A form is answered against the words that were on screen. If a clinic edits
-- a template, every past submission would silently claim to answer the new
-- wording. Templates are therefore immutable once published: an edit is a new
-- version, and a submission names the version it answered.

-- ---------------------------------------------------------------------------
-- 1. Templates
-- ---------------------------------------------------------------------------
create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  -- Stable across versions. Two rows sharing a key are the same form at
  -- different points in time.
  key text not null,
  version integer not null default 1 check (version > 0),

  title text not null,
  description text,

  kind text not null default 'form' check (kind in ('form', 'consent')),

  -- The fields, as an ordered array of {id, label, type, required, options}.
  -- JSON rather than a fields table: a template is read whole, never queried
  -- field by field, and a schema-per-form in relational tables buys nothing
  -- but joins.
  fields jsonb not null default '[]'::jsonb,

  -- For kind='consent': what is being consented to, in the family's words.
  -- Null for ordinary forms.
  consent_statement text,

  -- Published templates are immutable. A draft can still be edited.
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,

  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),

  unique (clinic_id, key, version),
  constraint form_templates_published_stamp
    check ((status = 'draft') = (published_at is null)),
  constraint form_templates_consent_has_statement
    check (kind <> 'consent' or consent_statement is not null)
);
create index if not exists form_templates_clinic_idx
  on form_templates(clinic_id, key, version desc);

-- A published template cannot be edited. Enforced here rather than by
-- convention, because the whole point of versioning is defeated the first time
-- someone "just fixes a typo" on a form fifty families have already signed.
create or replace function public.form_templates_freeze_published() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status <> 'draft' then
    -- Retiring is the one permitted transition: it stops new assignments
    -- without altering a word anybody answered.
    if new.status = 'retired'
       and new.fields is not distinct from old.fields
       and new.title is not distinct from old.title
       and new.consent_statement is not distinct from old.consent_statement then
      return new;
    end if;
    raise exception
      'Template % v% is published and cannot be edited. Publish a new version instead.',
      old.key, old.version;
  end if;
  return new;
end $$;

drop trigger if exists form_templates_freeze on form_templates;
create trigger form_templates_freeze
  before update on form_templates
  for each row execute function public.form_templates_freeze_published();

-- ---------------------------------------------------------------------------
-- 2. Assignments — this form, to this child's family
-- ---------------------------------------------------------------------------
create table if not exists form_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  template_id uuid not null references form_templates(id) on delete restrict,
  client_id bigint not null references clients(id) on delete cascade,

  due_on date,
  -- Whether the clinic will chase it. A form that is nice to have should not
  -- generate the same task as one that blocks a session.
  is_required boolean not null default true,

  assigned_by uuid not null references profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),

  -- Set when the family completes it. Derived state stays out of here: the
  -- submission's existence is the truth, this is a denormalized shortcut the
  -- trigger below maintains.
  completed_at timestamptz,

  cancelled_at timestamptz,
  unique (template_id, client_id)
);
create index if not exists form_assignments_client_idx
  on form_assignments(client_id, completed_at);

-- ---------------------------------------------------------------------------
-- 3. Submissions
--
-- One per assignment, never updated. A family who needs to change an answer
-- gets a new assignment, so the record shows what was true when the clinic
-- acted on it.
-- ---------------------------------------------------------------------------
create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  assignment_id uuid not null references form_assignments(id) on delete cascade,
  -- Denormalized deliberately: which words were answered has to survive the
  -- assignment being deleted, and a join through it would lose that.
  template_id uuid not null references form_templates(id) on delete restrict,
  client_id bigint not null references clients(id) on delete cascade,

  answers jsonb not null default '{}'::jsonb,

  -- Who typed their name, and what they typed. A typed name is not a
  -- signature in any legal sense and this schema does not pretend otherwise;
  -- it records who was signed in, what they typed, and when.
  submitted_by uuid not null references auth.users(id) on delete restrict,
  signed_name text,
  submitted_at timestamptz not null default now(),

  unique (assignment_id)
);
create index if not exists form_submissions_client_idx on form_submissions(client_id);

comment on column form_submissions.signed_name is
  'What the person typed, alongside who was signed in and when. Recorded as '
  'evidence of intent, not claimed as a legal signature - the schema does not '
  'pretend a text field is one.';

-- Completing a submission closes the assignment. One writer, so no page has to
-- remember, and an assignment cannot sit open with an answer already filed.
create or replace function public.form_submissions_close_assignment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.form_assignments
     set completed_at = new.submitted_at
   where id = new.assignment_id and completed_at is null;
  return new;
end $$;

drop trigger if exists form_submissions_close on form_submissions;
create trigger form_submissions_close
  after insert on form_submissions
  for each row execute function public.form_submissions_close_assignment();

-- ---------------------------------------------------------------------------
-- 4. Consents
--
-- Separate from submissions, for the reason in the header: a consent is a
-- state with a beginning and possibly an end, not an answer with a date.
-- ---------------------------------------------------------------------------
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  client_id bigint not null references clients(id) on delete cascade,
  template_id uuid not null references form_templates(id) on delete restrict,

  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  signed_name text,

  -- Null while live. Set once, never cleared: re-consenting creates a new row,
  -- so the record shows every window rather than the latest one.
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  withdrawal_reason text,

  constraint consent_records_withdrawal_complete
    check ((withdrawn_at is null) = (withdrawn_by is null)),
  constraint consent_records_withdrawn_after_granted
    check (withdrawn_at is null or withdrawn_at >= granted_at)
);
create index if not exists consent_records_client_idx
  on consent_records(client_id, template_id, granted_at desc);

-- Only one live consent per child per template. Without this a family that
-- taps twice has two live grants, and withdrawing one leaves the other
-- standing — a clinic would then read "consent withdrawn" and "consent active"
-- from the same table at the same time.
create unique index if not exists consent_records_one_live
  on consent_records(client_id, template_id) where withdrawn_at is null;

comment on index consent_records_one_live is
  'One live consent per child per template. Withdrawal creates no row and '
  'clears none - it stamps this one, so the history keeps every window during '
  'which the clinic was entitled to act.';

-- A withdrawn consent is closed for good. Re-consenting is a new row.
create or replace function public.consent_records_no_resurrection() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.withdrawn_at is not null and new.withdrawn_at is null then
    raise exception 'A withdrawn consent cannot be reinstated. Record a new consent instead.';
  end if;
  if old.granted_at <> new.granted_at or old.granted_by <> new.granted_by then
    raise exception 'The grant on a consent record is immutable.';
  end if;
  return new;
end $$;

drop trigger if exists consent_records_immutable on consent_records;
create trigger consent_records_immutable
  before update on consent_records
  for each row execute function public.consent_records_no_resurrection();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table form_templates enable row level security;
alter table form_assignments enable row level security;
alter table form_submissions enable row level security;
alter table consent_records enable row level security;

-- A family reads a template through an assignment, or through a consent they
-- have already given. Browsing the clinic's whole form library is not something
-- a portal needs to offer, and a draft must never be reachable.
--
-- The consent half is not symmetry for its own sake. A consent can be recorded
-- without any assignment - a parent agreeing to photography at the front desk -
-- and `my_consents` joins the template for the statement they agreed to. With
-- only the assignment branch, that join dropped every row and the consent
-- history rendered empty: a family could not read back what they had consented
-- to. Found by a test that expected two windows and got none.
drop policy if exists form_templates_family_read on form_templates;
create policy form_templates_family_read on form_templates for select
  using (
    status = 'published'
    and (
      exists (
        select 1 from public.form_assignments a
         where a.template_id = form_templates.id
           and public.auth_guardian_can(a.client_id, 'view_forms'))
      or exists (
        select 1 from public.consent_records c
         where c.template_id = form_templates.id
           and public.auth_guardian_can(c.client_id, 'view_forms'))
    )
  );

drop policy if exists form_templates_staff_read on form_templates;
create policy form_templates_staff_read on form_templates for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists form_templates_staff_write on form_templates;
create policy form_templates_staff_write on form_templates for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists form_templates_staff_update on form_templates;
create policy form_templates_staff_update on form_templates for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('admin.settings.write'));

drop policy if exists form_assignments_family_read on form_assignments;
create policy form_assignments_family_read on form_assignments for select
  using (public.auth_guardian_can(client_id, 'view_forms'));

drop policy if exists form_assignments_staff_read on form_assignments;
create policy form_assignments_staff_read on form_assignments for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists form_assignments_staff_write on form_assignments;
create policy form_assignments_staff_write on form_assignments for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

drop policy if exists form_assignments_staff_update on form_assignments;
create policy form_assignments_staff_update on form_assignments for update
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'))
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

-- Completing a form is a separate permission from seeing one: a grandparent
-- who may read what was asked should not be able to answer it.
drop policy if exists form_submissions_family_read on form_submissions;
create policy form_submissions_family_read on form_submissions for select
  using (public.auth_guardian_can(client_id, 'view_forms'));

drop policy if exists form_submissions_family_write on form_submissions;
create policy form_submissions_family_write on form_submissions for insert
  with check (
    public.auth_guardian_can(client_id, 'complete_forms')
    and submitted_by = auth.uid()
    -- The assignment has to be this child's, live, and not already answered.
    and exists (
      select 1 from public.form_assignments a
       where a.id = form_submissions.assignment_id
         and a.client_id = form_submissions.client_id
         and a.cancelled_at is null
         and a.completed_at is null)
  );

-- No family UPDATE. An answer the clinic already acted on is not something to
-- revise in place; a correction is a new assignment.

drop policy if exists form_submissions_staff_read on form_submissions;
create policy form_submissions_staff_read on form_submissions for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists consent_records_family_read on consent_records;
create policy consent_records_family_read on consent_records for select
  using (public.auth_guardian_can(client_id, 'view_forms'));

drop policy if exists consent_records_family_write on consent_records;
create policy consent_records_family_write on consent_records for insert
  with check (
    public.auth_guardian_can(client_id, 'complete_forms')
    and granted_by = auth.uid()
    -- A consent cannot be filed already withdrawn.
    and withdrawn_at is null
  );

-- Withdrawal is an update, and the only one a family may make. The trigger
-- above stops it touching anything but the withdrawal columns.
drop policy if exists consent_records_family_withdraw on consent_records;
create policy consent_records_family_withdraw on consent_records for update
  using (public.auth_guardian_can(client_id, 'complete_forms'))
  with check (
    public.auth_guardian_can(client_id, 'complete_forms')
    and withdrawn_by = auth.uid()
  );

drop policy if exists consent_records_staff_read on consent_records;
create policy consent_records_staff_read on consent_records for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.read'));

drop policy if exists consent_records_staff_write on consent_records;
create policy consent_records_staff_write on consent_records for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.client.write'));

-- ---------------------------------------------------------------------------
-- 6. What the portal reads
-- ---------------------------------------------------------------------------
create or replace view my_forms with (security_invoker = true) as
select
  a.id                as assignment_id,
  a.client_id,
  t.id                as template_id,
  t.key,
  t.version,
  t.title,
  t.description,
  t.kind,
  t.fields,
  t.consent_statement,
  a.due_on,
  a.is_required,
  a.assigned_at,
  a.completed_at,
  s.submitted_at,
  s.signed_name
from form_assignments a
join form_templates t on t.id = a.template_id
left join form_submissions s on s.assignment_id = a.id
where a.cancelled_at is null;

comment on view my_forms is
  'Forms assigned to this family, with the version of the wording each was '
  'assigned against and the submission if there is one. security_invoker so '
  'the caller''s own policies apply - see 0046.';

/**
 * Live consents per child, and the history behind them.
 *
 * Every row, not just the live ones: a family asking "did I agree to that?"
 * is usually asking about a window that has closed.
 */
create or replace view my_consents with (security_invoker = true) as
select
  c.id                as consent_id,
  c.client_id,
  t.title,
  t.consent_statement,
  t.key,
  c.granted_at,
  c.signed_name,
  c.withdrawn_at,
  c.withdrawal_reason,
  (c.withdrawn_at is null) as is_active
from consent_records c
join form_templates t on t.id = c.template_id;
