import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'
import { mergeSetCookie } from './auth-guards'

export function createClient(req: NextApiRequest, res: NextApiResponse) {
  const isProduction = process.env.NODE_ENV === 'production'

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value as string }))
        },
        setAll(cookiesToSet) {
          const serialized = cookiesToSet.map(({ name, value, options }) =>
            serializeCookieHeader(name, value, {
              ...options,
              ...(isProduction ? { domain: '.summitclient.io' } : {}),
              path: '/',
            })
          )
          // Append, never replace: res.setHeader drops whatever was
          // already queued, and @supabase/auth-js writes cookies more than
          // once in a request. See mergeSetCookie() for the whole reason.
          res.setHeader('Set-Cookie', mergeSetCookie(res.getHeader('Set-Cookie'), serialized))
        },
      },
    }
  )
}
