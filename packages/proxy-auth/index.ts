/**
 * @summit/proxy-auth — session freshness, checked without ever triggering a
 * token refresh. Server/edge-only: never import this from a React component
 * or anything client-rendered, and never add "use client" here.
 *
 * All four portals (data, employee, client, scheduler) share one
 * `.summitclient.io` session cookie for SSO. `@supabase/auth-js` treats a
 * session as needing refresh starting 90 seconds before it actually expires
 * (AUTO_REFRESH_TICK_THRESHOLD=3 * AUTO_REFRESH_TICK_DURATION_MS=30s) and
 * redeems the refresh token the moment any of getUser()/getSession() sees
 * that - regardless of the autoRefreshToken option, which only controls the
 * proactive background timer, not this on-demand path (see
 * GoTrueClient#__loadSession in @supabase/auth-js).
 *
 * That's fine for one app. It's a race for four independently deployed
 * processes reading the same cookie: whichever one's proxy.ts happens to run
 * in that 90-second window first redeems the refresh token and gets a new
 * one written into its own response. Supabase invalidates the old token on
 * redemption, so if a second portal's proxy.ts was making the same decision
 * around the same moment, it presents the now-already-spent refresh token
 * and gets a hard `refresh_token_already_used` AuthApiError back - which
 * every proxy.ts previously treated identically to "not signed in" and
 * bounced to login, even though the session was perfectly valid a moment
 * earlier. Reproduced live: navigating data.summitclient.io ->
 * employee.summitclient.io right at expiry redirected all the way back to
 * summitclient.io instead of loading the employee portal.
 *
 * Fix: only apps/web's /api/auth/refresh is ever allowed to redeem a refresh
 * token. Every spoke portal's proxy.ts calls sessionFreshness() first:
 *
 *   - "fresh"   -> proceed exactly as before. getUser() is safe to call here
 *                  because auth-js's own local expiry check (the same
 *                  90-second margin) won't consider it near enough to expiry
 *                  to redeem anything - this changes nothing for the common
 *                  case, by construction.
 *   - "stale"   -> do NOT call getUser() - that's the exact call that would
 *                  race. Redirect to apps/web's refresh endpoint instead,
 *                  with a return_to back to the original URL.
 *   - "missing" -> no session cookie at all; redirect straight to login,
 *                  no point bouncing through a refresh that has nothing to
 *                  refresh.
 *
 * sessionFreshness() reads the cookie directly using @supabase/ssr's own
 * documented, publicly exported chunk-combining and base64url-decoding
 * utilities (the same ones @supabase/ssr's own storage adapter uses
 * internally) - it never constructs a Supabase client or calls any auth
 * method, so it is structurally incapable of triggering a refresh itself.
 */

import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

const BASE64_PREFIX = "base64-";

// See file header: matches @supabase/auth-js's own EXPIRY_MARGIN_MS
// (AUTO_REFRESH_TICK_THRESHOLD * AUTO_REFRESH_TICK_DURATION_MS = 3 * 30s).
// Not imported - @supabase/auth-js is a transitive dependency here, not a
// direct one, and this number is part of the stable cookie/refresh contract
// the SDK exposes, not an internal detail liable to drift. A slightly larger
// local value would only mean redirecting to the central refresh a little
// earlier than strictly necessary, which is harmless.
const EXPIRY_MARGIN_MS = 90_000;

export type SessionFreshness = "missing" | "fresh" | "stale";

export interface RequestCookie {
  name: string;
  value: string;
}

interface StoredSession {
  access_token?: string;
  expires_at?: number;
}

/**
 * The default cookie key @supabase/supabase-js derives when no
 * `cookieOptions.name` override is configured - `sb-<project-ref>-auth-token`,
 * where the ref is the first label of the project's hostname. None of
 * Summit's apps override this, so this must stay in sync with that default
 * (SupabaseClient's constructor) rather than duplicating a hardcoded name.
 */
function storageKeyFor(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

function decodeCookieValue(raw: string): unknown {
  const encoded = raw.startsWith(BASE64_PREFIX) ? raw.slice(BASE64_PREFIX.length) : null;
  try {
    const decoded = encoded !== null ? stringFromBase64URL(encoded) : raw;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Reads session freshness straight out of request cookies. Never constructs
 * a Supabase client and never calls an auth method - see the file header for
 * why that matters here.
 */
export async function sessionFreshness(
  cookies: RequestCookie[],
  supabaseUrl: string,
): Promise<SessionFreshness> {
  const key = storageKeyFor(supabaseUrl);
  const byName = new Map(cookies.map((c) => [c.name, c.value]));

  const raw = await combineChunks(key, async (name: string) => byName.get(name) ?? null);
  if (!raw) return "missing";

  const session = decodeCookieValue(raw) as StoredSession | null;
  if (!session?.access_token || !session.expires_at) return "missing";

  const hasExpired = session.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS;
  return hasExpired ? "stale" : "fresh";
}
