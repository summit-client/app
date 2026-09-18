-- ============================================================================
-- 0086 · A credential is a row in a catalogue, verified by someone else
--
-- WHAT IS WRONG TODAY
--
-- 1. THREE VOCABULARIES, NONE OF THEM AUTHORITATIVE.
--
--      apps/employee/lib/credentials.ts   7 kinds with issuers and CE rules:
--                                         BCBA, BCaBA, RBT, ONT_RBA,
--                                         IBA_PRECERT, IBA_RECERT, IBT
--      apps/scheduler/lib/staff-roles.ts  4: BCBA, BCaBA, RBT, "Supervisor"
--                                         - and "Supervisor" is not a
--                                         credential, it is a thing a
--                                         credentialled person may also do
--      employee_credentials.credential    free text, constrained by nothing
--      staff.role                         a fourth copy, written from the
--                                         scheduler admin page's 4-item list
--
-- 2. A PERSON CAN AWARD THEMSELVES A CREDENTIAL, AND IT REACHES A BILL.
--
--    `credentials_own_update` (0007) lets a user update their own
--    `employee_credentials` row, every column, including `status`. Migration
--    0034's receipt view then does this:
--
--      left join lateral (
--        select ec.credential, ec.credential_number
--          from employee_credentials ec
--         where ec.user_id = er.user_id
--           and ec.status = 'GOOD_STANDING'
--           and ec.credential_number is not null
--         order by ec.cycle_end desc limit 1) cred on true
--
--    So a self-set GOOD_STANDING puts a self-entered credential number on a
--    client's receipt, under a clinician's name, as the clinic's assertion of
--    who delivered the service. Nothing anywhere checks it. That is the
--    finding this migration exists for; the vocabulary work is what makes the
--    fix expressible.
--
-- WHAT THIS DOES
--
--   1. `credential_types` - a clinic's own catalogue, seeded from the seven
--      real kinds, with the Admin console able to add, edit and retire them.
--   2. `employee_credentials.credential_type_id` - the pointer, backfilled,
--      with `credential` kept in agreement in both directions exactly as 0085
--      does for `sessions.type` (0034's receipt view reads the text, and is
--      not rewritten here).
--   3. Verification. A credential a person entered themselves is PENDING. It
--      becomes GOOD_STANDING only when SOMEONE ELSE says so, and that person
--      and the moment are recorded on the row.
--   4. `staff.role` dropped.
--   5. `session_types.is_intake`, retiring three literal "Assessment" matches.
--   6. `clients.session_type_id`, the same shape as 0085.
--
-- THE RULE THAT MAKES (3) WORK, AND IT IS ONE LINE
--
--   A credential may not be verified by the person it belongs to.
--
-- Not "an admin may not self-verify" - NOBODY may, whatever role they hold,
-- because the trigger compares `auth.uid()` to the row's `user_id` and needs
-- no role check at all. An admin who is also a BCBA gets their credential
-- verified by another admin or by their supervisor, the same as everyone.
--
-- Verification is a human act: the supervisor looks the number up on the
-- issuer's register themselves, and ticking the box IS the statement that
-- they did. Nothing here calls out to bacb.com or anywhere else. That is why
-- `verified_by` and `verified_at` are recorded - the approval has to be
-- attributable to a person, because the person is the check.
--
-- A NEW ACTION, AND WHY NOT AN EXISTING ONE
--
-- `hr.record.write` ("Amend employment, credential and document records")
-- looks like the right gate and is not: 0024 grants it to admin and hr_admin
-- ONLY. A supervisor - the person the product asks to do this - does not hold
-- it, and would have got a screen that refuses them, which on this schema
-- means an empty one (see CLAUDE.md, "RLS returns empty sets, not errors").
-- Widening `hr.record.write` to supervisors would hand them every employment
-- and document record in the clinic, which 0024 deliberately withheld.
--
-- So: `hr.credential.verify`, narrow, seeded to admin, supervisor and
-- hr_admin. Scheduler does not get it, and that matters - `hub_can_manage()`
-- admits schedulers (0022), so without a separate action a scheduler would
-- have been able to sign off clinical credentials.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * It does not migrate `staff.role` into `employee_credentials`. That
--     column is unverified free text typed into a scheduling screen, and
--     copying it into the credential of record would launder it straight into
--     the receipt join above - exactly what (2) is about. The values are
--     REPORTED below and then the column goes. Everyone affected appears in
--     the Admin console's queue as having no credential on record, which is
--     true, and a supervisor enters the real one with its number.
--
--     Nobody's bookings change: `isClinicalStaff()` is two-sided (credential
--     OR capacity > 0), staff created through the scheduler's admin page
--     carry capacity 20, and staff created by `invite-teammate` already have
--     null role and 0 capacity, so they were already false on both halves.
--
--   * It does not touch `credentials_own_update`. Kept on purpose - a person
--     must be able to enter and correct their own credential. What changes is
--     that doing so cannot set `status`, and re-entering a number after
--     verification drops the row back to PENDING.
--
--   * It does not rewrite 0034's receipt view or 0029/0031. Same reasoning as
--     0085: the text stays true, so the joins stay correct.
--
-- NOT APPLIED by the session that wrote it. Verification queries at the end.
-- The Supabase MCP was unavailable in that session, so every premise here
-- comes from this repo's migration history rather than from `pg_policies` -
-- and CLAUDE.md is emphatic that those two have diverged before. Run the
-- PRE-FLIGHT block first; it checks the four assumptions that would matter.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Cheap, and it fails loudly rather than half-applying.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'employee_credentials'
                    and column_name = 'credential') then
    raise exception '0086: employee_credentials.credential is missing - this schema is not what 0007 describes';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'staff'
                    and column_name = 'user_id') then
    raise exception '0086: staff.user_id is missing - 0075 has not been applied, and isClinicalStaff cannot be repointed without it';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'auth_can') then
    raise exception '0086: public.auth_can() is missing - 0024 has not been applied';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clients'
                    and column_name = 'session_type') then
    raise notice '0086: clients.session_type is absent - step 6 will be a no-op, which is fine';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The catalogue.
