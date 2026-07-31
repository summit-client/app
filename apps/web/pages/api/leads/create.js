import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Rate limiting ──────────────────────────────────────────────
// In-memory, per-IP sliding window. Fine for a single fork-mode PM2
// process; if the web app ever runs clustered/multi-instance, move
// this to Supabase (a `lead_attempts` table) or Redis/Upstash so all
// instances share state.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;                     // 5 submissions per IP per window
const hits = new Map();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// ── Email notification (Resend API) ───────────────────────────
// Requires RESEND_API_KEY env var. The summitclient.io domain must be
// verified in the Resend dashboard (DNS records at Namecheap) before
// sending from RESEND_FROM. Optional: RESEND_FROM, LEAD_NOTIFY_EMAIL.
async function notifyNewLead(lead) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping lead notification email');
    return;
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Summit Leads <leads@summitclient.io>',
        to: [process.env.LEAD_NOTIFY_EMAIL || 'yanko@summitclient.io'],
        subject: `New Summit lead: ${lead.clinic_name}`,
        text: `New signup lead\n\nName: ${lead.full_name}\nClinic: ${lead.clinic_name}\nEmail: ${lead.email}\nRole: ${lead.role || 'n/a'}`,
        html: `<p><strong>New signup lead</strong></p>
          <p>Name: ${lead.full_name}<br/>
          Clinic: ${lead.clinic_name}<br/>
          Email: ${lead.email}<br/>
          Role: ${lead.role || 'n/a'}</p>`,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error('Lead notification email failed:', resp.status, body);
    }
  } catch (err) {
    // Never fail the request over a notification issue. The lead is
    // already saved in Supabase regardless.
    console.error('Lead notification email failed:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
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

  await notifyNewLead({ full_name, clinic_name, email, role });

  return res.status(200).json({ success: true });
}
