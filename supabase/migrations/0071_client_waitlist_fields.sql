-- 0071 · clients: real waitlist triage fields
--
-- The Waitlist view (apps/scheduler/components/WaitlistView.tsx, this same
-- batch) shipped first with zero new columns - FIFO by created_at only,
-- showing session_type/location_id/days-waiting, all pre-existing data.
-- That was enough to see the queue, not enough to work it: a scheduler
-- triaging the list has no way to say "call this family back first" or
-- leave a note for the next person who opens this screen, and no contact
-- info is shown at all even though "should I call this person" is exactly
-- what this screen exists for. The account owner has now approved adding
-- those fields for real.
--
-- WHY ON `clients`, NOT A SEPARATE `waitlist_entries` TABLE
--
-- `clients.status = 'waitlist'` (see the column comment in migration 0000)
-- is already how this schema tracks waitlist membership - there is no
-- separate waitlist table, and one clinic-owner-approved feature request is
-- not the occasion to introduce one. contact_phone/contact_email/
-- referral_source are also plainly useful outside the waitlist window (a
-- client who has since been scheduled still has a phone number and a
-- referral source worth keeping), so they belong on the client record
-- itself and are editable from apps/scheduler/pages/admin.tsx's existing
-- Add/Edit Client form for that reason. waitlist_notes and
-- waitlist_priority are waitlist-specific in *purpose* but there is still
-- only ever one active waitlist entry per client in this schema's model
-- (one status column, not a history of entries), so they cost nothing kept
-- on the same row - if a client is re-added to the waitlist later, last
-- time's notes being visible again is a feature (continuity), not a bug,
-- and a scheduler can clear waitlist_notes by hand if that's ever wrong for
-- a given case.
--
-- ALL FOUR TEXT COLUMNS ARE NULLABLE
--
-- contact_phone/contact_email/referral_source/waitlist_notes are free text,
-- optional, and backfillable over time as staff talk to families - not
-- required to exist for every historical row. waitlist_priority is the one
-- exception: it gets a NOT NULL default so every existing and future row
-- has a defined tier and the Waitlist view's new "priority tier first,
-- oldest-created_at-first within each tier" sort (replacing plain FIFO) has
-- something to sort on for every row, including ones nobody has triaged
-- yet - 'normal' is the correct default for "not yet triaged", not 'low'.
--
-- NO RLS CHANGES
--
-- clients already carries clinic_id and clinic-scoped, per-command RLS
-- policies from migration 0013 (root CLAUDE.md's "every PHI table carries
-- clinic_id and RLS policies" is already true for this table). Those
-- policies are row-level, not column-level, so they already cover every
-- column added here with no further changes - a plain `alter table ...
-- add column` is the whole migration.

alter table clients add column if not exists contact_phone text;
alter table clients add column if not exists contact_email text;
alter table clients add column if not exists referral_source text;
alter table clients add column if not exists waitlist_notes text;
alter table clients add column if not exists waitlist_priority text
  not null default 'normal';

-- Constraint added separately (rather than inline on the column) so a
-- rerun of this migration against a database that already has the column
-- from a partial apply doesn't choke re-adding it - `add column if not
-- exists` is idempotent on its own, but a constraint has no `if not
-- exists` form, so it's guarded explicitly instead.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_waitlist_priority_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table clients add constraint clients_waitlist_priority_check
      check (waitlist_priority in ('high', 'normal', 'low'));
  end if;
end $$;
