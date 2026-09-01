import crypto from "node:crypto";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { urlFor } from "@summit/portals";

/**
 * A shareable, revocable secret for subscribing to a family's calendar feed
 * (pages/api/calendar/feed/[token].ics.ts) - migration 0041's
 * `calendar_feed_tokens` table. See that migration's header for the full
 * design: why revoking is an update, not a delete, and why this table's own
 * RLS doesn't (and can't) cover the actual feed lookup.
 */

/** 256 bits of entropy, hex-encoded (64 chars) - a URL-safe bearer secret,
 *  the same trust model as a password-reset link. Generated in application
 *  code rather than left to a DB default (`gen_random_uuid()` would still
 *  be 122 bits, plenty on its own) so the entropy source and length are
 *  explicit for a value a family might paste into a calendar app or share
 *  a URL containing. */
export function generateFeedToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** The subscribable URL for a given token - `https://`, since `webcal://`
 *  is not a real network scheme (calendar apps that understand it just
 *  swap the scheme back to https before fetching); pages/appointments.tsx
 *  offers both, letting the browser's own "open with Calendar" handling
 *  decide which one to hand off. */
export function feedUrlForToken(token: string): string {
  return `${urlFor("client")}/api/calendar/feed/${token}.ics`;
}

export function webcalUrlForToken(token: string): string {
  return feedUrlForToken(token).replace(/^https?:\/\//, "webcal://");
}

/**
 * Service-role Supabase client - bypasses RLS entirely. Used for exactly
 * one thing in this app: looking up a calendar feed token
 * (pages/api/calendar/feed/[token].ics.ts) for a request that, by design,
 * carries no session cookie at all (a calendar app polling a webcal:// URL
 * on its own can't send one) - so there is no authenticated Supabase
 * client that lookup could otherwise use, and `calendar_feed_tokens`' own
 * RLS (scoped to `auth.uid()`) has nothing to check against.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` must be set in apps/client's own production
 * process environment - never `NEXT_PUBLIC_`, never in this app's
 * `.env.local` (root CLAUDE.md's Hard constraints on the service role
 * key). The same env var apps/web's `pages/api/leads/create.js` already
 * depends on for its own unauthenticated write; not yet confirmed set for
 * apps/client as of this PR - flagged for a human with server access
 * rather than assumed.
 */
export function createFeedLookupClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
