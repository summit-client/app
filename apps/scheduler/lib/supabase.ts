import { createBrowserClient } from '@supabase/ssr'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * supabase-js serialises every auth call behind a Web Lock keyed to the storage
 * key. A stale document on the same origin -- another tab, or one the browser
 * froze into bfcache mid token-refresh -- can hold that lock indefinitely. Every
 * later getSession() then sits in the lock queue: no error, no network request,
 * no console output. The app hangs on "Loading..." forever.
 *
 * Wait a bounded time for the lock, then give up and run unlocked. Losing the
 * cross-tab refresh guarantee is strictly better than never resolving.
 */
const lockWithTimeout = async <R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> => {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn()

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)

  try {
    return await navigator.locks.request(
      name,
      { mode: 'exclusive', signal: ac.signal },
      async () => fn()
    )
  } catch (err) {
    if (ac.signal.aborted) {
      console.warn(`[supabase] lock "${name}" not acquired in 5s; proceeding unlocked`)
      return fn()
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { lock: lockWithTimeout },
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
