import { useState } from 'react'

/* ============================================================
   OLD SIGNUP FLOW (real account creation via supabase.auth.signUp)
   Disabled pre-launch. Re-activate this component and remove the
   lead-gen version below once public signups are turned back on
   in Supabase Auth settings.
   ============================================================

import { supabase } from '../lib/supabase'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, clinic_name: clinicName }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Update profiles row created by the trigger with full_name
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', data.user.id)
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ width: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Check your email</h1>
          <p style={{ color: '#555', margin: 0 }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account then sign in.</p>
          <a href="/login" style={{ color: '#1A3F5C', fontSize: 14 }}>Back to sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Create your account</h1>

        {error && <p style={{ color: 'red', margin: 0, fontSize: 14 }}>{error}</p>}

        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="text"
          placeholder="Clinic name"
          value={clinicName}
          onChange={e => setClinicName(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button
          onClick={handleSignup}
          disabled={loading}
          style={{ padding: '10px 12px', fontSize: 15, background: '#1A3F5C', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  )
}

   ============================================================
   END OLD SIGNUP FLOW
   ============================================================ */

/* ============================================================
   ACTIVE: Lead-gen signup (pre-launch)
   Inserts into `leads` table via /api/leads/create.
   No auth account created. Swap back to the block above once
   public signups are re-enabled in Supabase Auth settings.
   ============================================================ */

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [email, setEmail] = useState('')
  const [hpField, setHpField] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/leads/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        clinic_name: clinicName,
        email,
        hp_field: hpField
      })
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ width: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Thanks for your interest</h1>
          <p style={{ color: '#555', margin: 0 }}>We'll be in touch shortly.</p>
          <a href="/" style={{ color: '#1A3F5C', fontSize: 14 }}>Back to home</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Get started with Summit Client</h1>

        {error && <p style={{ color: 'red', margin: 0, fontSize: 14 }}>{error}</p>}

        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="text"
          placeholder="Clinic name"
          value={clinicName}
          onChange={e => setClinicName(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />

        {/* honeypot field, hidden from real users */}
        <input
          type="text"
          value={hpField}
          onChange={e => setHpField(e.target.value)}
          style={{ display: 'none' }}
          tabIndex={-1}
          autoComplete="off"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ padding: '10px 12px', fontSize: 15, background: '#1A3F5C', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {loading ? 'Submitting...' : 'Get started'}
        </button>

        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  )
}