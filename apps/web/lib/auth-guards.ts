/**
 * Small pure guards for the auth endpoints in this app.
 *
 * They live here, exported and dependency-free, so `tests/auth-guards.test.mjs`
 * can exercise the shipped code rather than a restatement of it: the API
 * routes under pages/api/auth/ have no other automated cover.
 */

/**
 * Merge a batch of serialized cookies with whatever is already queued on the
 * response.
 *
 * `res.setHeader('Set-Cookie', ...)` replaces the header. @supabase/auth-js
 * calls its cookie writer more than once in a request - a refresh writes the
 * session, then signOut() writes the removals - so a plain setHeader threw
 * the first batch away. With a chunked auth token (several cookies,
 * sb-<ref>-auth-token.0/.1) that could drop the removals for some chunks and
 * leave the shared .summitclient.io session valid after sign-out.
 *
 * Emitting both batches is safe: a browser applies Set-Cookie in order, so
 * for a repeated name the later one - the one we meant - wins.
 */
export function mergeSetCookie(
  existing: string | number | string[] | undefined,
  serialized: string[]
): string[] {
  if (existing === undefined) return serialized;
  return ([] as string[]).concat(existing as unknown as string | string[], serialized);
}

/**
 * The copy shown for a `?error=` code on the login page.
 *
 * The page used to render the query value verbatim, so any link of the form
 * /login?error=<sentence> displayed attacker-chosen text inside the styled
 * alert as an official message. Every producer in this app now sends one of
 * these codes instead; anything else - including an old link still carrying a
 * full sentence - falls back to the generic line.
 */
const REDIRECT_ERRORS: Record<string, string> = {
  missing_token: 'That link is missing required information. Please request a new one.',
  link_invalid: 'That link is no longer valid. Please request a new one.',
  pending_activation: 'Your account is pending activation. Contact your administrator.',
};

export const GENERIC_REDIRECT_ERROR =
  'We could not complete that request. Please try again, or request a new link.';

export function redirectErrorMessage(value: string | null | undefined): string {
  if (!value) return '';
  return REDIRECT_ERRORS[value] ?? GENERIC_REDIRECT_ERROR;
}

/**
 * Whether a request to the sign-out endpoint may proceed.
 *
 * Sign-out is a session-ending GET with no token, so any third-party page can
 * fire it with an <img> or a redirect and log the user out of all four
 * portals at once. This rejects a request whose Origin or Referer is present
 * and belongs to someone else.
 *
 * It allows a request that carries neither header, because that is what our
 * own sign-out is: a top-level GET navigation from `signOutUrl()`, rendered
 * as a plain <a href> in the cross-portal bar, which sends no Origin and may
 * send no Referer under a strict referrer policy. That makes this a partial
 * mitigation rather than a complete one - an attacker who sets
 * referrerpolicy="no-referrer" still gets through. It stops the naive case
 * and costs nothing; the complete fix is a POST with a token, which would
 * break every portal's sign-out link and is not ours to decide.
 *
 * `isOurs` is injected so this stays free of imports and testable; callers
 * pass the @summit/portals allowlist.
 */
export function signOutRequestAllowed(
  headers: { origin?: string | null; referer?: string | null },
  isOurs: (url: string) => boolean
): boolean {
  const claimed = headers.origin || headers.referer;
  if (!claimed) return true;
  return isOurs(claimed);
}
