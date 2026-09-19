import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'
import { mergeSetCookie } from './auth-guards'

/**
 * An unset variable here throws supabase-js's generic "Your project's URL and
 * Key are required to create a Supabase client!" from inside whichever API
 * route ran first - it names no variable, no file, and no app. The `!`
 * assertions below were the cause: they satisfy TypeScript and do nothing at
 * runtime. Same fix as @summit/db's and apps/client's own required().
 */
function required(name: string): string {
  const value = process.env[name]
  if (value) return value
  throw new Error(
    `${name} is not set. Add it to apps/web/.env.local with ` +
    `NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`
  )
}

export function createClient(req: NextApiRequest, res: NextApiResponse) {
  const isProduction = process.env.NODE_ENV === 'production'

  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
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
