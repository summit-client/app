import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_REDIRECTS } from '../lib/role-redirects'
import { withTimeout } from '../lib/withTimeout'
import { describeAuthError } from '../lib/authErrors'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import SubmitButton from '../components/auth/SubmitButton'

const AUTH_TIMEOUT_MS = 15000

function validateEmail(value: string) {
  if (!value.trim()) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
  return ''
}

function validatePassword(value: string) {
  if (!value) return 'Enter your password.'
  return ''
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError]     = useState('')
  const [loading, setLoading]         = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return

    const errors = { email: validateEmail(email), password: validatePassword(password) }
    setFieldErrors(errors)
    setFormError('')
    if (errors.email || errors.password) return

    setLoading(true)

    // This is the one place in apps/web that verifies a fresh credential
    // pair, not a possibly-stale cookie - the cross-portal getUser()-vs-
    // getSession() race in CLAUDE.md doesn't apply to signInWithPassword()
    // itself. It DOES apply to the profile-role lookup right after: that
    // runs under the session signInWithPassword() just created, which is
    // brand new (not stale), so no refresh race there either.
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        AUTH_TIMEOUT_MS,
        'Sign-in is taking longer than expected. Please try again.',
      )

      if (error) {
        setFormError(describeAuthError(error))
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await withTimeout(
        supabase.from('profiles').select('role').eq('id', data.user.id).single(),
        AUTH_TIMEOUT_MS,
        'Signed in, but loading your account is taking longer than expected. Please try again.',
      )

      if (profileError) {
        setFormError("We couldn't finish signing you in. Please try again.")
        setLoading(false)
        return
      }

      const role = profile?.role
      const redirect = role ? ROLE_REDIRECTS[role] : null

      if (redirect) {
        window.location.href = redirect
        // Deliberately not resetting `loading` here - the page is navigating
        // away, and leaving the button in its busy state avoids a flash of
        // a re-enabled form right before the redirect fires.
      } else {
        setFormError('Your account is pending activation. Contact your administrator.')
        setLoading(false)
      }
    } catch (err) {
      // The original version had no try/catch at all: a thrown error (a
      // network failure, a dropped connection - anything that rejects
      // rather than resolving with `{ error }`) left `loading` stuck `true`
      // forever with no message and no way to retry. Every exit above also
      // resets `loading` explicitly rather than relying on `finally`, so the
      // one branch that navigates away can skip it instead of flashing the
      // form back to enabled a moment before the browser leaves the page.
      setFormError(describeAuthError(err))
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Sign in to Summit Client" subtitle="Welcome back. Enter your details to continue.">
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
          error={fieldErrors.email}
          required
        />

        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        <SubmitButton loading={loading} loadingLabel="Signing in…">
          Sign in
        </SubmitButton>

        <div className="auth-links">
          <a href="/forgot-password" className="auth-link">Forgot password?</a>
          <span>
            No account? <a href="/signup" className="auth-link">Sign up</a>
          </span>
        </div>
      </form>
    </AuthCard>
  )
}
