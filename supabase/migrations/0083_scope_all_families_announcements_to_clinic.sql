-- ---------------------------------------------------------------------------
-- 0083 — scope the "all families" announcement read to one clinic.
--
-- NOT APPLIED. Written for a human to run; nothing here has been executed.
--
-- 0051's announcements_family_read has two branches. The `household` branch is
-- scoped: household_id = auth_household_id(). The `all_families` branch is not
-- scoped to anything but "the caller is in a household that has a client":
--
--   (audience = 'all_families'
--    and exists (select 1 from public.household_members hm
--                 where hm.household_id = public.auth_household_id()
--                   and hm.client_id is not null))
--
-- Nothing there mentions the announcement's clinic_id, so a guardian in any
-- tenant reads every clinic's all-families notices. Today that is one clinic's
-- worth of data, which is a fact about the current row count and not a
-- property of the policy — the whole point of clinic scoping is that it holds
-- before the second tenant exists, not after.
--
-- The fix adds the clinic predicate the sibling branch and every other policy
-- in this schema already carry. auth_household_id() resolves the caller's
-- household; households carry clinic_id, which is how a family account's
-- clinic is known (a guardian has no profiles.clinic_id of their own in every
-- case, so auth_clinic_id() is not the right helper here).
--
-- The publish window and the staff-read policy are untouched.
--
-- Verify:
--   -- as a guardian of clinic A, with a published all_families notice in each:
--   select clinic_id, title from announcements where audience = 'all_families';
--   -- expect only clinic A's rows; before this migration, both
--   select polname, qual from pg_policies
--    where tablename = 'announcements' and polname = 'announcements_family_read';
-- ---------------------------------------------------------------------------

drop policy if exists announcements_family_read on announcements;
create policy announcements_family_read on announcements for select
  using (
    publish_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      (audience = 'household' and household_id = public.auth_household_id())
      or (audience = 'all_families'
          and clinic_id = (select h.clinic_id from public.households h
                            where h.id = public.auth_household_id())
          and exists (select 1 from public.household_members hm
                       where hm.household_id = public.auth_household_id()
                         and hm.client_id is not null))
    )
  );

comment on policy announcements_family_read on announcements is
  'A family reads its own household''s notices, and its own clinic''s '
  'all-families notices. The clinic predicate on the second branch was '
  'missing in 0051, which made every tenant''s all-families notices readable '
  'by every family.';

notify pgrst, 'reload schema';
