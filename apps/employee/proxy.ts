import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Auth gate for the clinician portal (Next 16: file `proxy.ts`, export `proxy`).
 * Uses getUser() so the JWT is verified server-side, not just read from the
 * cookie. DEV_PREVIEW bypasses auth entirely so the portal can be explored with
 * fixtures and no Supabase project.
 */
export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEV_PREVIEW === "1") return NextResponse.next();

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
