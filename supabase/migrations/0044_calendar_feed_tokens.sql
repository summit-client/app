-- 0044 · Calendar feed tokens — real webcal:// subscription for apps/client
--
-- pages/api/calendar.ics.ts was a one-time authenticated download only: a
-- calendar app polling a webcal:// URL on its own can't send this app's
-- session cookie, so a real subscription needs a shareable secret in the
-- URL instead. This is that secret's home — logged as a request in
-- BLOCKED-client.md's Round 4 ("a calendar_feed_tokens-shaped table (user
-- id, token, created/revoked timestamps) would let a future pass build a
-- real subscription link without changing the trust model of anything else
-- in this app"), now built.
--
-- THE UNAUTHENTICATED LOOKUP, AND WHY THIS TABLE'S OWN RLS DOESN'T COVER IT
--
-- The policies below govern the AUTHENTICATED management routes only (a
-- signed-in family generating or revoking their own feed link from
-- pages/appointments.tsx) - `user_id = auth.uid()` has no meaning for the
-- actual feed request a calendar app makes later, which carries no Supabase
-- session at all, by design (that's the whole reason this table exists).
-- That lookup (pages/api/calendar/feed/[token].ics.ts) uses the service
-- role key instead, server-side only, exactly like apps/web's
-- pages/api/leads/create.js already does for its own unauthenticated write
-- - the token itself is the credential (a long, unguessable secret, same
-- trust model as a password-reset link), checked in application code
-- (`revoked_at is null`) rather than by RLS, since nothing about that
-- request can satisfy auth.uid(). Nothing else in this schema changes: the
-- service role key is still server-side only, still never behind
-- NEXT_PUBLIC_, per root CLAUDE.md's hard constraints - it's confined to
-- that one route.
--
-- REVOKE IS AN UPDATE, NOT A DELETE
--
-- Matches this schema's "RLS policies are written per command, never `for
-- all` - deletes are denied by default" rule (root CLAUDE.md). No delete
-- policy is added below, so revoking a token sets revoked_at instead of
-- removing the row - the family (or a support session investigating a
-- shared link) can still see that a token existed and when it stopped
-- working, rather than it just vanishing.
--
-- clinic_id, PER THIS SCHEMA'S OWN RULE
--
-- Not obviously PHI itself (a token/timestamp pair, no clinical content),
-- but every table in this schema carries clinic_id and a
-- clinic_id = auth_clinic_id()-shaped policy from creation regardless (root
-- CLAUDE.md's Hard constraints) - added here for that consistency and as a
-- second, independent check alongside user_id = auth.uid() on the insert
-- policy, not because a client's own token could otherwise leak cross-
-- clinic.
--
-- NOT APPLIED. Per this session's constraints, the Supabase MCP available
-- here is read-only - a human with database access must run this migration
-- before the feed-token routes have anything to read or write against.
-- ============================================================================

create table if not exists calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Generated in application code (crypto.randomBytes(32).toString("hex"),
  -- 256 bits) rather than a DB default - see
  -- lib/calendar-feed-tokens.ts - so this column just stores and uniquely
  -- indexes whatever the app hands it.
  token text not null unique,

  created_at timestamptz not null default now(),
  -- null = still active. Set (an update, never a delete - see header) when
  -- the family revokes this link from pages/appointments.tsx.
  revoked_at timestamptz
);

-- The feed route's own lookup is by token alone (an unauthenticated
-- request carries nothing else to filter on) - unique already gives it an
-- index, this just documents that the unique constraint is load-bearing
-- for that query, not only for data integrity.
create index if not exists calendar_feed_tokens_user_idx on calendar_feed_tokens(user_id);

alter table calendar_feed_tokens enable row level security;

-- A family reads only their own token rows (e.g. to render the current
-- "Subscribe" / "Revoke" state on pages/appointments.tsx) - never anyone
-- else's, and never a staff role's, since this feature has no staff side
-- at all (see header: no auth_can() entries, matching every other purely
-- family-facing table in this schema).
create policy calendar_feed_tokens_select on calendar_feed_tokens for select
  using (public.auth_role() = 'client' and user_id = auth.uid());

create policy calendar_feed_tokens_insert on calendar_feed_tokens for insert
  with check (
    public.auth_role() = 'client'
    and user_id = auth.uid()
    and clinic_id = public.auth_clinic_id()
  );

-- Revoking is the only update this table ever needs (see header) - RLS
-- doesn't distinguish "which column changed", so this simply requires both
-- the existing row and the proposed new row to still belong to the caller;
-- the application layer only ever sets revoked_at.
create policy calendar_feed_tokens_update on calendar_feed_tokens for update
  using (public.auth_role() = 'client' and user_id = auth.uid())
  with check (public.auth_role() = 'client' and user_id = auth.uid());

-- No delete policy - see header's "REVOKE IS AN UPDATE, NOT A DELETE".
