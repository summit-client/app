-- 0035 · Client (family) <-> care-team messaging
--
-- apps/client's sidebar has had a "Messages" entry marked "Soon" since the
-- portal's first pass (components/Sidebar.tsx). This is the schema behind
-- it: a family sends a message to their child's care team and sees replies,
-- one thread per client. Poll-on-load / manual refresh for v1, per product
-- direction — nothing here assumes realtime.
--
-- THE MESSAGING-CONTENT / PHI QUESTION, SETTLED UP FRONT
--
-- Message bodies are free text about a specific client's care, written by
-- the client's own family or their clinical team. That is PHI by the same
-- reasoning session_notes and programs are (0001, 0020): every hard
-- constraint in CLAUDE.md that applies to those applies here — clinic_id +
-- per-command RLS from creation (this migration), never `for all`, and
-- (application-layer, noted for whoever builds the reply UI in apps/data)
-- never routed through a third-party model without a signed agreement —
-- this is plain messaging, no AI summarization anywhere near it, and it
-- should stay that way unless that constraint is checked again first.
--
-- ONE THREAD PER CLIENT, NOT A SEPARATE threads TABLE
--
-- "A simple threaded conversation view scoped to that client's own care
-- team" — v1 has exactly one conversation per client, so client_id already
-- *is* the thread key. A separate client_message_threads table would add a
-- join for no behavioural difference yet. If multiple topics per family
-- becomes a real requirement, that is a later migration adding a
-- thread_id — additive, not a rewrite of what is here.
--
-- WHY STAFF ACCESS IS CLINIC-WIDE, NOT PER-ASSIGNED-CLINICIAN
--
-- The task framing for this feature describes staff access as scoped to
-- "the assigned clinician(s)/staff ... for their own clients". That
-- assignment concept does not exist anywhere in this schema to scope to —
-- migration 0014's header already established this exact point for
-- clients/sessions ("there is no clinician-to-client assignment concept
-- anywhere in this schema") and every clinical table since (programs,
-- session_notes, client_budgets, ...) grants clinic-wide staff access
-- instead, not per-clinician. `staff` (the schedulable resource) still has
-- no `user_id` linking it to an auth account (0000's header, confirmed
-- again by 0026's "staff_id/user_id gap"), so there is no column to key a
-- narrower policy on even if one were wanted here alone. This migration
-- follows the same precedent rather than inventing a one-off assignment
-- model for messaging specifically: any clinical staff role that can read
-- clients (auth_is_staff()'s admin/supervisor/clinician) can read and send
-- in any of their clinic's client threads. If per-clinician caseload
-- restriction ever becomes a real product requirement, it is a schema
-- change (an assignment table) that every clinical table would want, not
-- something to solve narrowly for messages.
--
-- ACTION-BASED, PER 0024
--
-- 0024's header is explicit: "New tables from here on use auth_can() from
-- the start". Two new actions, clinical.message.read / .write, granted to
-- admin/supervisor/clinician (the clinical.* set every other clinical
-- action already goes to) and explicitly withheld from scheduler/hr_admin/
-- payroll_admin, matching the explicit-false pattern 0024 used for the
-- HR-only roles' clinical actions. `client` gets no auth_can() grant at
-- all — same as every other client-facing table, the family's access is a
-- direct role check (auth_role() = 'client' and client_id =
-- auth_client_row_id()), not an action in this catalogue, per 0024's own
-- note on why: "a family's access is not an action they perform on the
-- organization's data; it is a read of their own file".
--
-- clinic_id INTEGRITY
--
-- 0013's header flags a real, still-open gap: nothing stops a row's
-- clinic_id from being written to clinic A while its client_id points at a
-- client in clinic B. Rather than trust every future insert site (today
-- just this migration's PR, eventually the apps/data reply UI too) to get
-- that right, a BEFORE INSERT trigger derives clinic_id from the client's
-- own row and overwrites whatever was submitted — the column cannot
-- disagree with client_id by construction, the same "derive, don't trust
-- the payload" shape 0025 uses for organization_events' subject_type.
--
-- NOT APPLIED. Per this session's constraints, the Supabase MCP available
-- here is read-only — a human with database access must run this migration
-- before apps/client's Messages page has anything to read or write against.
-- ============================================================================

create table if not exists client_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  client_id bigint not null references clients(id) on delete cascade,

  -- Who sent it. Both columns are overwritten by the trigger below on every
  -- insert, never trusted from the request — see the trigger's own comment.
  sender_user_id uuid not null references auth.users(id),
  sender_role user_role not null,

  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);
create index if not exists client_messages_client_idx on client_messages(client_id, created_at);
create index if not exists client_messages_clinic_idx on client_messages(clinic_id);

-- Derives clinic_id from the client being messaged (see header) and pins
-- sender_user_id/sender_role to the actual caller, so neither the RLS with
-- check clauses below nor an app bug can be bypassed by an insert payload
-- that names someone else as the sender.
create or replace function public.client_messages_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  client_clinic uuid;
begin
  select clinic_id into client_clinic from public.clients where id = new.client_id;
  if client_clinic is null then
    raise exception 'Client % has no clinic_id on file', new.client_id;
  end if;

  new.clinic_id := client_clinic;
  new.sender_user_id := auth.uid();
  new.sender_role := public.auth_role()::user_role;
  return new;
end $$;

drop trigger if exists client_messages_before_insert on client_messages;
create trigger client_messages_before_insert
  before insert on client_messages
  for each row execute function public.client_messages_before_insert();

-- No update/delete policy is added below, which under RLS means neither is
-- possible for anyone — a message thread is a record of what was actually
-- said, not something either side edits after the fact. Consistent with
-- "RLS policies are written per command, never for all" and the
-- deny-by-default posture that already holds across this schema.
alter table client_messages enable row level security;

-- Families: their own child's thread only, read and send.
create policy client_messages_client_read on client_messages for select
  using (public.auth_role() = 'client' and client_id = public.auth_client_row_id());

create policy client_messages_client_write on client_messages for insert
  with check (public.auth_role() = 'client' and client_id = public.auth_client_row_id());

-- Care-team staff: clinic-wide, gated on the new actions — see header for
-- why this is clinic-wide rather than per-assigned-clinician.
create policy client_messages_staff_read on client_messages for select
  using (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.read'));

create policy client_messages_staff_write on client_messages for insert
  with check (clinic_id = public.auth_clinic_id() and public.auth_can('clinical.message.write'));

-- ---------------------------------------------------------------------------
-- Permission catalogue + role matrix (see header's "ACTION-BASED" note)
-- ---------------------------------------------------------------------------
insert into permission_actions (action, domain, label, description, exposes_phi, exposes_hr_confidential) values
  ('clinical.message.read',  'clinical', 'Read care messages', 'Read a client family''s messages with the care team.', true, false),
  ('clinical.message.write', 'clinical', 'Send care messages',  'Reply to a client family in the care-team thread.', true, false)
on conflict (action) do nothing;

insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, true
  from (values ('admin'), ('supervisor'), ('clinician')) as r(role)
  cross join (values ('clinical.message.read'), ('clinical.message.write')) as a(action)
on conflict do nothing;

-- Explicit false, matching 0024's own precedent of stating the negative
-- rather than leaving it implicit in auth_can()'s coalesce-to-false. None of
-- these three roles are the clinical care team a family is messaging.
insert into role_permissions (clinic_id, role, action, granted)
select null, r.role, a.action, false
  from (values ('scheduler'), ('hr_admin'), ('payroll_admin'), ('client')) as r(role)
  cross join (values ('clinical.message.read'), ('clinical.message.write')) as a(action)
on conflict do nothing;
