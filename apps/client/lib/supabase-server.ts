import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'

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
          res.setHeader(
            'Set-Cookie',
            cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, {
                ...options,
                ...(isProduction ? { domain: '.summitclient.io' } : {}),
                path: '/',
              })
            )
          )
        },
      },
    }
  )
}
