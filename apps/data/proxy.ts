import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  if (process.env.NODE_ENV === 'development') {
    return response
  }

  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))

  if (!hasSupabaseAuthCookie) {
    const loginTarget = process.env.NEXT_PUBLIC_WEB_APP_URL
      ?? (process.env.NODE_ENV === 'production' ? 'https://summitclient.io' : 'http://127.0.0.1:3001')

    return NextResponse.redirect(new URL('/login', loginTarget).toString())
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}