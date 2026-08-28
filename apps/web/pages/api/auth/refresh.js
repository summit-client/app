import { createClient } from '../../../lib/supabase-server'
import { isKnownOrigin } from '@summit/portals'

/**
 * The one place allowed to redeem a refresh token. All four portals share a
 * `.summitclient.io` session cookie; if two of them independently call
 * getUser() near token expiry, both submit the same refresh token to
 * Supabase and one gets a hard, unrecoverable "already used" error even
 * though the session was valid a moment earlier. See
 * @summit/proxy-auth's file header for the full explanation - every spoke
 * portal's proxy.ts calls sessionFreshness() and redirects here instead of
 * calling getUser() itself whenever the session is within 90s of expiry, so
 * this is the only place that ever attempts the actual refresh.
 */

const MAX_ATTEMPTS = 3

export default async function handler(req, res) {
  const { return_to: returnTo, attempt } = req.query
  const attemptNumber = Number(attempt) || 0

  // return_to is caller-supplied (the portal that redirected here) -
  // validate before ever redirecting to it, or this becomes an open redirect.
  if (typeof returnTo !== 'string' || !isKnownOrigin(returnTo)) {
    res.status(400).send('Invalid return_to')
    return
  }

  const supabase = createClient(req, res)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (user) {
    res.redirect(returnTo)
    return
  }

  if (error?.code === 'refresh_token_already_used' && attemptNumber < MAX_ATTEMPTS) {
    // A concurrent request (another portal's own attempt, or another tab
    // hitting this same endpoint) already redeemed this token. Only a fresh
    // request from the browser can pick up whichever response actually won -
    // this request's cookies were fixed the instant the browser sent them,
    // so retrying in place would just resubmit the same spent token. Bounded
    // so a genuine dead heat can't loop forever.
    const retry = new URL('https://summitclient.io/api/auth/refresh')
    retry.searchParams.set('return_to', returnTo)
    retry.searchParams.set('attempt', String(attemptNumber + 1))
    res.redirect(retry.toString())
    return
  }

  // Genuinely signed out, or the refresh token is invalid/revoked for real -
  // not a race, an actual "not signed in".
  res.redirect('/login')
}
