-- 0059 · Supervision
--
-- Two things a supervisor writes, and they are not the same record:
--
--   * CLINICIAN supervision — how a staff member is developing. Their
--     performance, their skills, the materials assigned to them. It is about
--     an employee and belongs to the employment relationship.
--   * CLIENT supervision — a supervisor observing a client's programming and
--     directing it. It is about a child and is clinical record.
--
-- One table with a nullable client_id would make "who is this note about" a
-- question you answer by checking which column is null, and would put clinical
-- observations and employment feedback under one policy. They are one table
-- here with a required `kind` and a constraint tying the subject to it, so the
-- distinction is enforced rather than remembered - and the read policies
-- differ, which is the part that matters.
--
-- THE TWO SIGNATURES ARE NOT SYMMETRIC
--
-- The brief asks for "confirm read from the employee and confirm read and
-- signed from the supervisor". Those are different acts:
--
--   * The supervisee acknowledges having read it. They are not agreeing with
--     it, and a record that conflates the two turns "I have seen this" into
--     evidence of consent to a performance judgement.
--   * The supervisor signs it, which closes the note. After that it is a
--     record of what was said at the time, not a document that keeps moving.
--
-- So: two timestamp pairs, and a trigger that freezes the content once signed.

create table if not exists supervision_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,

  kind text not null check (kind in ('clinician', 'client')),

  -- The person being supervised. Always present: even a client-supervision
  -- note is supervision OF someone.
  supervisee_id uuid not null references profiles(id) on delete restrict,
  -- The child whose programming was observed. Required for 'client', and
  -- refused for 'clinician' so a performance note cannot quietly carry a
  -- client id into HR.
  client_id bigint references clients(id) on delete set null,

  supervisor_id uuid not null references profiles(id) on delete restrict,

  occurred_on date not null default current_date,
  -- Where the supervision happened, and how. Free text: the shapes a clinic
  -- uses here vary and a check constraint would be guessing at them.
  setting text,

  observations text not null,
  action_items text,
  next_steps text,

  -- Confirm-read by the supervisee. Never set by anyone else - the policy
  -- below only lets them write their own.
  acknowledged_at timestamptz,

  -- Signed by the supervisor. Closes the note.
  signed_at timestamptz,
  signed_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint supervision_notes_subject_matches_kind
    check ((kind = 'client') = (client_id is not null)),
  constraint supervision_notes_signature_complete
    check ((signed_at is null) = (signed_name is null))
);
create index if not exists supervision_notes_supervisee_idx
  on supervision_notes(supervisee_id, occurred_on desc);
create index if not exists supervision_notes_client_idx
  on supervision_notes(client_id, occurred_on desc) where client_id is not null;
create index if not exists supervision_notes_open_idx
  on supervision_notes(clinic_id, signed_at) where signed_at is null;

comment on constraint supervision_notes_subject_matches_kind on supervision_notes is
  'A client-supervision note names a client; a clinician-supervision note must '
  'not. Without this, a performance note could carry a client id into what is '
  'read as employment record.';

comment on column supervision_notes.acknowledged_at is
  'The supervisee confirming they have read it. Deliberately not agreement - '
  'conflating the two turns "I have seen this" into evidence of consent to a '
  'performance judgement.';

