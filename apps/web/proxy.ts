import { NextResponse, NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
	if (process.env.NODE_ENV === 'development') {
		return NextResponse.next()
	}

	const protectedPaths = ['/dashboard', '/admin']
	const isProtected = protectedPaths.some(path =>
		request.nextUrl.pathname.startsWith(path)
	)

	if (!isProtected) {
		return NextResponse.next()
	}

	const hasSupabaseAuthCookie = request.cookies
		.getAll()
		.some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))

	if (!hasSupabaseAuthCookie) {
		return NextResponse.redirect(new URL('/login', request.url))
	}

	return NextResponse.next()
}

export const config = {
	matcher: ['/dashboard/:path*', '/admin/:path*'],
}
