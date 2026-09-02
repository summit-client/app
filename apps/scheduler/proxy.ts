import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFreshness, hasLoopGuard, LOOP_GUARD_COOKIE, LOOP_GUARD_MAX_AGE_SECONDS } from "@summit/proxy-auth";
import { loginUrl, refreshUrl, urlFor } from "@summit/portals";

/**
 * Auth gate for the scheduler portal (apps/scheduler, port 3000) — Next 16: file `proxy.ts`, export `proxy`.
 * Uses getUser() so the JWT is verified server-side, not just read from the
 * cookie.
 *
 * Scheduler used to have its own same-origin /login page — the only one of
 * the four portals that did, the other three always bounced to apps/web.
 * That page's "Send Magic Link" button called signInWithOtp() with no
 * shouldCreateUser guard, on a route proxy.ts had to exempt from the auth
 * gate (a login page can't require a session to reach it) — so it was a
 * second, unauthenticated, self-registration-capable entry point sitting
 * next to the one apps/web already owned. Removed; scheduler now bounces to
 * the shared hub like the other three, matching apps/data and apps/client
 * exactly.
 */
const LOGIN_URL = loginUrl();
const REFRESH_URL = refreshUrl();
// Behind nginx, req.url reflects the address the Next.js process itself is
// bound to (http://localhost:3000) rather than the public hostname the
// browser actually used - confirmed live on apps/employee's equivalent code:
// a stale session sent return_to=http://localhost:3004/ to apps/web, which
// correctly rejected it as an unknown origin (isKnownOrigin) but left the
// user stuck on an error page instead of coming back here.
// req.nextUrl.pathname/search are still correct either way (they come off
// the request line, not the Host header), so build the redirect target from
// a known public origin instead of trusting req.url's. Reads the same
// registry the nav bar and sign-in redirect do (@summit/portals), rather
// than a fifth hardcoded copy of this app's own host.
const PUBLIC_ORIGIN = urlFor("scheduler");

export async function proxy(req: NextRequest) {
  // All four portals share one .summitclient.io session cookie. If this
  // session is within 90s of expiry, getUser() below would attempt to
  // redeem the refresh token itself - the exact race that sends another
  // portal's concurrent request a hard "already used" error and bounces a
  // perfectly valid session to login. See @summit/proxy-auth's file header.
  const freshness = await sessionFreshness(req.cookies.getAll(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  if (freshness === "missing") {
    return NextResponse.redirect(new URL(LOGIN_URL));
  }

  if (freshness === "stale") {
    // Already bounced through refresh once and came back still stale - see
    // @summit/proxy-auth's LOOP_GUARD_COOKIE doc. Don't try again; a real
    // login is a better failure mode than a silent redirect loop.
    if (hasLoopGuard(req.cookies.getAll())) {
      return NextResponse.redirect(new URL(LOGIN_URL));
    }
    const refresh = new URL(REFRESH_URL);
    refresh.searchParams.set("return_to", PUBLIC_ORIGIN + req.nextUrl.pathname + req.nextUrl.search);
    const redirect = NextResponse.redirect(refresh);
    redirect.cookies.set(LOOP_GUARD_COOKIE, "1", {
      maxAge: LOOP_GUARD_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return redirect;
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

  if (!user) {
    return NextResponse.redirect(new URL(LOGIN_URL));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
