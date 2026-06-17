import { createClient } from '../../../lib/supabase-server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { password } = req.body

  if (!password) {
    return res.status(400).json({ error: 'Password required' })
  }

  const supabase = createClient(req, res)
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ ok: true })
}