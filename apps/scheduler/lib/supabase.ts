import { createBrowserClient } from '@supabase/ssr'

const isProduction = process.env.NODE_ENV === 'production'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Explicit rather than relying on the library default. On the version
      // this app shipped with, this value arrived at navigatorLock as
      // `undefined`, so `if (acquireTimeout > 0)` was false: no abort timer was
      // ever armed and the lock request waited forever with no error and no
      // network call -- a permanent, silent deadlock. With a positive value,
      // gotrue times out after 5s and steals the orphaned lock to recover.
      lockAcquireTimeout: 5000,
    },
    // Mirrors apps/web/lib/supabase.ts. Without these the default writer sets a
    // host-only cookie on scheduler.summitclient.io, which shadows the
    // .summitclient.io cookie written at login.
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
        cookies.forEach(({ name, value, options }) => {
          const opts = { ...options, path: '/' }
          let str = `${name}=${value}`
          if (isProduction) str += `; Domain=.summitclient.io`
          str += `; Path=${opts.path}`
          if (opts.maxAge) str += `; Max-Age=${opts.maxAge}`
          str += `; SameSite=${opts.sameSite || 'Lax'}`
          if (isHttps) str += `; Secure`
          document.cookie = str
        })
      },
    },
  }
)
