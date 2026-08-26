import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export async function proxy(request: NextRequest) {
  if (PREVIEW_BYPASS) return NextResponse.next();

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = process.env.NODE_ENV === "production"
      ? "https://summitclient.io/login"
      : "http://localhost:3000/login";
    return NextResponse.redirect(new URL(login));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
