import { createClient } from '../../../lib/supabase-server'

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
  const dest = redirect_to || '/update-password'
  return res.redirect(dest)
}