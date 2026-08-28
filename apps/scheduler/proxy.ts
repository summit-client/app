import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFreshness } from "@summit/proxy-auth";

// Scheduler's sign-in page is same-origin (/login), unlike the other three
// portals which bounce to apps/web. The refresh endpoint, though, only ever
// lives at apps/web - see @summit/proxy-auth's file header for why no portal
// is allowed to redeem a refresh token itself.
const IS_PROD = process.env.NODE_ENV === "production";
const REFRESH_URL = IS_PROD ? "https://summitclient.io/api/auth/refresh" : "http://localhost:3001/api/auth/refresh";

export async function proxy(req: NextRequest) {
  // All four portals share one .summitclient.io session cookie. If this
  // session is within 90s of expiry, getUser() below would attempt to
  // redeem the refresh token itself - the exact race that sends another
  // portal's concurrent request a hard "already used" error and bounces a
  // perfectly valid session to login. See @summit/proxy-auth's file header.
  const freshness = await sessionFreshness(req.cookies.getAll(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  if (freshness === "missing") {
    if (req.nextUrl.pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  if (freshness === "stale") {
    const refresh = new URL(REFRESH_URL);
    refresh.searchParams.set("return_to", req.url);
    return NextResponse.redirect(refresh);
  }

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
  getAll: () => req.cookies.getAll(),
  setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, {
      ...options,
      domain: process.env.NODE_ENV === "production" ? ".summitclient.io" : undefined,
    })
  ),
},
    }
  );

  // freshness === "fresh" guarantees this call cannot itself trigger a
  // refresh (auth-js's own local expiry check uses the same 90s margin), so
  // this is exactly as safe as it was before.
  // getUser() verifies the JWT against the auth server; getSession() only
  // reads the cookie, which is enough to spoof a stale or forged session.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && req.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (user && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
