import { createBrowserClient } from '@supabase/ssr'

const isProduction = process.env.NODE_ENV === 'production'

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
