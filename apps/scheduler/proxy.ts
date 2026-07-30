import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  if (process.env.NODE_ENV === "development") {
    return res;
  }

  const hasSupabaseAuthCookie = req.cookies
    .getAll()
    .some(cookie => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  if (!hasSupabaseAuthCookie && req.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (hasSupabaseAuthCookie && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
