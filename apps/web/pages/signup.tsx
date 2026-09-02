import { FormEvent, useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import SubmitButton from '../components/auth/SubmitButton'

/* ============================================================
   ACTIVE: Lead-gen signup (pre-launch)
   Inserts into `leads` table via /api/leads/create.
   No auth account created. The real account-creation flow (a plain
   supabase.auth.signUp() call, a profiles.full_name update, and a
   "check your email" success screen) is what this replaces - see
   git history (this file, pre-lead-gen) if it needs to come back once
   public signups are re-enabled in Supabase Auth settings; it isn't kept
   inline here as dead code.
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