--
--    Clinic-scoped from the start, per CLAUDE.md: "only one clinic exists
--    today" is never a reason to skip it. `code` is the stable identifier a
--    clinic's own rows are keyed on; `label` is what a person reads and may
--    be edited freely.
--
--    `verification_url` is seeded NULL for every type, deliberately. The
--    issuers' public registers move, and a stale deep link baked into every
--    clinic's data is worse than an empty field the Admin console asks an
--    admin to fill in once.
-- ---------------------------------------------------------------------------
create table if not exists credential_types (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  code text not null,
  label text not null,
  issuer text,
  -- Where a verifier looks a number up. Shown on the verification screen.
  verification_url text,
  -- Most regulators issue a number; a few do not. Drives whether the Admin
  -- console's queue treats "no number" as incomplete.
  requires_number boolean not null default true,
  -- Retired rather than deleted: an existing employee_credentials row keeps
  -- pointing at it, and 0034's receipts keep resolving.
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint credential_types_code_per_clinic unique (clinic_id, code)
);

create index if not exists credential_types_clinic_idx on credential_types (clinic_id);

comment on table credential_types is
  'A clinic''s professional credential vocabulary (0086). employee_credentials '
  'points here instead of holding free text. Seeded from the seven kinds '
  'apps/employee/lib/credentials.ts carries CE rules for; a clinic may add its '
  'own, and retires one with is_active = false rather than deleting it.';

alter table credential_types enable row level security;

-- Read: anyone in the clinic. The catalogue is a dropdown, not a confidence -
-- an employee has to pick their own credential from it.
drop policy if exists credential_types_read on credential_types;
create policy credential_types_read on credential_types for select
  using (clinic_id = auth_clinic_id());

-- Write: admin only, per command, never `for all` (CLAUDE.md).
drop policy if exists credential_types_admin_insert on credential_types;
create policy credential_types_admin_insert on credential_types for insert
  with check (clinic_id = auth_clinic_id() and public.auth_can('admin.staff.manage'));

