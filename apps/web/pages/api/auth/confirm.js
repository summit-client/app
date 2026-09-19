import { createClient } from '../../../lib/supabase-server'
import { isKnownOrigin } from '@summit/portals'
import { safeRedirect } from '../../../lib/auth-guards'

// `redirect_to` is caller-supplied and a session cookie is already set by the
// time it is followed, so it is validated by safeRedirect in lib/auth-guards.ts
// — where apps/web/tests/auth-guards.test.mjs can compile and exercise it,
// rather than sitting untested inside a route handler. See its comment for
// what "same-origin relative path" has to exclude.

export default async function handler(req, res) {
  const { token_hash, type, redirect_to } = req.query

  if (!token_hash || !type) {
    return res.redirect('/login?error=missing_token')
  }

  const supabase = createClient(req, res)
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    // A code, not the message: the login page renders whatever it is
    // handed, so a raw string there is attacker-controllable copy. The real
    // reason goes to the server log, where it is useful and not a lure.
    console.error('[web/auth/confirm] verifyOtp failed:', error.message)
    return res.redirect('/login?error=link_invalid')
  }

  // session cookie is now set on the response; redirect into the app
  const dest = safeRedirect(redirect_to, isKnownOrigin) || '/update-password'
  return res.redirect(dest)
}