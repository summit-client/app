import { FormEvent, useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import SubmitButton from '../components/auth/SubmitButton'

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

function validateFullName(value: string) {
  if (!value.trim()) return 'Enter your full name.'
  return ''
}

function validateClinicName(value: string) {
  if (!value.trim()) return 'Enter your clinic name.'
  return ''
}

function validateEmail(value: string) {
  if (!value.trim()) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
  return ''
}

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [email, setEmail] = useState('')
  const [hpField, setHpField] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; clinicName?: string; email?: string }>({})
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return

    const errors = {
      fullName: validateFullName(fullName),
      clinicName: validateClinicName(clinicName),
      email: validateEmail(email),
    }
    setFieldErrors(errors)
    setFormError('')
    if (errors.fullName || errors.clinicName || errors.email) return

    setLoading(true)

    try {
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          clinic_name: clinicName,
          email,
          hp_field: hpField,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.")
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthCard title="Thanks for your interest" subtitle="We'll be in touch shortly.">
        <a href="/" className="auth-back-link">← Back to home</a>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Get early access"
      subtitle="Launching Q4 2026 — sign up for updates and we'll reach out when your clinic can get started."
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="auth-form-error" role="alert">{formError}</p>
        )}

        <FormField
          label="Full name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          required
        />
        <FormField
          label="Clinic name"
          type="text"
          autoComplete="organization"
          value={clinicName}
          onChange={e => setClinicName(e.target.value)}
          error={fieldErrors.clinicName}
          required
        />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />

        {/* honeypot field, hidden from real users */}
        <input
          type="text"
          value={hpField}
          onChange={e => setHpField(e.target.value)}
          style={{ display: 'none' }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <SubmitButton loading={loading} loadingLabel="Submitting…">
          Get started
        </SubmitButton>

        <div className="auth-links">
          <span>
            Already have an account? <a href="/login" className="auth-link">Sign in</a>
          </span>
        </div>
      </form>
    </AuthCard>
  )
}