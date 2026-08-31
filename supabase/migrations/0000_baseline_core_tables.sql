-- 0000 · Baseline DDL for the eight tables that predate this migration history
--
-- WHY THIS EXISTS
--
-- clients, staff, sessions, calendars, locations, session_types,
-- staff_availability and client_availability were created by hand in the
-- Supabase SQL editor before the repo had a migrations directory. Migration
-- 0001's own header says so ("attaches to the scheduler's existing tables"),
-- and 0013 says it again at length. Every migration since has ALTERed them
-- without any file in this repo ever having CREATEd them.
--
-- The practical consequence: `supabase db reset` against an empty database
-- fails on migration 0011, which adds a foreign key to `clients`. There is no
-- way to stand up a development, staging or disaster-recovery environment from
-- this repository. The production database is currently the only copy of the
-- shape of a third of the schema.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--
-- Every statement is `if not exists`, so against the live database this
-- migration is a no-op. It changes nothing that exists. Its whole purpose is
-- to give a fresh database something for 0011 and 0013 to attach to.
--
-- It is numbered 0000 because migrations run in filename order and these
-- tables have to exist before 0001 ALTERs profiles and 0011 adds foreign keys
-- to clients. Numbering it after the migrations that depend on it would look
-- tidy and fix nothing.
--
-- APPLYING THIS TO THE LIVE DATABASE
--
-- Production's migration history starts at 0001, so the CLI sees 0000 as a
-- version older than everything already applied. `supabase db push` skips
-- out-of-order versions by default; it needs `--include-all` to pick this one
-- up. Running it is safe (every statement is a no-op there) and recording it
-- keeps the live history and this repo in agreement, which is the point.
--
-- The column list is RECONSTRUCTED FROM APPLICATION CODE, not dumped from
-- production. Sources, all in this repo:
--
--   apps/scheduler/pages/index.jsx           inserts, updates and field reads
--   apps/scheduler/components/SessionTypeEditModal.jsx   the session_types form
--   apps/scheduler/components/calendar/*     calendar status transitions
--   apps/client/lib/admin-view-as.ts         client lookups
--   migrations 0011, 0013, 0016, 0018, 0019  every column added since
--
-- That means this is a best reconstruction, not a guarantee of parity. Types
-- and nullability of columns nothing in the codebase writes may differ from
-- production. Before trusting a fresh environment to behave like the live one,
-- someone with database access should run
--
--   pg_dump --schema-only -t clients -t staff -t sessions -t calendars \
--           -t locations -t session_types -t staff_availability \
--           -t client_availability
--
-- against production and reconcile it with this file. Until that has been
-- done, treat a database built from these migrations as good enough to
-- develop against and not yet proven as a restore target.
--
-- Two known ambiguities, left deliberately visible rather than guessed away:
--
--   session_types.duration vs duration_minutes, and price vs cost. The editor
--   modal WRITES `duration` and `price`; several read sites use
--   `duration_minutes ?? duration` and `cost ?? price`. A write-site is
--   stronger evidence than a defensive read, so `duration` and `price` are
--   what this file creates. If production also has the other pair, the reads
--   are load-bearing and this file is wrong about it.
--
--   sessions.hour / minute are separate integers rather than a time or a
--   timestamptz. That is what the scheduler writes and what every conflict
--   check reads, so it is reproduced here as-is. It is a poor representation
--   (no timezone, no way to express a session crossing midnight) and worth
--   changing, but a baseline file is the wrong place to change it.

-- ---------------------------------------------------------------------------
-- profiles, and the user_role enum behind it
--
-- profiles.role is NOT text. It is a Postgres enum named user_role, which
-- migration 0021 establishes beyond doubt: that migration is a single
-- `alter type user_role add value 'supervisor'`, and its header records the
-- live members it found — admin, scheduler, clinician, client, staff. Those
-- five are what this creates; 0021 adds the sixth.
--
-- 'staff' is a retired role that is still a live enum member. Postgres has no
-- clean way to drop a value from an enum, so retired-but-present values are
-- normal. It is included here because production has it, not because anything
-- should issue it. See the "One role vocabulary" section of CLAUDE.md.
--
-- 0001 ALTERs this table to add clinic_id and supervisor_id, so those live
-- there, not here; this creates only the pre-0001 shape.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'scheduler', 'clinician', 'client', 'staff');
  end if;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- locations · the clinic's physical sites
-- ---------------------------------------------------------------------------
create table if not exists locations (
  id bigint generated by default as identity primary key,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients · the people served. clinic_id and address are added by 0013 / 0018.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id bigint generated by default as identity primary key,
  name text not null,
  status text not null default 'active',   -- active | waitlist | inactive
  location_id bigint references locations(id),
  session_type text,                       -- the type this client is waitlisted for

  -- The family's portal login. Required by auth_client_row_id() in migration
  -- 0020, which is the whole basis of every client-role RLS policy:
  --   select id from clients where user_id = auth.uid()
  -- Nullable because most clients predate the portal and have no login.
  user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);
create unique index if not exists clients_user_id_unique
  on clients(user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- staff · the scheduler's own roster, distinct from profiles.
--
-- Worth naming plainly: `staff` and `profiles` both describe a worker, and
-- nothing joins them. profiles is the identity (an auth user, a role, a
-- supervisor); staff is a schedulable resource (a name, a capacity, a set of
-- specialties). A person who both logs in and gets booked has a row in each
-- with no link between them. Migration 0025 introduces the employment record
-- that finally reconciles the two; this file only records the shape as it
-- stands.
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id bigint generated by default as identity primary key,
  name text not null,
  role text,                               -- free text job title, not a permission
  specialties text[],                      -- session type names this person delivers
  capacity integer,                        -- sessions per calendar the matcher will fill
  location_id bigint references locations(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- session_types · the bookable service catalogue
--
-- The gap/increment/optional columns are added by 0019; only the pre-0019
-- shape is created here so that migration still has work to do.
-- ---------------------------------------------------------------------------
create table if not exists session_types (
  id bigint generated by default as identity primary key,
  name text not null,
  duration integer not null default 60,    -- minutes
  price numeric(10,2) not null default 0,
  max_clients integer not null default 1,
  color text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- calendars · a named scheduling period. Sessions belong to one.
-- ---------------------------------------------------------------------------
create table if not exists calendars (
  id bigint generated by default as identity primary key,
  name text not null,
  date_start date not null,
  date_end date not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sessions · the booking itself
--
-- location_id, is_home_visit and home_address are added by 0018; clinic_id by
-- 0013. recurrence_id groups sessions booked as one recurring series and is
-- deliberately not a foreign key: the scheduler writes a client-generated uuid
-- with no table behind it.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id bigint generated by default as identity primary key,
  client_id bigint references clients(id),
  employee_id bigint references staff(id),
  calendar_id bigint references calendars(id),
  session_date date not null,
  hour integer not null check (hour between 0 and 23),
  minute integer not null default 0 check (minute between 0 and 59),
  type text,                               -- session_types.name, denormalized
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  recurrence_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists sessions_date_idx on sessions(session_date);
create index if not exists sessions_client_idx on sessions(client_id, session_date);
create index if not exists sessions_employee_idx on sessions(employee_id, session_date);

-- ---------------------------------------------------------------------------
-- availability · when a person can be booked, by weekday name
--
-- `day` is a weekday NAME ('Monday'), not a number and not a date. That is
-- what the matcher compares against (apps/scheduler/pages/index.jsx,
-- staffAvailAt / clientAvailAt), and CalendarView's header comment says the
-- same. Left as text to match; a check constraint would be an improvement but
-- would also fail the migration if production holds any other spelling, which
-- this file cannot verify.
-- ---------------------------------------------------------------------------
create table if not exists staff_availability (
  id bigint generated by default as identity primary key,
  staff_id bigint not null references staff(id) on delete cascade,
  day text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);
create index if not exists staff_availability_staff_idx on staff_availability(staff_id);

create table if not exists client_availability (
  id bigint generated by default as identity primary key,
  client_id bigint not null references clients(id) on delete cascade,
  day text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);
create index if not exists client_availability_client_idx on client_availability(client_id);

-- ---------------------------------------------------------------------------
-- RLS is deliberately NOT enabled here.
--
-- Migration 0013 enables it on all eight tables and writes every policy. Doing
-- it here as well would mean two files own the same posture, and the one that
-- looked authoritative would be the one that runs first and says least. A
-- fresh database gets these tables with RLS off for exactly as long as it
-- takes 0013 to run in the same `db reset`.
-- ---------------------------------------------------------------------------
