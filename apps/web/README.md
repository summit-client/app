This is `@summit/web` - the Summit Client marketing site and sign-in hub
(`summitclient.io`), a Next.js (Pages Router) app in this pnpm/Turborepo
monorepo. See the root `CLAUDE.md` for the full picture (what this app is
part of, the other four portals, shared packages, deploy).

## Getting started

From the repo root:

```bash
pnpm install
pnpm --filter @summit/web dev   # http://localhost:3001
```

Needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` (server-side only, used by `/api/leads/create`)
in a local `.env.local` - not committed.

- `pages/index.tsx` - the marketing landing page.
- `pages/login.tsx`, `pages/signup.tsx`, `pages/forgot-password.jsx`,
  `pages/update-password.jsx`, `pages/auth/callback.jsx` - the auth UI. This
  is the one app in the monorepo allowed to redeem a refresh token or end a
  session (`pages/api/auth/refresh.js`, `pages/api/auth/signout.js`) - every
  other portal redirects here rather than touching the shared session cookie
  itself. See root `CLAUDE.md`'s "Traps that have already bitten" section.
- `pages/api/leads/create.js` - pre-launch lead capture (signup doesn't yet
  create real accounts - see the comment at the top of `pages/signup.tsx`).

## Build

```bash
pnpm turbo build --filter=@summit/web
```

Deploy is automatic on merge to `main` (GitHub Actions, pm2) - see root
`CLAUDE.md`'s Deploy section. Not deployed via Vercel.
