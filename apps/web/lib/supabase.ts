import { createBrowserClient } from '@supabase/ssr'

const isProduction = process.env.NODE_ENV === 'production'

// "Remember me" on the login form. Read synchronously (not React state) by
// setAll() below, which the SDK calls on its own schedule (sign-in, token
// refresh) - a plain localStorage flag is the simplest thing both sides can
// agree on. Defaults to true (today's actual behavior, unchanged) so an
// existing session isn't retroactively shortened just because this shipped.
const REMEMBER_ME_KEY = 'summit-remember-me'

export function setRememberMePreference(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? '1' : '0')
  } catch {
    /* private mode, or storage disabled - falls back to the default below */
  }
}

function rememberMePreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) !== '0'
  } catch {
    return true
  }
}

// The address only - never the password, which is not stored anywhere on the
// device. This is the half of "remember me" the user can actually see: it is
// what stops them retyping their email on every visit.
const LAST_EMAIL_KEY = 'summit-last-email'

export function setLastEmail(email: string): void {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    /* private mode, or storage disabled - the form just starts empty */
  }
}

export function getLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export function clearLastEmail(): void {
  try {
    localStorage.removeItem(LAST_EMAIL_KEY)
  } catch {
    /* nothing was stored in the first place */
  }
}

// The shared session cookie the SDK writes: `sb-<project ref>-auth-token`,
// plus `.0`/`.1` chunks once it outgrows a single cookie. Deliberately does
// not match `-auth-token-code-verifier`, which exists mid-PKCE-flow without
// there being a session.
//
// An empty value counts as absent, matching how the SDK's own combineChunks
// reads it - a writer that blanks the value without emitting Max-Age=0
// leaves the name behind, and treating that as "signed in" would be wrong.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

export function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').filter(Boolean).some(entry => {
    const [name, ...rest] = entry.split('=')
    return SESSION_COOKIE.test(name) && rest.join('=') !== ''
  })
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() {
        if (typeof document === 'undefined') return []
        return document.cookie.split('; ').filter(Boolean).map(c => {
          const [name, ...rest] = c.split('=')
          return { name, value: rest.join('=') }
        })
      },
      setAll(cookies) {
        if (typeof document === 'undefined') return
        const isHttps = location.protocol === 'https:'
        const remember = rememberMePreference()
        cookies.forEach(({ name, value, options }) => {
          const opts = { ...options, path: '/' }
          let str = `${name}=${value}`
          if (isProduction) str += `; Domain=.summitclient.io`
          str += `; Path=${opts.path}`
          // maxAge 0 is how the SDK signals a deletion, and 0 is falsy: the
          // single `opts.maxAge && remember` guard this replaces therefore
          // dropped Max-Age from an intended expiry too, turning every
          // deletion into a value-less session cookie that lingered under
          // the same name. A deletion is never subject to the preference.
          //
          // Past that, "remember me" unchecked -> omit Max-Age entirely,
          // which makes this a browser-session cookie: it survives reloads
          // and new tabs like any cookie, but is discarded when the browser
          // itself fully closes, instead of surviving for as long as
          // opts.maxAge (the SDK's own refresh-token lifetime) says it
          // otherwise would.
          if (opts.maxAge === 0) str += `; Max-Age=0`
          else if (remember && opts.maxAge) str += `; Max-Age=${opts.maxAge}`
          str += `; SameSite=${opts.sameSite || 'Lax'}`
          if (isHttps) str += `; Secure`
          document.cookie = str
        })
      },
    },
  }
)
