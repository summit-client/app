import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sessionFreshness } from "@summit/proxy-auth";

/**
 * Auth gate for the employee portal (apps/employee, port 3004) — Next 16: file `proxy.ts`, export `proxy`.
 * Uses getUser() so the JWT is verified server-side, not just read from the
 * cookie.
 *
 * NEXT_PUBLIC_DEV_PREVIEW=1 lets the portal be explored on fixtures with no
 * Supabase project. It bypasses auth entirely, so it is gated twice here: the
 * flag must be "1" AND the build must not be production. Previously the flag
 * alone was enough, which meant one stray env value on the droplet would open
 * the portal to the internet. The flag name is unchanged — 9 other call sites
 * read it, and layout.tsx needs it client-side for the "Preview data" pill.
 */
const PREVIEW_BYPASS =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

const IS_PROD = process.env.NODE_ENV === "production";
const LOGIN_URL = IS_PROD ? "https://summitclient.io/login" : "http://localhost:3001/login";
const REFRESH_URL = IS_PROD ? "https://summitclient.io/api/auth/refresh" : "http://localhost:3001/api/auth/refresh";

export async function proxy(request: NextRequest) {
  if (PREVIEW_BYPASS) return NextResponse.next();

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
    refresh.searchParams.set("return_to", request.url);
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