drop policy if exists credential_types_admin_update on credential_types;
create policy credential_types_admin_update on credential_types for update
  using (clinic_id = auth_clinic_id() and public.auth_can('admin.staff.manage'))
  with check (clinic_id = auth_clinic_id() and public.auth_can('admin.staff.manage'));

drop policy if exists credential_types_admin_delete on credential_types;
create policy credential_types_admin_delete on credential_types for delete
  using (clinic_id = auth_clinic_id() and public.auth_can('admin.staff.manage'));

-- The seed. Every clinic gets the same seven; `on conflict do nothing` makes
-- this safe to re-run and safe for a clinic that already added one by hand.
insert into credential_types (clinic_id, code, label, issuer, requires_number, sort_order)
select c.id, v.code, v.label, v.issuer, v.requires_number, v.sort_order
  from clinics c
  cross join (values
    ('BCBA',        'BCBA / BCBA-D',            'BACB',  true, 10),
    ('BCaBA',       'BCaBA',                    'BACB',  true, 20),
    ('RBT',         'RBT',                      'BACB',  true, 30),
    ('ONT_RBA',     'Ontario RBA (CPBAO)',      'CPBAO', true, 40),
    ('IBA_PRECERT', 'IBA (pre-certification)',  'IBAO',  true, 50),
    ('IBA_RECERT',  'IBA (recertification)',    'IBAO',  true, 60),
    ('IBT',         'IBT',                      'IBAO',  true, 70)
  ) as v(code, label, issuer, requires_number, sort_order)
