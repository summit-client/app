-- 0072 · calendar_feed_tokens: a `kind` column, for a colleague/front-desk feed
--
-- Built on top of 0044 (the table) and 0070 (staff access to the personal
-- feed) — see both migrations' headers before reading this one; nothing
-- below changes what either already established for a `personal` token's
-- access.
--
-- WHAT THIS IS FOR
--
-- Two account-owner-approved scope decisions (2026-09-14, relayed via the
-- task that produced this migration, not re-litigated here):
--
--   1. A staff member's own personal feed (pages/api/calendar/feed/[token]
--      .ics.ts) now ALSO shows every other clinic staff member's sessions
--      alongside their own — full detail for their own (unchanged), PRIVACY
--      -SCRUBBED (time block + session type + location NAME only — no
--      client name, no staff name, no home-visit address) for everyone
--      else's. That is an application-layer change (the feed route's query
--      and lib/ics.ts's builder) with NO schema change of its own — flagged
--      here only so a reader of this migration knows the personal feed's
--      output changed even though this file doesn't touch a `personal` row
--      or its policies.
--   2. A brand new "front desk" feed: every session in the clinic, ALL of
--      it scrubbed the same way as (1)'s colleague entries — including the
--      generating admin/scheduler's own sessions, which get no special
--      treatment there (a front-desk feed is for ambient/shared display,
--      not a personal view — see [token].ics.ts). THIS is what the schema
--      change below is for.
--
-- WHY `kind` ON THE SAME TABLE RATHER THAN A SECOND TABLE
--
-- A front-desk token is still a revocable bearer secret, still clinic-
-- scoped, still attributed to the specific admin/scheduler who generated it
-- (for audit — "who created this shared link" — the same accountability
-- need calendar_feed_tokens already serves for personal/family tokens).
-- Every column 0044 already defined (token, clinic_id, user_id, created_at,
-- revoked_at) is exactly right for a front-desk row too; the only thing
-- that differs is what the unauthenticated feed route DOES with the row
-- once resolved — an application-layer branch on this new column, not a
-- reason for a second table with its own duplicated RLS to keep in sync.
--
-- WHY THE INSERT POLICY IS THE ONLY ONE THAT CHANGES
--
-- select/update stay exactly as 0070 left them (`user_id = auth.uid()`,
-- OR-ed across the same four staff/client roles) — `kind` is irrelevant to
-- "is this my own token row", so a front-desk row is just as visible to and
-- revocable by the admin/scheduler who created it as a personal row already
-- was, with no new policy needed for either. The one thing that must differ
-- is WHO may INSERT a front-desk-kind row in the first place: a front-desk
-- feed is clinic-wide (scrubbed, but still every session in the clinic,
-- including ones booked by staff who never individually consented to a
-- colleague seeing even a scrubbed version of their schedule), so minting
-- one is restricted to `auth_is_scheduling_staff()` (admin/scheduler —
-- migration 0013's helper, NOT 0070's wider `auth_is_staff() or
-- auth_is_scheduling_staff()` union that personal tokens get). A clinician
-- can still get their own personal-plus-colleagues feed via a
-- `personal`-kind token exactly as before; they cannot mint a clinic-wide
-- feed of everyone's schedule on their own say-so, scrubbed or not.
-- `create policy ... or replace` is not valid Postgres, so the insert
-- policy is dropped and recreated, same mechanics 0070 used for its own
-- three policies.
--
-- clinic_id scoping on insert is unchanged (`clinic_id = auth_clinic_id()`)
-- for both kinds — this migration only adds a second, kind-dependent
-- condition on WHO may act; it never changes how the row is scoped once
-- they do, and a front-desk token still can only ever be inserted for the
-- inserting user's own clinic, same as personal.
--
-- NOT APPLIED as of this migration file being written — same as 0044/0070
-- (see those migrations' own headers): a human with database access needs
-- to run this, same read-only-MCP constraint as before.
-- ============================================================================

alter table calendar_feed_tokens
  add column if not exists kind text not null default 'personal'
    check (kind in ('personal', 'front_desk'));

drop policy if exists calendar_feed_tokens_insert on calendar_feed_tokens;
create policy calendar_feed_tokens_insert on calendar_feed_tokens for insert
  with check (
    clinic_id = public.auth_clinic_id()
    and user_id = auth.uid()
    and (
      (
        kind = 'personal'
        and (public.auth_role() = 'client' or public.auth_is_staff() or public.auth_is_scheduling_staff())
      )
      or
      (
        kind = 'front_desk'
        and public.auth_is_scheduling_staff()
      )
    )
  );

-- select and update: 0070's existing policies (user_id = auth.uid()) are
-- left completely untouched below — a personal token's owner-only
-- visibility is unaffected by anything in this migration.
--
-- A front-desk token gets ONE ADDITIONAL policy, not a rewrite of 0070's:
-- Postgres OR's every applicable policy together, so this widens exactly
-- who may see/revoke a front_desk-kind row without changing a personal
-- row's access at all. Deliberately clinic-wide rather than
-- generator-only: "the front desk feed" reads as one shared resource the
-- clinic's admins/schedulers jointly manage, not each admin's own private
-- link that happens to also show everyone else's schedule - a receptionist
-- handed this link shouldn't depend on which specific admin generated it,
-- and a second admin should be able to revoke a stale one without having
-- to track down whoever first created it. `auth_is_scheduling_staff()`
-- mirrors the same role check the insert policy above already uses, so
-- who may see/manage a front-desk token is exactly who may create one.
create policy calendar_feed_tokens_front_desk_select on calendar_feed_tokens for select
  using (kind = 'front_desk' and clinic_id = public.auth_clinic_id() and public.auth_is_scheduling_staff());
create policy calendar_feed_tokens_front_desk_update on calendar_feed_tokens for update
  using (kind = 'front_desk' and clinic_id = public.auth_clinic_id() and public.auth_is_scheduling_staff())
  with check (kind = 'front_desk' and clinic_id = public.auth_clinic_id() and public.auth_is_scheduling_staff());
