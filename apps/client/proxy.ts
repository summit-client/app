import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sessionFreshness, hasLoopGuard, LOOP_GUARD_COOKIE, LOOP_GUARD_MAX_AGE_SECONDS } from "@summit/proxy-auth";
import { loginUrl, refreshUrl, urlFor } from "@summit/portals";

/**
 * Auth gate for the family portal (apps/client, port 3003) — Next 16: file `proxy.ts`, export `proxy`.
 * Uses getUser() so the JWT is verified server-side, not just read from the
 * cookie.
 *
 * Previously the only guard was a getServerSideProps check duplicated on each
 * page, so a new page was public by default unless someone remembered to add
 * it. This makes every page protected unless explicitly excluded below.
 */
// NEXT_PUBLIC_LOGIN_URL is this app's own decided override (PR #32) for the
// sign-in link specifically - kept as the outermost override here rather
// than folded into @summit/portals's NEXT_PUBLIC_URL_WEB, since the two
// have never meant the same thing (a full /login URL vs. apps/web's origin)
// and only this portal has ever set it.
const LOGIN_URL = process.env.NEXT_PUBLIC_LOGIN_URL || loginUrl();
// The refresh endpoint only ever lives at apps/web, regardless of any
// NEXT_PUBLIC_LOGIN_URL override for the sign-in page itself.
const REFRESH_URL = refreshUrl();
// Behind nginx, request.url reflects the address the Next.js process itself
// is bound to (http://localhost:3003) rather than the public hostname the
// browser actually used - confirmed live on apps/employee's equivalent code:
// a stale session sent return_to=http://localhost:3004/ to apps/web, which
// correctly rejected it as an unknown origin (isKnownOrigin) but left the
// user stuck on an error page instead of coming back here.
// request.nextUrl.pathname/search are still correct either way (they come
// off the request line, not the Host header), so build the redirect target
// from a known public origin instead of trusting request.url's. Reads the
// same registry the nav bar and sign-in redirect do (@summit/portals),
// rather than a fourth hardcoded copy of this app's own host.
const PUBLIC_ORIGIN = urlFor("client");

export async function proxy(request: NextRequest) {
  // All four portals share one .summitclient.io session cookie. If this
  // session is within 90s of expiry, getUser() below would attempt to
  // redeem the refresh token itself - the exact race that sends another
  // portal's concurrent request a hard "already used" error and bounces a
  // perfectly valid session to login. See @summit/proxy-auth's file header.
  const freshness = await sessionFreshness(request.cookies.getAll(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (freshness === "missing") {
    return NextResponse.redirect(new URL(LOGIN_URL));
  }
  if (freshness === "stale") {
    // Already bounced through refresh once and came back still stale - see
    // @summit/proxy-auth's LOOP_GUARD_COOKIE doc. Don't try again; a real
    // login is a better failure mode than a silent redirect loop.
    if (hasLoopGuard(request.cookies.getAll())) {
      return NextResponse.redirect(new URL(LOGIN_URL));
    }
    const refresh = new URL(REFRESH_URL);
    refresh.searchParams.set("return_to", PUBLIC_ORIGIN + request.nextUrl.pathname + request.nextUrl.search);
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

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, {
              ...options,
              domain: process.env.NODE_ENV === "production" ? ".summitclient.io" : undefined,
            });
          }
        },
      },
    },
  );

  // freshness === "fresh" guarantees this call cannot itself trigger a
  // refresh (auth-js's own local expiry check uses the same 90s margin), so
  // this is exactly as safe as it was before.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(LOGIN_URL));
  }
  return response;
}

// Brand chrome only. Every page renders /summit-mark-64.png and _app.tsx
// links /favicon.svg, and both used to cost a full Supabase auth round trip
// before Next handed back a file that is world-readable on disk and
// byte-identical for every user - gating them was never a boundary. The
// lookahead is a PREFIX test, not path equality: an unanchored
// `summit-mark-64.png` entry would also un-gate `/summit-mark-64.png.anything`
// and `/favicon.svg/whatever`, so each filename is anchored with `$` (the
// escapes survive path-to-regexp - checked against the regex Next actually
// compiles this into). `_next/static` and `_next/image` stay unanchored
// because they are directories. The list is kept identical to the other three
// portals' rather than trimmed per app; a filename an app does not serve just
// 404s. Unlike apps/scheduler this matcher deliberately still covers /api,
// because these Pages Router routes rely on the gate (see
// pages/api/calendar/feed-token.ts) - with exactly one exception:
//
// `api/calendar/feed/` is the subscribable ICS feed, and it is the one route
// here that is SUPPOSED to be reachable without a cookie. A calendar app
// polling a webcal:// URL in the background sends no session, so that route
// was written token-gated instead: it checks the token itself and scopes
// every query by hand against an RLS-bypassing lookup client (read its
// header). Gating it meant the proxy redirected every poll to /login, so
// family calendar subscriptions never worked at all - this is a correctness
// fix, not a performance one.
//
// The trailing slash is load-bearing. These entries are prefix tests, so a
// bare `api/calendar/feed` would also un-gate `/api/calendar/feedback...`;
// requiring the slash means only the feed's own token segment matches. It is
// NOT `$`-anchored like the asset entries above because the token is a real
// path segment after it.
export const config = {
  matcher: ["/((?!_next/static|_next/image|api/calendar/feed/|favicon\\.ico$|favicon\\.svg$|icon\\.svg$|summit-mark-64\\.png$).*)"],
};
