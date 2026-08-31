import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { describeAuthError } from '../lib/authErrors'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import SubmitButton from '../components/auth/SubmitButton'

const AUTH_TIMEOUT_MS = 15000

function validateEmail(value) {
  if (!value.trim()) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
  return ''
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading || sent) return

    const error = validateEmail(email)
    setFieldError(error)
    setFormError('')
    if (error) return

    setLoading(true)

    try {
      // Supabase's resetPasswordForEmail already doesn't error for an email
      // with no account - it silently succeeds either way, precisely so
      // this form can't be used to test which addresses exist. Matching
      // that: any error surfaced here is a real failure (network/rate
      // limit), never "no such account".
      const { error: authError } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback`,
        }),
        AUTH_TIMEOUT_MS,
        'This is taking longer than expected. Please try again.',
      )

      if (authError) {
        setFormError(describeAuthError(authError))
        setLoading(false)
        return
      }

      setSent(true)
      setLoading(false)
    } catch (err) {
      setFormError(describeAuthError(err))
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your email and we'll send you a reset link."}
    >
      {sent ? (
        <>
          <p className="auth-form-success" role="status">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.
          </p>
          <a href="/login" className="auth-back-link">← Back to sign in</a>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <p className="auth-form-error" role="alert">{formError}</p>
          )}

          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            error={fieldError}
            required
          />

          <SubmitButton loading={loading} loadingLabel="Sending…">
            Send reset link
          </SubmitButton>

          <a href="/login" className="auth-back-link">← Back to sign in</a>
        </form>
      )}
    </AuthCard>
  )
}
