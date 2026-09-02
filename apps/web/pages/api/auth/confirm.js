import { createClient } from '../../../lib/supabase-server'
import { isKnownOrigin } from '@summit/portals'

// redirect_to is caller-supplied (it comes straight off the query string of
// a link this route did not generate itself) - validate before ever
// redirecting to it, or this becomes an open redirect: verifyOtp below sets
// a real session cookie on the response first, so an unchecked redirect_to
// would hand an attacker a summitclient.io link that authenticates the
// clicking browser and then bounces it straight to a page they control,
// which is exactly the "trusted domain, then redirected" shape phishing
// relies on. Mirrors /api/auth/refresh's return_to check, the established
// pattern in this codebase for exactly this kind of caller-supplied
// redirect target - same-origin relative paths (a single leading slash,
// never `//host` which browsers treat as protocol-relative) or an absolute
// URL to one of our own portals are safe; anything else falls back to the
// default destination instead of being followed.
function safeRedirect(dest) {
  if (typeof dest !== 'string' || !dest) return null
  if (dest.startsWith('/') && !dest.startsWith('//')) return dest
  if (isKnownOrigin(dest)) return dest
  return null
}

export default async function handler(req, res) {
  const { token_hash, type, redirect_to } = req.query

  if (!token_hash || !type) {
    return res.redirect('/login?error=missing_token')
  }

  const supabase = createClient(req, res)
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return res.redirect('/login?error=' + encodeURIComponent(error.message))
  }

  // session cookie is now set on the response; redirect into the app
  const dest = safeRedirect(redirect_to) || '/update-password'
  return res.redirect(dest)
}