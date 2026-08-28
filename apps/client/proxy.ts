import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sessionFreshness } from "@summit/proxy-auth";
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
    const refresh = new URL(REFRESH_URL);
    refresh.searchParams.set("return_to", PUBLIC_ORIGIN + request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(refresh);
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
