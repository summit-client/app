import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { full_name, clinic_name, email, role, hp_field } = req.body;

  // honeypot check
  if (hp_field) {
    return res.status(200).json({ success: true });
  }

  if (!full_name || !clinic_name || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const { error } = await supabaseAdmin.from('leads').insert({
    full_name,
    clinic_name,
    email,
    role: role || null,
  });

  if (error) {
    console.error('Lead insert error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }

  return res.status(200).json({ success: true });
}