on conflict (clinic_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The pointer, and `credential` kept true on both sides.
--
--    Identical in shape to 0085: the id is the identity, the text is a label
--    that 0034's receipt view still reads, and two triggers keep them in
--    agreement - one on write, one on a rename of the catalogue row.
-- ---------------------------------------------------------------------------
alter table employee_credentials
  add column if not exists credential_type_id uuid
  references credential_types(id) on delete set null;

create index if not exists employee_credentials_type_idx
  on employee_credentials (credential_type_id);

comment on column employee_credentials.credential_type_id is
  'The catalogue row this credential IS (0086). `credential` is that row''s '
  'code, kept in agreement by credentials_apply_type and '
  'credential_types_propagate_code. Null means the text matched no catalogue '
  'entry in this clinic - read `credential`, and expect the Admin console''s '
  'queue to ask someone to resolve it.';

update employee_credentials ec
   set credential_type_id = ct.id
  from credential_types ct
 where ct.clinic_id = ec.clinic_id
   and ct.code = ec.credential
   and ec.credential_type_id is null;

create or replace function public.apply_credential_type_code() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_code text;
declare v_clinic uuid;
begin
  if new.credential_type_id is null then
    return new;
  end if;

  select ct.code, ct.clinic_id into v_code, v_clinic
    from public.credential_types ct
   where ct.id = new.credential_type_id;

  if v_code is null then
    raise exception 'credential_type_id % does not exist', new.credential_type_id;
  end if;

  if v_clinic is distinct from new.clinic_id then
    raise exception 'credential clinic_id (%) does not match its credential type''s clinic (%)',
      new.clinic_id, v_clinic;
  end if;

  new.credential := v_code;
  return new;
end $$;

create or replace function public.propagate_credential_type_code() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.employee_credentials ec
     set credential = new.code
   where ec.credential_type_id = new.id
     and ec.credential is distinct from new.code;
  return null;
end $$;

drop trigger if exists credential_types_propagate_code on public.credential_types;
create trigger credential_types_propagate_code after update on public.credential_types
  for each row when (old.code is distinct from new.code)
  execute function public.propagate_credential_type_code();

-- ---------------------------------------------------------------------------
-- 3. Verification.
--
--    Three columns and one rule. The columns exist because the approval has
--    to be attributable: the verifier is the check, so the record has to say
--    who they were.
-- ---------------------------------------------------------------------------
alter table employee_credentials
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text;

comment on column employee_credentials.verified_by is
  'Who confirmed this credential against the issuer''s register (0086). Their '
  'tick IS the verification - nothing in this system contacts an issuer - so '
  'the row records which person made the claim. Never the credential holder: '
  'enforced by credentials_verification_guard, for every role.';

-- The new action.
insert into permission_actions (action, domain, label, description, exposes_phi, exposes_hr_confidential)
values ('hr.credential.verify', 'hr', 'Verify credentials',
        'Confirm a colleague''s professional credential against the issuer''s register.',
        false, false)
on conflict (action) do nothing;

insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, 'hr.credential.verify', true
  from (values ('admin'), ('supervisor'), ('hr_admin')) as r(role)
on conflict do nothing;

-- Explicitly denied, rather than merely absent, for the roles that must not
-- hold it. `scheduler` is the one that matters: hub_can_manage() admits it
-- (0022), so without this the "whose credential" half below would pass.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, 'hr.credential.verify', false
  from (values ('scheduler'), ('clinician'), ('client'), ('payroll_admin')) as r(role)
on conflict do nothing;

-- Managers may now UPDATE, not only SELECT. 0007 gave `credentials_manage`
-- for select alone, so there has never been a way for anyone but the holder
-- to touch these rows.
--
-- Two halves, and they answer different questions:
--   auth_can('hr.credential.verify')  - may you verify at all
--   hr.record.read OR hub_can_manage  - whose: clinic-wide for admin and
--                                       hr_admin, own team for a supervisor
drop policy if exists credentials_verify_update on employee_credentials;
create policy credentials_verify_update on employee_credentials for update
  using (
    clinic_id = auth_clinic_id()
    and public.auth_can('hr.credential.verify')
    and (public.auth_can('hr.record.read') or public.hub_can_manage(user_id))
  )
  with check (
    clinic_id = auth_clinic_id()
    and public.auth_can('hr.credential.verify')
    and (public.auth_can('hr.record.read') or public.hub_can_manage(user_id))
  );

-- The guard. Runs for everybody, including admins, including service-role
-- writes that carry an auth.uid().
create or replace function public.guard_credential_verification() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid();
declare v_material_change boolean;
begin
  -- A backend job or a migration running with no JWT is not somebody
  -- self-verifying. Leave those alone; RLS is what stops a user reaching
  -- this path without an identity.
  if v_actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Nobody enters a credential that is already verified, not even for
    -- someone else: the flow is enter, then confirm, so the confirmation is
    -- always a separate, attributable act.
    new.status := 'PENDING';
    new.verified_by := null;
    new.verified_at := null;
    return new;
  end if;

  -- Did the substance change? Re-entering a number or moving a cycle
  -- invalidates an earlier confirmation - the verifier checked the OLD
  -- number against the register, not this one.
  v_material_change :=
       new.credential_type_id is distinct from old.credential_type_id
    or new.credential        is distinct from old.credential
    or new.credential_number is distinct from old.credential_number
    or new.cycle_start       is distinct from old.cycle_start
    or new.cycle_end         is distinct from old.cycle_end;

  if v_material_change then
    new.status := 'PENDING';
    new.verified_by := null;
    new.verified_at := null;
    return new;
  end if;

  -- Status moving to GOOD_STANDING is the verification itself.
  if new.status = 'GOOD_STANDING' and old.status is distinct from 'GOOD_STANDING' then
    if v_actor = new.user_id then
      raise exception 'a credential cannot be verified by the person it belongs to'
        using errcode = 'insufficient_privilege';
    end if;
    new.verified_by := v_actor;
    new.verified_at := now();
    return new;
  end if;

  -- Anything else (LAPSED, a note, supervisor_status) leaves the existing
  -- verification record exactly as it stands. It cannot be forged either:
  -- these two columns are only ever written by the branch above.
  new.verified_by := old.verified_by;
  new.verified_at := old.verified_at;
  return new;
end $$;

comment on function public.guard_credential_verification() is
  'Makes a credential''s status something somebody else asserted (0086). '
  'Entering or amending a credential sets PENDING; moving to GOOD_STANDING '
  'stamps the verifier, and is refused when the verifier is the holder - for '
  'every role, admin included.';

-- Name sorts before nothing else on this table today, but the apply-code
-- trigger has to run FIRST so the guard compares a settled `credential`.
drop trigger if exists credentials_apply_type on public.employee_credentials;
create trigger credentials_apply_type before insert or update on public.employee_credentials
  for each row execute function public.apply_credential_type_code();

drop trigger if exists credentials_verification_guard on public.employee_credentials;
create trigger credentials_verification_guard before insert or update on public.employee_credentials
  for each row execute function public.guard_credential_verification();

-- Existing rows. Every one of them is a self-assertion, because until this
-- migration there was no other kind - so none of them is verified, and the
-- Admin console's queue is where they get resolved. This is the one step
-- here that takes something away from a live screen, and it is the point of
-- the migration: a number nobody checked should not be printing on a receipt.
update employee_credentials
   set status = 'PENDING'
 where status = 'GOOD_STANDING';

do $$
declare v_n bigint;
begin
  select count(*) into v_n from employee_credentials where status = 'PENDING';
  raise notice '0086: % credentials now await verification. Until a supervisor or admin confirms each one, 0034''s receipts carry no credential number for that person.', v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. `staff.role` goes.
--
--    Reported before it is dropped, because the report is the only record
--    that survives. See the header for why the values are NOT migrated into
--    employee_credentials.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'staff' and column_name = 'role') then
    for r in
      execute 'select coalesce(role, ''(null)'') as role, count(*) as n,
                      string_agg(name, '', '' order by name) as people
                 from public.staff group by coalesce(role, ''(null)'') order by n desc'
    loop
      raise notice '0086: staff.role %  x%  -> %', r.role, r.n, r.people;
    end loop;
  end if;
