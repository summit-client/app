-- ============================================================================
-- 0089 · Describe `leads`, which has existed in production and in no migration
--
-- WHAT WAS WRONG
--
-- `leads` holds 12 rows of personal data - full name, email, the clinic they
-- say they represent, their role - and appears in no migration in this repo.
-- Nobody reviewed its columns, nothing could reason about it, and
-- `supabase/tests/tenancy.mjs` could not see it at all: every check there was
-- written about tables that HAVE a clinic_id, so a table without one was
-- invisible to the suite meant to enforce clinic scoping. Found 2026-09-19 by
-- schema_drift.mjs, which compares this repo against production (issue #201).
--
-- IT IS NOT LEAKING, AND THAT IS PARTLY LUCK
--
-- RLS is enabled and there are ZERO policies, so PostgREST denies every read
-- and write through the API. But nothing says that was intended - the table
-- simply never got policies. A `create policy` written casually later opens
-- it, and nothing in review would flag that, because there is no recorded
-- decision to contradict.
--
-- The writes work because `apps/web/pages/api/leads/create.js` uses the
-- SERVICE ROLE key, which bypasses RLS entirely. That is the correct shape for
-- a public marketing form - there is no session to act as - and it is why the
-- deny-all has never been noticed.
--
-- WHY NO clinic_id
--
-- A lead is a PROSPECTIVE clinic. There is no tenant to scope it to yet; the
-- `clinic_name` column is free text somebody typed into a marketing form, not
-- a reference to a `clinics` row. This is the one shape where "every table
-- carries clinic_id" genuinely does not apply, which is exactly why it has to
-- be written down rather than left as an absence.
--
-- WHAT THIS DOES
--
-- Nothing to the data. `create table if not exists` matches what is already
-- there, so this is a no-op against production and gives a database rebuilt
-- from this repo the same table. Then it makes the deny-all EXPLICIT, so the
-- lock is a decision visible in `pg_policies` rather than an empty space.
-- ============================================================================

begin;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  -- NOT NULL, measured against production. The form requires all three;
  -- schema_drift.mjs caught this file declaring them nullable on the first
  -- run after it was written, which is the suite doing its job on its author.
  full_name text not null,
  clinic_name text not null,
  email text not null,
  role text,
  source text,
  status text,
  created_at timestamptz default now()
);

alter table public.leads enable row level security;

comment on table public.leads is
  'Public marketing signups from apps/web. A lead is a PROSPECTIVE clinic, so '
  'it has no clinic_id and cannot: clinic_name is free text from a form, not a '
  'reference. Written only by the service role (apps/web/pages/api/leads/'
  'create.js); no API role may read it. See 0089.';

-- Explicit, per command, so the refusal is something a reader of pg_policies
-- can see and a future session has to argue with rather than simply not
-- notice. `using (false)` is what the empty policy list already meant - this
-- only says so out loud. Deletes stay denied by default, as everywhere in
-- this schema.
drop policy if exists leads_no_api_read on public.leads;
create policy leads_no_api_read on public.leads for select using (false);

drop policy if exists leads_no_api_insert on public.leads;
create policy leads_no_api_insert on public.leads for insert with check (false);

drop policy if exists leads_no_api_update on public.leads;
create policy leads_no_api_update on public.leads for update using (false);

commit;

-- ============================================================================
-- NOT DONE HERE: the three `mock_data_*` tables, which are also undescribed
-- and also carry zero policies. Dropping them is destructive and is 0090,
-- held for the account owner's approval - they are empty today but this
-- session cannot prove nothing writes to them.
-- ============================================================================
