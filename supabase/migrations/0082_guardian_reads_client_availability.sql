-- ---------------------------------------------------------------------------
-- 0082 — let a guardian READ the availability they are already allowed to write.
--
-- NOT APPLIED. Written for a human to run; nothing here has been executed.
--
-- 0076 gave a household guardian insert, update and delete on
-- client_availability for their own children (client_availability_guardian_*)
-- and no SELECT. Every select policy on that table is staff-only:
-- 0013:222 (auth_is_scheduling_staff) and 0046:131 (auth_is_staff). The only
-- other reader is an untracked pre-history policy keyed on
-- clients.user_id = auth.uid(), which a guardian linked through
-- guardian_relationships does not satisfy.
--
-- The consequence is not a blank screen, it is data loss.
-- apps/client/pages/family.tsx loads the child's availability into a grid and
-- saves by deleting every row for that child and re-inserting the grid's
-- contents. The load returns zero rows under RLS, so the grid opens empty —
-- looking exactly like "no availability set yet" — and the first save wipes
-- whatever the scheduler had entered. Write access without read access is
-- what makes an editor destructive.
--
-- The predicate mirrors 0076's write policies exactly, so a guardian can read
-- precisely the rows they can already write. No new reach.
--
-- Verify:
--   -- as a guardian with a child in auth_accessible_client_ids():
--   select count(*) from client_availability where client_id = <their child>;
--   -- expect the scheduler's rows, not 0
--   -- as a guardian, for a child that is NOT theirs:
--   select count(*) from client_availability where client_id = <other child>;
--   -- expect 0
--   select polname, cmd from pg_policies where tablename = 'client_availability';
--
-- Still open after this, and deliberately not bundled: family.tsx's save is
-- delete-then-insert with neither result checked, so an empty grid still
-- means "erase everything" even once the read works. Whether an empty grid
-- should erase or be refused is a product question, not a policy one.
-- ---------------------------------------------------------------------------

drop policy if exists client_availability_guardian_select on client_availability;
create policy client_availability_guardian_select on client_availability for select
  using (client_id in (select public.auth_accessible_client_ids()));

comment on policy client_availability_guardian_select on client_availability is
  'A household guardian reads the availability rows they may already write '
  '(0076). Without this the family portal''s grid loads empty and its '
  'delete-then-insert save destroys the scheduler''s entries.';

notify pgrst, 'reload schema';