end $$;

-- `my_care_team()` (0056) reads `staff.role` and publishes it to FAMILIES as
-- the clinician's job title - "A free-text job title, not a permission", in
-- that migration's own words. That is a second, unrelated meaning the column
-- carried, and it is the one thing dropping it would quietly break: the
-- function is `security definer`, so Postgres does not refuse the drop on its
-- account, and a family's care-team card would have started erroring instead.
--
-- Republished onto `hub_employee_profiles.job_title`, which is what a job
-- title actually is on this schema (0006) and what 0026's own reporting
-- already reads. Reached through `staff.user_id` (0075/0080); a staff row with
-- no linked account shows no title, exactly as a null `staff.role` did.
--
-- Everything else about this function is unchanged: same signature, same
-- return shape, same guardian permission gate, same derivation from sessions.
create or replace function public.my_care_team()
returns table (
  client_id bigint,
  staff_id bigint,
  staff_name text,
  staff_role text,
  sessions_delivered integer,
  last_seen_on date,
  next_on date
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    s.client_id,
    st.id,
    st.name,
    -- A free-text job title, not a permission and not a credential. Null
    -- where the clinic has not set one, which the portal renders as nothing
    -- rather than as "Unknown".
    hp.job_title,
    count(*) filter (where s.status = 'completed')::integer,
    max(s.session_date) filter (where s.session_date <= current_date),
    min(s.session_date) filter (
      where s.session_date >= current_date and s.status = 'scheduled')
  from public.sessions s
  join public.staff st on st.id = s.employee_id
  left join public.hub_employee_profiles hp on hp.user_id = st.user_id
  where s.client_id in (select public.auth_accessible_client_ids())
    -- The same permission that governs seeing the appointments these are
    -- derived from. A guardian who may not see the calendar should not learn
    -- the clinician's name from a different page.
    and public.auth_guardian_can(s.client_id, 'view_appointments')
    -- A cancelled session says nothing about who works with this child.
    and s.status <> 'cancelled'
  group by s.client_id, st.id, st.name, hp.job_title
$$;

comment on function public.my_care_team() is
  'The people who have actually delivered or are scheduled to deliver this '
  'family''s sessions, with name and job title only (0056). Republished by '
  '0086 to read hub_employee_profiles.job_title, since staff.role - which it '
  'used as a job title - is gone.';

alter table staff drop column if exists role;

-- ---------------------------------------------------------------------------
-- 5. `session_types.is_intake`.
--
--    Three places in apps/scheduler match a session type's name against the
--    literal 'Assessment': the waitlist prefill, the multi-client waitlist
--    filter, and the auto-promotion that moves a waitlisted child to active
--    once their assessment is booked. All three are asking "is this the
--    intake visit", which nothing recorded.
--
--    Seeded from the same literal, once, so behaviour is unchanged on the
--    day this applies. From here it is a checkbox an admin owns.
-- ---------------------------------------------------------------------------
alter table session_types add column if not exists is_intake boolean not null default false;

comment on column session_types.is_intake is
  'This type is the intake/assessment visit: booking one promotes a waitlisted '
  'client to active, and waitlisted clients are offered for it (0086). Seeded '
  'from the literal name ''Assessment'', which is what the app matched on '
  'before this column existed.';

update session_types set is_intake = true
 where is_intake = false and lower(name) like '%assessment%';

-- ---------------------------------------------------------------------------
-- 6. `clients.session_type` -> `clients.session_type_id`.
--
--    The waitlist's "what service does this child need", the same shape of
--    bug 0085 fixed on `sessions`. Smaller stakes - no trigger, no billing
--    and no conflict check reads it - so it gets the pointer and the backfill
--    without 0085's two-way sync: the app resolves it by id and falls back to
--    the text, and nothing in the database joins on it.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'clients'
                and column_name = 'session_type') then

    alter table public.clients
      add column if not exists session_type_id bigint
      references public.session_types(id) on delete set null;

    execute $q$
      update public.clients c
         set session_type_id = st.id
        from public.session_types st
       where st.clinic_id = c.clinic_id
         and st.name = c.session_type
         and c.session_type_id is null
    $q$;

    comment on column public.clients.session_type_id is
      'The service this waitlisted client needs (0086). `session_type` is that '
      'row''s name, kept for display and for rows the backfill could not '
      'resolve. Resolve by id; fall back to the text.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICATION - run after the file above. These change nothing.
