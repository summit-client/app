import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Every page in this portal loads its data through here, so an absent
 * Supabase configuration surfaces as supabase-js's generic "Your project's URL
 * and Key are required to create a Supabase client!" thrown from inside
 * whichever getServerSideProps ran first. That message names no variable, no
 * file, and no app - it points at a dashboard URL - and it is what a developer
 * sees on all ten pages of a fresh checkout.
 *
 * The `!` assertions above it were the cause: they assert non-null to
 * TypeScript and do nothing at runtime, so an unset variable travels one frame
 * further before failing, arriving stripped of the context that would explain
 * it.
 *
 * Checked here instead, naming what is missing and where it goes. This is the
 * same fix as @summit/proxy-auth's storageKeyFor(): one unset variable should
 * say which one.
 */
function required(name: string): string {
  const value = process.env[name]
  if (value) return value
  throw new Error(
    `${name} is not set, so the family portal cannot reach Supabase. ` +
    `Create apps/client/.env.local with NEXT_PUBLIC_SUPABASE_URL and ` +
    `NEXT_PUBLIC_SUPABASE_ANON_KEY. Note that NEXT_PUBLIC_DEV_PREVIEW=1 ` +
    `bypasses this portal's auth gate but NOT its data loading - every page ` +
    `here queries Supabase in getServerSideProps and there is no fixture ` +
    `path, so previewing it still needs a real project. See BLOCKED-client.md.`
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
