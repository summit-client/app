import { createClient } from '../../../lib/supabase-server'

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
