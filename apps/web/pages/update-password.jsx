import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { describeAuthError } from '../lib/authErrors'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import SubmitButton from '../components/auth/SubmitButton'

const AUTH_TIMEOUT_MS = 15000
const MIN_PASSWORD_LENGTH = 8

function validatePassword(value) {
  if (!value) return 'Enter a new password.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  return ''
}

export default function UpdatePassword() {
  const router = useRouter()
  const [newPass, setNewPass] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [authorized, setAuthorized] = useState(false) // guard: only allow via reset link
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    // Supabase puts a recovery session in the URL hash when coming from a
    // reset email, and getSession() resolves it automatically if the hash
    // is present. This is the one legitimate direct getSession() call in
    // apps/web (see CLAUDE.md's cross-portal refresh-token race): it isn't
    // gating access to a possibly-stale existing session, it's picking up
    // a brand-new recovery session that only exists because the user just
    // clicked a first-party link into this exact page.
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setCheckingSession(false)
      if (session) {
        setAuthorized(true)
      } else {
        router.replace('/login')
      }
    })
    return () => { cancelled = true }
  }, [router])

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return

    const error = validatePassword(newPass)
    setFieldError(error)
    setFormError('')
    if (error) return

    setLoading(true)

    try {
      const res = await withTimeout(
        fetch('/api/auth/update-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPass }),
        }),
        AUTH_TIMEOUT_MS,
        'This is taking longer than expected. Please try again.',
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFormError(data.error || 'Update failed. Please try again.')
        setLoading(false)
        return
      }

      setDone(true)
      window.location.href = '/login'
      // Not resetting `loading` here either - see the same note in login.tsx.
    } catch (err) {
      setFormError(describeAuthError(err))
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <AuthCard title="Set new password">
        <p className="auth-subtitle" role="status">Checking your reset link…</p>
      </AuthCard>
    )
  }

  if (!authorized) return null // redirecting to /login

  return (
    <AuthCard title="Set new password" subtitle="Choose a new password for your account.">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="auth-form-error" role="alert">{formError}</p>
        )}
        {done && (
          <p className="auth-form-success" role="status">Password updated! Redirecting…</p>
        )}

        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPass}
          onChange={e => setNewPass(e.target.value)}
          error={fieldError}
          required
        />

        <SubmitButton loading={loading} loadingLabel="Updating…">
          Update password
        </SubmitButton>
      </form>
    </AuthCard>
  )
}
