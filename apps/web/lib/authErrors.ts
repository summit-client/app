import { TimeoutError } from './withTimeout'

/**
 * Turns a raw Supabase/network error into copy a user should actually see:
 * human, specific enough to act on, and never confirming or denying that a
 * given email has an account (Supabase's own "Invalid login credentials"
 * already doesn't distinguish wrong-email from wrong-password - this keeps
 * that property for the cases this app adds on top, like the timeout and
 * network-failure paths).
 */
export function describeAuthError(err: unknown): string {
  if (err instanceof TimeoutError) return err.message

  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''

  // fetch() rejects with a bare TypeError ("Failed to fetch") on a network
  // failure (offline, DNS, CORS, connection reset) - but Supabase's client
  // catches that itself and re-wraps it (AuthRetryableFetchError and
  // similar), so matching only `instanceof TypeError` misses it whenever
  // the call came from supabase-js rather than a raw fetch. Match on the
  // message text too, covering both.
  if (err instanceof TypeError || /failed to fetch|network ?error|load failed/i.test(message)) {
    return "We couldn't reach the server. Check your connection and try again."
  }

  if (/invalid login credentials/i.test(message)) {
    return 'The email or password you entered is incorrect.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email address before signing in. Check your inbox for the confirmation link.'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Please wait a minute and try again."
  }
  if (/user already registered/i.test(message)) {
    return 'An account with that email already exists.'
  }

  return message || 'Something went wrong. Please try again.'
}