-- ---------------------------------------------------------------------------
-- Materials assigned in supervision
--
-- A module, a policy, a lesson-plan resource, or something with just a name
-- and a link. Read-confirmation is per assignment and per person, which is why
-- it is not a text field on the note.
-- ---------------------------------------------------------------------------
create table if not exists supervision_materials (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  note_id uuid not null references supervision_notes(id) on delete cascade,

  title text not null,
  -- What kind of thing it is, so the portal can link to it rather than only
  -- naming it.
  kind text not null default 'other'
    check (kind in ('training_module', 'policy', 'lesson_resource', 'reading', 'other')),
  -- Optional pointer at the thing itself, whichever table it lives in.
  reference_id text,
  url text,
  due_on date,

  -- The supervisee confirming they have read or completed it.
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists supervision_materials_note_idx on supervision_materials(note_id);

-- ---------------------------------------------------------------------------
-- A signed note stops changing
-- ---------------------------------------------------------------------------
create or replace function public.supervision_notes_freeze_signed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A supervisee may acknowledge their note. That is the ONLY thing they may
  -- change about it.
  --
  -- The UPDATE policy that lets them acknowledge necessarily admits the row,
  -- and RLS cannot restrict which columns an admitted row exposes. Without
  -- this branch a supervisee could rewrite the observations written about
  -- them and then acknowledge the version they preferred. Caught by a test
  -- that read the note back instead of trusting the affected-row count.
  if auth.uid() = old.supervisee_id and auth.uid() <> old.supervisor_id then
    if new.observations is distinct from old.observations
       or new.action_items is distinct from old.action_items
       or new.next_steps is distinct from old.next_steps
       or new.occurred_on is distinct from old.occurred_on
       or new.setting is distinct from old.setting
       or new.signed_at is distinct from old.signed_at
       or new.signed_name is distinct from old.signed_name
       or new.supervisor_id is distinct from old.supervisor_id
       or new.kind is distinct from old.kind then
      raise exception
        'A supervision note can be acknowledged by the person it is about, not edited by them.';
    end if;
    return new;
  end if;

  if old.signed_at is not null then
    -- The supervisee can still acknowledge a note after it is signed: reading
    -- it is the one thing that legitimately happens afterwards.
    if new.observations is not distinct from old.observations
       and new.action_items is not distinct from old.action_items
       and new.next_steps is not distinct from old.next_steps
       and new.signed_at is not distinct from old.signed_at
       and new.signed_name is not distinct from old.signed_name
       and new.occurred_on is not distinct from old.occurred_on then
      return new;
    end if;
    raise exception
      'This supervision note was signed on %. Signed notes cannot be edited; write a new one.',
      old.signed_at::date;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists supervision_notes_freeze on supervision_notes;
create trigger supervision_notes_freeze
  before update on supervision_notes
  for each row execute function public.supervision_notes_freeze_signed();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table supervision_notes enable row level security;
alter table supervision_materials enable row level security;

-- The supervisee reads their own notes, of either kind. Somebody being
-- supervised should never have to ask for a copy of what was written about
-- them.
drop policy if exists supervision_notes_own_read on supervision_notes;
create policy supervision_notes_own_read on supervision_notes for select
  using (supervisee_id = auth.uid() or supervisor_id = auth.uid());

-- And can acknowledge it. The UPDATE policy admits them; the trigger above is
-- what stops an acknowledgement from carrying an edit with it.
drop policy if exists supervision_notes_acknowledge on supervision_notes;
create policy supervision_notes_acknowledge on supervision_notes for update
  using (supervisee_id = auth.uid())
  with check (supervisee_id = auth.uid());

-- Supervisors and admins see their clinic's supervision. Gated on the HR
-- action rather than on a role name, so a clinic that grants supervision to
-- someone outside those two roles does not need a migration.
drop policy if exists supervision_notes_staff_read on supervision_notes;
create policy supervision_notes_staff_read on supervision_notes for select
  using (
    clinic_id = public.auth_clinic_id()
    and case kind
      when 'clinician' then public.auth_can('hr.supervision.manage')
      else public.auth_can('clinical.supervision.manage')
    end
  );

drop policy if exists supervision_notes_staff_write on supervision_notes;
create policy supervision_notes_staff_write on supervision_notes for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and case kind
      when 'clinician' then public.auth_can('hr.supervision.manage')
      else public.auth_can('clinical.supervision.manage')
    end
    -- A supervisor writes as themselves. Filing a note under someone else's
    -- name is the one thing a supervision record must not allow.
    and supervisor_id = auth.uid()
  );

drop policy if exists supervision_notes_staff_update on supervision_notes;
create policy supervision_notes_staff_update on supervision_notes for update
  using (clinic_id = public.auth_clinic_id() and supervisor_id = auth.uid()
         and case kind when 'clinician' then public.auth_can('hr.supervision.manage')
                       else public.auth_can('clinical.supervision.manage') end)
  with check (clinic_id = public.auth_clinic_id() and supervisor_id = auth.uid()
              and case kind when 'clinician' then public.auth_can('hr.supervision.manage')
                            else public.auth_can('clinical.supervision.manage') end);

