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
/**
 * Whether a state-changing request may proceed, by its claimed origin.
 *
 * Stricter than signOutRequestAllowed() below: this one requires a header.
 * It guards a fetch() our own page makes, and a browser always sends `Origin`
 * on a POST, so "neither header present" is not a shape we produce — only one
 * a non-browser caller does.
 *
 * `isOurs` is injected so this stays free of imports and testable; callers
 * pass the @summit/portals allowlist.
 */
export function sameSiteRequestAllowed(
  headers: { origin?: string | null; referer?: string | null },
  isOurs: (url: string) => boolean
): boolean {
  const claimed = headers.origin || headers.referer;
  if (!claimed) return false;
  return isOurs(claimed);
}

/**
 * The minimum this app will accept as a password, checked server-side.
 *
 * pages/update-password.jsx has had this rule since it was written, but only
 * there: the endpoint checked `!password` alone, so a direct call could set a
 * one-character password on a real account. Same floor, same wording.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "Password required";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export function signOutRequestAllowed(
  headers: { origin?: string | null; referer?: string | null },
  isOurs: (url: string) => boolean
): boolean {
  const claimed = headers.origin || headers.referer;
  if (!claimed) return true;
  return isOurs(claimed);
}

/**
 * Where a post-authentication redirect is allowed to land.
 *
 * `redirect_to` comes straight off the query string of a link this app did not
 * generate, and by the time it is followed a real session cookie is already on
 * the response — so an unchecked value hands an attacker a summitclient.io
 * link that authenticates the clicking browser and then bounces it to a page
 * they control. That is the shape phishing relies on.
 *
 * Two forms are allowed: a same-origin relative path, or an absolute URL to
 * one of our own portals (`isOurs`, injected so this module stays free of
 * @summit/portals and can be compiled standalone by the test).
 *
 * **A relative path is one leading slash and nothing slash-shaped after it.**
 * `//host` is protocol-relative — the original check knew that. `/\host` is
 * too: browsers normalise the backslash to a forward slash, so it reaches the
 * same place while passing a `startsWith('//')` test. Both separators are
 * rejected, and backslashes are normalised before the check rather than
 * enumerated, so `/\/host` and `/\\host` cannot slip through either.
 */
export function safeRedirect(dest: unknown, isOurs: (url: string) => boolean): string | null {
  if (typeof dest !== "string" || !dest) return null;
  if (dest.startsWith("/")) {
    // Compare on a copy with every backslash normalised; return the original.
    const normalised = dest.replace(/\\/g, "/");
    return normalised.startsWith("//") ? null : dest;
  }
  return isOurs(dest) ? dest : null;
}
