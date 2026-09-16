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
          // "Remember me" unchecked -> omit Max-Age entirely, which makes
          // this a browser-session cookie: it survives reloads and new tabs
          // like any cookie, but is discarded when the browser itself fully
          // closes, instead of surviving for as long as opts.maxAge (the
          // SDK's own refresh-token lifetime) says it otherwise would.
          if (opts.maxAge && remember) str += `; Max-Age=${opts.maxAge}`
          str += `; SameSite=${opts.sameSite || 'Lax'}`
          if (isHttps) str += `; Secure`
          document.cookie = str
        })
      },
    },
  }
)
