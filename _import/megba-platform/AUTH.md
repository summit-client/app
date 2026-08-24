# Authentication & Authorization (Phase 2 wiring guide)

Phase 1 ships portals as open demonstration shells. This guide describes how to
turn on real authentication and role-based access control.

## Recommended: Auth.js (NextAuth v5)

```bash
npm install next-auth@beta
```

Create `src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const user = await prisma.user.findUnique({ where: { email: String(c.email) } });
        if (user?.passwordHash && verifyPassword(String(c.password), user.passwordHash)) return user;
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const roles = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
        token.roles = roles.map((r) => r.role.name);
        token.orgId = (user as any).organizationId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).roles = token.roles;
      (session.user as any).orgId = token.orgId;
      return session;
    },
  },
});
```

Add the route handler `src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/auth";
```

## Prisma client singleton

Create `src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

## Password hashing

The seed uses Node `scrypt` (format `scrypt:salt:hash`). Add a matching verifier
in `src/lib/password.ts`, or switch to `bcrypt`/Argon2 for production.

## Route protection

Replace the pass-through in `src/middleware.ts`:

```ts
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/portal")) {
    if (!req.auth) return Response.redirect(new URL("/signin", req.url));
    // Per-portal role gate, e.g.:
    const roles: string[] = (req.auth.user as any)?.roles ?? [];
    const seg = pathname.split("/")[2]; // learner | school | supervisor | …
    const map: Record<string, string> = {
      admin: "SUPER_ADMIN", organization: "ORG_ADMIN", school: "SCHOOL_ADMIN",
      supervisor: "SUPERVISOR", consultant: "CONSULTANT", learner: "LEARNER",
    };
    if (seg && map[seg] && !roles.includes(map[seg]) && !roles.includes("SUPER_ADMIN")) {
      return Response.redirect(new URL("/portal", req.url));
    }
  }
});

export const config = { matcher: ["/portal/:path*"] };
```

## Roles & permissions

The `Role`, `Permission`, `UserRole`, and `RolePermission` models implement RBAC.
The seed grants `SUPER_ADMIN` every permission. Enforce **least privilege**:
gate server actions and API routes with a `hasPermission(session, "course:publish")`
helper backed by `RolePermission`.

## Organization data separation

Scoped models carry `organizationId`. Always filter queries by the session's
`orgId` for non-super-admins to keep tenants isolated.
