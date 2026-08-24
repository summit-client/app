import { NextResponse, type NextRequest } from "next/server";

/**
 * Route-protection middleware (scaffold).
 *
 * Phase 1: portals are open demonstration shells, so this middleware only sets
 * security-relevant headers and marks portal routes as non-indexable.
 *
 * Phase 2: replace the pass-through below with an Auth.js session check, e.g.
 *
 *   import { auth } from "@/auth";
 *   export default auth((req) => {
 *     if (!req.auth) return NextResponse.redirect(new URL("/signin", req.url));
 *     // Role/permission checks per matched path...
 *   });
 *
 * and enforce least-privilege access using the Role/Permission models.
 */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/portal")) {
    res.headers.set("X-Robots-Tag", "noindex");
    // TODO(phase-2): enforce authentication + role-based authorization here.
  }
  return res;
}

export const config = {
  matcher: ["/portal/:path*"],
};
