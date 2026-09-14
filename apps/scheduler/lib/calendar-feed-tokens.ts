import crypto from "node:crypto";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { urlFor } from "@summit/portals";

/**
 * A shareable, revocable secret for subscribing to a scheduling staff
 * member's OWN upcoming-sessions calendar feed
 * (pages/api/calendar/feed/[token].ics.ts) - the staff-side use of migration
 * 0044's `calendar_feed_tokens` table, admitted by migration 0070 (see that
 * migration's header for exactly which roles and why). This file is a
 * straight port of apps/client/lib/calendar-feed-tokens.ts's shape, adjusted
 * only for this app's own URL and the fact that this table's row now serves
 * two different apps for two different populations of the same clinic - see
 * that file's own comments for the parts that didn't need to change.
 *
 * Deliberately NOT a shared package: the table and its trust model are
 * shared, but each app resolves its own person (a `clients` row there, an
 * `employment_records` -> `staff` row here) and builds its own feed content,
 * so there is nothing left to actually share once you subtract "call
 * crypto.randomBytes and build a URL" - not worth a new @summit/* package
 * for.
 */

/** 256 bits of entropy, hex-encoded (64 chars) - see
 *  apps/client/lib/calendar-feed-tokens.ts's identical function for the full
 *  reasoning (a URL-safe bearer secret, same trust model as a
 *  password-reset link). */
export function generateFeedToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** The subscribable URL for a given token, on this app's own origin -
 *  `urlFor("scheduler")` is the right call here (this app's registered
 *  PortalKey in @summit/portals), the scheduler-side equivalent of
 *  apps/client's `urlFor("client")`. `https://`, not `webcal://` - see
 *  apps/client's version of this function for why. */
export function feedUrlForToken(token: string): string {
  return `${urlFor("scheduler")}/api/calendar/feed/${token}.ics`;
}

export function webcalUrlForToken(token: string): string {
  return feedUrlForToken(token).replace(/^https?:\/\//, "webcal://");
}

/**
 * Service-role Supabase client - bypasses RLS entirely. Used for exactly one
 * thing in this app: looking up a calendar feed token
 * (pages/api/calendar/feed/[token].ics.ts) for a request that, by design,
 * carries no session cookie at all (a calendar app polling a webcal:// URL
 * on its own can't send one) - identical reasoning to
 * apps/client/lib/calendar-feed-tokens.ts's createFeedLookupClient(), which
 * this is a direct copy of.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` must be set in apps/scheduler's own production
 * process environment - never `NEXT_PUBLIC_`, never in this app's
 * `.env.local` (root CLAUDE.md's Hard constraints on the service role key).
 * NOT CONFIRMED set for apps/scheduler as of this change - flagged for a
 * human with server access rather than assumed, same as apps/client's
 * original implementation of this same function flagged it unconfirmed for
 * that app.
 */
export function createFeedLookupClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
