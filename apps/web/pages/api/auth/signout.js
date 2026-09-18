import { createClient } from '../../../lib/supabase-server'
import { isKnownOrigin, webUrl } from '@summit/portals'
import { signOutRequestAllowed } from '../../../lib/auth-guards'

// isKnownOrigin() knows the four spoke portals, not apps/web itself, and
// the sign-out link in this app's own header points here from this origin.
function sameOrigin(url, base) {
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

/**
 * The one place allowed to end a session. See @summit/portals's
 * signOutUrl() for why: every portal's own browser Supabase client clears
 * cookies scoped to its own host, not the shared `.summitclient.io` cookie
 * apps/web's client wrote at sign-in, so a portal calling
 * supabase.auth.signOut() on itself leaves that cookie valid for every other
 * portal. Only this endpoint's server client (lib/supabase-server.ts) writes
 * with the matching Domain, so only it can actually clear it - every portal's
 * sign-out button should navigate here rather than call signOut() itself.
 */
export default async function handler(req, res) {
  // Sign-out ends the session for all four portals at once, on a GET with no
  // token, so any third-party page could fire it with an <img src> or a
  // redirect and log a clinician out mid-shift. Reject a request that claims
  // an origin belonging to someone else.
  //
  // A request carrying neither header is allowed, because that is what our
  // own sign-out is: a top-level GET navigation from signOutUrl(), rendered
  // as a plain <a href> in the cross-portal bar, which sends no Origin and
  // may send no Referer. That makes this a partial mitigation - an attacker
  // setting referrerpolicy="no-referrer" still gets through. The complete
  // fix is a POST with a token, which would break every portal's sign-out
  // link and is not this change's to decide.
  const ours = (url) => isKnownOrigin(url) || sameOrigin(url, webUrl())
  if (!signOutRequestAllowed({ origin: req.headers.origin, referer: req.headers.referer }, ours)) {
    res.status(403).send('Sign-out must be started from Summit.')
    return
  }

  const supabase = createClient(req, res)
  await supabase.auth.signOut()
  // `?signedout=1` is how the login page knows to forget the remembered
  // email rather than pre-fill it. Sign-out happens here, on the server,
  // where localStorage cannot be reached - without this marker login.tsx
  // has to infer it from the absence of a session cookie, which also fires
  // when a session merely expired, and on a shared clinic workstation
  // guessing wrong means showing the last person's address to the next one.
  res.redirect('/login?signedout=1')
}
