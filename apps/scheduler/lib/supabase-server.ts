import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Per-request authenticated server client for apps/scheduler's Pages Router
 * API routes - same exported shape/signature as apps/client/lib/supabase-server.ts
 * (`createClient(req, res)`), built from the same cookie-forwarding pattern
 * proxy.ts already uses for this app's own auth gate (createServerClient from
 * @supabase/ssr, domain-scoped cookie writes in production).
 *
 * apps/scheduler didn't have this file before - proxy.ts built its client
 * inline since it only ever needed one. A second call site
 * (pages/api/calendar/feed-token.ts) is why this exists now: a small shared
 * builder instead of a second inline copy that could drift from proxy.ts's.
 *
 * IMPORTANT - this app's proxy.ts matcher deliberately excludes /api
 * ("/((?!_next/static|_next/image|favicon.ico|api).*)"), unlike apps/client's
 * (which has no such exclusion). That means API routes here get NONE of
 * proxy.ts's cross-portal-refresh-token-race protection for free - see
 * pages/api/match.ts's own header, which had to add a sessionFreshness()
 * check directly for exactly this reason. Any new API route in this app that
 * calls getUser() (via the client this function returns, or otherwise) needs
 * that same check first; this file only builds the client, it does not
 * perform that check itself.
 */
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