-- ============================================================================
--
-- 1. The catalogue exists, once per clinic.
--
-- select clinic_id, count(*) as types, count(*) filter (where is_active) as active
--   from public.credential_types group by clinic_id;
--
-- 2. How the credential backfill landed. `unmatched` are rows whose text is
--    not one of the seven codes - free text somebody typed. Expect a short
--    list or nothing.
--
-- select count(*) as total,
--        count(credential_type_id) as resolved,
--        count(*) filter (where credential_type_id is null) as unmatched
--   from public.employee_credentials;
--
-- select credential, count(*) from public.employee_credentials
--  where credential_type_id is null group by credential order by 2 desc;
--
-- 3. Nothing is verified yet, and no receipt carries a number until it is.
--    Both counts should agree.
--
-- select status, count(*) from public.employee_credentials group by status;
-- select count(*) as receipts_with_a_number
--   from public.receipt_lines where clinician_credential_number is not null;
--
-- 4. Self-verification is refused. Run as yourself, against your OWN
--    credential row - expect 'insufficient_privilege', NOT a success.
--
-- update public.employee_credentials set status = 'GOOD_STANDING'
--  where user_id = auth.uid();
--
-- 5. A supervisor holds the new action and a scheduler does not.
--
-- select role, action, granted from public.role_permissions
--  where action = 'hr.credential.verify' order by role;
--
-- 6. staff.role is gone and nobody lost their bookability. `bookable` counts
--    the people isClinicalStaff() still returns true for, via capacity.
--
-- select count(*) as staff_rows,
--        count(*) filter (where coalesce(capacity, 0) > 0) as bookable
--   from public.staff;
--
-- 7. The intake flag matches what the app used to match on.
--
-- select clinic_id, name, is_intake from public.session_types
--  where is_intake order by clinic_id, name;
-- ============================================================================
