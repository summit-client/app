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
    return NextResponse.redirect('https://summitclient.io/login')
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}