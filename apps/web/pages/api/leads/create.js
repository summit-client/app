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

// Backstop against x-forwarded-for spoofing: the per-IP limit above is
// worthless if the caller can pick their own IP by setting the header, so
// this caps total submissions across every IP in the same window. It does
// not stop a single attacker from using the endpoint, but it bounds how
// much mail this endpoint can be made to send if the per-IP limit is
// defeated.
const GLOBAL_RATE_LIMIT_MAX = 50;
let globalHits = [];

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    // nginx appends the real connecting IP after whatever the client sent
    // (proxy_add_x_forwarded_for), so the last entry is the one nginx itself
    // observed - the first entry is attacker-controlled. If nginx is ever
    // reconfigured to not append (or a CDN sits in front of it), this needs
    // revisiting against however many trusted hops actually exist.
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();

  globalHits = globalHits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  globalHits.push(now);
  if (globalHits.length > GLOBAL_RATE_LIMIT_MAX) return true;

  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// ── Input sanitization ─────────────────────────────────────────
// This form's fields end up in email sent to arbitrary third parties
// (confirmToLead sends to whatever address the caller supplies, from the
// verified summitclient.io domain), so free-text fields are the entire
// attack surface for turning this into a phishing relay. Strip control
// characters (a field can't otherwise inject extra lines or structure into
// the plaintext email) and cap length (a field can't be used to stuff
// arbitrary bulk content into a "legitimate" email).
const CONTROL_CHARS = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']',
  'g'
);

function sanitizeField(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Email (Resend API) ─────────────────────────────────────────
// Requires RESEND_API_KEY env var. The summitclient.io domain must be
// verified in the Resend dashboard (DNS records at Namecheap) before
// sending from RESEND_FROM. Optional: RESEND_FROM, LEAD_NOTIFY_EMAIL.
async function sendEmail({ to, from, subject, text, html }, label) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY not configured, skipping ${label} email`);
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
        from: from || process.env.RESEND_FROM || 'Summit Client <leads@summitclient.io>',
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`${label} email failed:`, resp.status, body);
    }
  } catch (err) {
    // Never fail the request over an email issue. The lead is
    // already saved in Supabase regardless.
    // error.message, not the object: a PostgREST error carries `details` and
    // `hint` that can quote the offending row, so logging it whole writes the
    // record into a server log - outside every access control the database
    // enforces, retained, and shipped to whatever monitoring vendor is wired up.
    console.error(`${label} email failed:`, err instanceof Error ? err.message : String(err));
  }
}

async function notifyNewLead(lead) {
  await sendEmail({
    to: process.env.LEAD_NOTIFY_EMAIL || 'yanko@summitclient.io',
    subject: `New Summit lead: ${lead.clinic_name}`,
    text: `New signup lead\n\nName: ${lead.full_name}\nClinic: ${lead.clinic_name}\nEmail: ${lead.email}\nRole: ${lead.role || 'n/a'}`,
    html: `<p><strong>New signup lead</strong></p>
      <p>Name: ${escapeHtml(lead.full_name)}<br/>
      Clinic: ${escapeHtml(lead.clinic_name)}<br/>
      Email: ${escapeHtml(lead.email)}<br/>
      Role: ${escapeHtml(lead.role || 'n/a')}</p>`,
  }, 'lead notification');
}

async function confirmToLead(lead) {
  const firstName = (lead.full_name || '').trim().split(/\s+/)[0] || 'there';
  await sendEmail({
    to: lead.email,
    // Real, receiving alias (forwards to yanko@) — unlike leads@, replies
    // to this address actually land in the inbox instead of bouncing.
    from: process.env.RESEND_FROM_INFO || 'Summit Client <info@summitclient.io>',
    subject: `We've got your info, ${lead.clinic_name}`,
    text: `Hi ${firstName},\n\nThanks for reaching out about Summit Client for ${lead.clinic_name}. Someone from our team will be in touch within 1 business day to get you set up.\n\nIn the meantime, feel free to reply to this email with any questions.\n\nSummit Client`,
    html: `<p>Hi ${escapeHtml(firstName)},</p>
      <p>Thanks for reaching out about Summit Client for ${escapeHtml(lead.clinic_name)}. Someone from our team will be in touch within 1 business day to get you set up.</p>
      <p>In the meantime, feel free to reply to this email with any questions.</p>
      <p>Summit Client</p>`,
  }, 'lead confirmation');
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

  const cleanLead = {
    full_name: sanitizeField(full_name, 200),
    clinic_name: sanitizeField(clinic_name, 200),
    email: sanitizeField(email, 254),
    role: role ? sanitizeField(role, 100) : null,
  };

  if (!cleanLead.full_name || !cleanLead.clinic_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { error } = await supabaseAdmin.from('leads').insert(cleanLead);

  if (error) {
    console.error('Lead insert error:', error.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }

  await Promise.all([
    notifyNewLead(cleanLead),
    confirmToLead(cleanLead),
  ]);

  return res.status(200).json({ success: true });
}
