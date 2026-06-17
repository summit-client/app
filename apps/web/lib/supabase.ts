import { createBrowserClient } from '@supabase/ssr'

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
          const opts = { ...options, domain: '.summitclient.io', path: '/' }
          let str = `${name}=${value}`
          str += `; Domain=${opts.domain}`
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