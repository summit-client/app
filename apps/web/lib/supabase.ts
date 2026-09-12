import { createBrowserClient } from '@supabase/ssr'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * This client is built at module evaluation, so an unset variable throws
 * while the page is still importing - before any component or error boundary
 * exists to catch it, and every route fails with a message that names neither
 * the variable nor this file. The `!` assertions below were the cause: they
 * satisfy TypeScript and do nothing at runtime. Same fix as @summit/db's and
 * apps/client's own required().
 */
function required(name: string): string {
  const value = process.env[name]
  if (value) return value
  throw new Error(
    `${name} is not set. Add it to apps/web/.env.local with ` +
    `NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`
  )
}

export const supabase = createBrowserClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
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
