import { createClient } from '../../../lib/supabase-server'
import { isKnownOrigin, webUrl } from '@summit/portals'
import { passwordProblem, sameSiteRequestAllowed } from '../../../lib/auth-guards'

/**
 * Changes the signed-in user's password.
 *
 * The session cookie is the only credential here -- there is no
 * re-authentication step -- so the request itself has to be proved to come
 * from us. It used to check nothing but `req.method !== 'POST'`, and a POST
 * is exactly what a cross-site auto-submitting HTML form sends, with the
 * `.summitclient.io` cookie attached: one request, account taken over.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // An HTML form can only send urlencoded, multipart or plain text, so
  // requiring JSON is on its own enough to stop the form-POST case: an
  // application/json cross-origin request needs a CORS preflight, and this
  // route answers none. The origin check below is the second lock, not the
  // only one.
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'Send this as JSON.' })
  }

  const ours = (url) => isKnownOrigin(url) || sameOrigin(url, webUrl())
  if (!sameSiteRequestAllowed({ origin: req.headers.origin, referer: req.headers.referer }, ours)) {
    return res.status(403).json({ error: 'That request did not come from Summit.' })
  }

  const { password } = req.body ?? {}

  // The length rule lived only in pages/update-password.jsx, so a direct call
  // could set a one-character password. Same floor, now on the server too.
  const problem = passwordProblem(password)
  if (problem) {
    return res.status(400).json({ error: problem })
  }

  const supabase = createClient(req, res)
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    // Logged, not returned. The raw message was rendered verbatim on the
    // page, and some of them describe the account rather than the request.
    console.error('[web/auth/update-password] updateUser failed:', error.message)
    return res.status(400).json({ error: 'That password could not be set. Choose a different one and try again.' })
  }

  return res.status(200).json({ ok: true })
}

// isKnownOrigin() knows the four spoke portals, not apps/web itself, and this
// page is served from this origin.
function sameOrigin(url, base) {
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}
