-- ============================================================================
-- 0043 · Enforce supervisor/admin-only status transitions at the database,
-- not just in apps/data's UI.
--
-- Root cause (apps/data/BLOCKED-data.md, "Carried over, HIGH" section):
-- session_notes/client_sessions/programs all carry an `auth_is_staff()`-
-- shaped UPDATE policy (`clinic_id = auth_clinic_id() and auth_is_staff()`,
-- migration 0001/0004) that admits admin, supervisor and clinician
-- identically - there is no primitive anywhere in this schema for "staff at
-- or above supervisor." Two real actions are supposed to be supervisor/admin
-- only and today are enforced ONLY in apps/data's UI:
--
--   - the Review Queue's countersign action (app/review/page.tsx gates the
--     whole screen on `identity.appRole !== "clinician"`, then
--     lib/data.ts's countersignNote() writes session_notes.status ->
--     'countersigned' and, in the same action, client_sessions.status
--     'completed' -> 'locked')
--   - Programs' sign-off action (app/clients/[id]/programs/page.tsx's
--     `canSignOff = appRole === "admin" || appRole === "supervisor"`, then
--     lib/data.ts's activateProgram() writes programs.status
--     'pending_signoff' -> 'active')
--
-- A clinician account that knows the API surface can call the same
-- Supabase .update() directly - devtools, a script, curl with their own
-- JWT - and RLS allows it today, because auth_is_staff() does not
-- distinguish clinician from supervisor/admin on these tables. This
-- migration is defense in depth only: the app-layer checks above are
-- already correct and do not change. Nothing here widens or narrows any
-- EXISTING read or write - clinicians keep every other read/write they
-- have today on all three tables; only these three specific transitions
-- now also require supervisor/admin at the database.
--
-- MECHANISM - why a trigger, not a second permissive RLS policy
--
-- Migration 0014's own header states the reason a naive "add a stricter
-- policy alongside the broad one" doesn't work here: "Multiple permissive
-- select policies on the same table OR together in Postgres" - and that is
-- true of UPDATE's WITH CHECK exactly the same way INSERT/SELECT's USING
-- is. A second PERMISSIVE policy can only ever grant more access, never
-- take any away; layering one on top of `programs_staff_update` etc. would
-- be a silent no-op, not a restriction. The two mechanisms that actually
-- narrow are a RESTRICTIVE policy (ANDed with the permissive ones) or a
-- BEFORE UPDATE trigger that raises. This schema already has three
-- precedents for the trigger shape and zero for RESTRICTIVE policies
-- anywhere (grep-confirmed): forbid_signed_report_update (0009, signed
-- report immutability - only status may move, and only to 'superseded'),
-- forbid_locked_session_update (0004, client_sessions' own locked-immutable
-- + forward-only status machine), and the *_clinic_consistency triggers
-- (0016). A trigger also lets the condition compare OLD and NEW directly
-- ("moving INTO this status", not "the row happens to BE this status"),
-- which is what's needed to avoid touching any transition these tables'
-- other write paths already perform (see each trigger's comment below for
-- the exact write paths checked against apps/data's actual code). Matching
-- that existing idiom instead of introducing this schema's first
-- RESTRICTIVE policy.
--
-- client_sessions - the third table BLOCKED-data.md asks to check.
-- countersignNote() (apps/data/lib/data.ts) performs the countersign as TWO
-- writes in the same action: session_notes.status -> 'countersigned', then
-- client_sessions.status 'completed' -> 'locked' (grep-confirmed: the only
-- write path in apps/data that ever sets client_sessions.status to
-- 'locked' - every other client_sessions status write is the clinician's
-- own planning -> active -> documentation -> completed progression via
-- updateRunSession(), untouched by this migration). That second write is
-- reachable exactly the same way as the first - the Review Queue screen is
-- gated to admin/supervisor in the UI, RLS does not gate it at all - so it
-- is the same root cause, not a fourth, separate bug, and gated here the
-- same way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: mirrors auth_is_staff() exactly (0001, hardened in 0009) but for
-- "supervisor or admin" - the primitive this schema has never had. Built on
-- auth_role(), schema-qualified, pg_temp named last, same as every other
-- security-definer helper here.
-- ---------------------------------------------------------------------------
create or replace function auth_is_supervisor_or_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select public.auth_role() in ('admin','supervisor') $$;

-- ---------------------------------------------------------------------------
-- session_notes: gate the countersign transition (status -> 'countersigned').
--
-- Deliberately keyed on the transition (old.status is distinct from
-- 'countersigned' and new.status = 'countersigned'), not on new.status
-- alone - saveNote() upserts draft/signed/awaiting_countersign/returned
-- writes for the clinician's own note-taking flow and must stay untouched,
-- and a row that is already 'countersigned' being updated for some other
-- reason (e.g. a future amendment-adjacent write) without changing status
-- again is not this transition either. Only the specific move into
-- 'countersigned' is gated, matching countersignNote()'s
-- `decision === "countersigned"` branch. The sibling `decision ===
-- "returned"` branch is unchanged by this migration - returning a note to
-- the clinician for revision does not forge a supervisor sign-off the way
-- an unauthorized countersign would, and BLOCKED-data.md's ask names the
-- countersign transition specifically.
-- ---------------------------------------------------------------------------
create or replace function forbid_unauthorized_countersign() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'countersigned'
     and old.status is distinct from 'countersigned'
     and not public.auth_is_supervisor_or_admin() then
    raise exception 'Countersigning a session note requires supervisor or admin.';
  end if;
  return new;
end $$;
drop trigger if exists session_notes_countersign_gate on session_notes;
create trigger session_notes_countersign_gate
  before update on session_notes
  for each row execute function forbid_unauthorized_countersign();

-- ---------------------------------------------------------------------------
-- programs: gate the sign-off transition (status 'pending_signoff' ->
-- 'active').
--
-- Keyed on the exact old -> new pair, matching activateProgram()'s own
-- `.eq("status", "pending_signoff")` guard and createProgram()'s comment
-- ("previously... Save goal (pending supervisor sign-off)... Now writes a
-- real programs row with status: 'pending_signoff'"). grep-confirmed this
-- is the only `.update()` apps/data ever issues against programs - no other
-- status transition (on_hold, mastered, maintenance, archived) is written
-- from this app today, so nothing else on this table is touched.
-- ---------------------------------------------------------------------------
create or replace function forbid_unauthorized_program_activation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'pending_signoff'
     and new.status = 'active'
     and not public.auth_is_supervisor_or_admin() then
    raise exception 'Activating a program (supervisor sign-off) requires supervisor or admin.';
  end if;
  return new;
end $$;
drop trigger if exists programs_activation_gate on programs;
create trigger programs_activation_gate
  before update on programs
  for each row execute function forbid_unauthorized_program_activation();

-- ---------------------------------------------------------------------------
-- client_sessions: gate the lock transition (status 'completed' ->
-- 'locked') - the equivalent transition BLOCKED-data.md asks to verify on
-- this table. Coexists with client_sessions_forbid_locked (0004), which
-- enforces locked-row immutability and forward-only status generally but
-- has no notion of who is allowed to make the completed -> locked move
-- specifically; that trigger is untouched, this adds the missing role
-- check as a second BEFORE UPDATE trigger on the same table.
-- ---------------------------------------------------------------------------
create or replace function forbid_unauthorized_session_lock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'completed'
     and new.status = 'locked'
     and not public.auth_is_supervisor_or_admin() then
    raise exception 'Locking a session (supervisor countersign) requires supervisor or admin.';
  end if;
  return new;
end $$;
drop trigger if exists client_sessions_lock_gate on client_sessions;
create trigger client_sessions_lock_gate
  before update on client_sessions
  for each row execute function forbid_unauthorized_session_lock();
