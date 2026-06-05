import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? decodeURIComponent(match[2]) : undefined
      },
      set(name, value, options) {
        const domain = '.summitclient.io'
        document.cookie = `${name}=${encodeURIComponent(value)}; domain=${domain}; path=/; max-age=${options?.maxAge ?? 31536000}; SameSite=Lax`
      },
      remove(name) {
        document.cookie = `${name}=; domain=.summitclient.io; path=/; max-age=0`
      },
    },
  }
)