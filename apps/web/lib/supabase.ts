import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const isBrowser = typeof window !== 'undefined'

export const supabase = isBrowser
  ? createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
            return match ? decodeURIComponent(match[2]) : undefined
          },
          set(name, value, options) {
            document.cookie = `${name}=${encodeURIComponent(value)}; domain=.summitclient.io; path=/; max-age=${options?.maxAge ?? 31536000}; SameSite=Lax`
          },
          remove(name) {
            document.cookie = `${name}=; domain=.summitclient.io; path=/; max-age=0`
          },
        },
      }
    )
  : createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )