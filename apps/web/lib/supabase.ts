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
        cookies.forEach(({ name, value, options }) => {
          const opts = { ...options, domain: '.summitclient.io', path: '/' }
          let str = `${name}=${value}`
          if (opts.domain)   str += `; Domain=${opts.domain}`
          if (opts.path)     str += `; Path=${opts.path}`
          if (opts.maxAge)   str += `; Max-Age=${opts.maxAge}`
          if (opts.sameSite) str += `; SameSite=${opts.sameSite}`
          if (opts.secure)   str += `; Secure`
          document.cookie = str
        })
      },
    },
  }
)