drop policy if exists supervision_materials_read on supervision_materials;
create policy supervision_materials_read on supervision_materials for select
  using (exists (select 1 from public.supervision_notes n
                  where n.id = supervision_materials.note_id
                    and (n.supervisee_id = auth.uid() or n.supervisor_id = auth.uid()
                         or (n.clinic_id = public.auth_clinic_id()
                             and case n.kind
                               when 'clinician' then public.auth_can('hr.supervision.manage')
                               else public.auth_can('clinical.supervision.manage') end))));

drop policy if exists supervision_materials_write on supervision_materials;
create policy supervision_materials_write on supervision_materials for insert
  with check (exists (select 1 from public.supervision_notes n
                       where n.id = supervision_materials.note_id
                         and n.supervisor_id = auth.uid()));

-- The supervisee confirms a material they were assigned; nobody else can.
drop policy if exists supervision_materials_confirm on supervision_materials;
create policy supervision_materials_confirm on supervision_materials for update
  using (exists (select 1 from public.supervision_notes n
                  where n.id = supervision_materials.note_id
                    and n.supervisee_id = auth.uid()))
  with check (exists (select 1 from public.supervision_notes n
                       where n.id = supervision_materials.note_id
                         and n.supervisee_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- TWO actions, because 0024's schema refuses one
--
-- The first draft of this migration defined a single `hr.supervision.manage`
-- with exposes_phi AND exposes_hr_confidential both true, and
-- permission_actions_no_dual_exposure rejected it outright. The constraint was
-- right and the action was wrong.
--
-- Clinician supervision is an employment record: performance, development,
-- assigned learning. Client supervision is clinical record: a supervisor
-- observing a child's programming. An action that opened both would let
-- anybody who could review a therapist's performance also read the clinical
-- observations of every child that therapist works with, which is precisely
-- the boundary 0024 built that check to hold.
--
-- So the split the table already makes with `kind` is the split the
-- permissions make too, and the policies below gate on whichever matches.
-- ---------------------------------------------------------------------------
insert into permission_actions
  (action, domain, label, description, exposes_phi, exposes_hr_confidential)
values
  ('hr.supervision.manage', 'hr', 'Manage clinician supervision',
   'Write supervision notes about staff development and assign materials.',
   false, true),
  ('clinical.supervision.manage', 'clinical', 'Manage client supervision',
   'Write supervision notes observing a client''s programming.',
   true, false)
on conflict (action) do nothing;

insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, true
  from (values ('admin'), ('supervisor')) as r(role)
  cross join (values ('hr.supervision.manage'), ('clinical.supervision.manage')) as a(action)
on conflict do nothing;

-- Explicit false, matching 0024's precedent of stating the negative rather
-- than leaving it to auth_can()'s coalesce.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, false
  from (values ('clinician'), ('scheduler'), ('hr_admin'), ('payroll_admin'), ('client')) as r(role)
  cross join (values ('hr.supervision.manage'), ('clinical.supervision.manage')) as a(action)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- What a supervisee sees, and what a supervisor chases
-- ---------------------------------------------------------------------------
create or replace view my_supervision with (security_invoker = true) as
select
  n.id,
  n.kind,
  n.occurred_on,
  n.setting,
  n.observations,
  n.action_items,
  n.next_steps,
  n.acknowledged_at,
  n.signed_at,
  n.signed_name,
  n.supervisee_id,
  n.supervisor_id,
  n.client_id,
  (select count(*)::int from supervision_materials m where m.note_id = n.id) as materials,
  (select count(*)::int from supervision_materials m
    where m.note_id = n.id and m.confirmed_at is null)                       as materials_outstanding
from supervision_notes n;

comment on view my_supervision is
  'Supervision notes the caller can see: their own as supervisee, their own as '
  'supervisor, or their clinic''s if they hold the action matching the note''s '
  'kind - hr.supervision.manage for clinician supervision, '
  'clinical.supervision.manage for client supervision. '
  'security_invoker so those policies apply - see 0046.';
