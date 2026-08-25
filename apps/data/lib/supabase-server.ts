import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// The cookie domain must NOT be set on localhost, or no session cookie is
// readable in local dev. Mirrors apps/web/lib/supabase-server.ts.
const isProduction = process.env.NODE_ENV === 'production'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(cookie => ({
            name: cookie.name,
            value: cookie.value,
          }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...(isProduction ? { domain: '.summitclient.io' } : {}),
              path: '/',
            })
          })
        },
      },
    }
  )
}
