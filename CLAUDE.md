# Summit — working notes for Claude

Read this before changing anything. It is the accumulated context that is not
obvious from the code, including several failure modes that have already cost
real time.

## What this is

A pnpm + Turborepo monorepo, Next.js 16.2.x with Turbopack. Phase 1 is a
tailored solution for one ABA clinic ("Mount Etna"); phase 2 packages the same
product for other clinics on a subscription. **Treat clinic-specific values as
temporary and say so when you add one.**

| App | Port | Domain | Live |
|---|---|---|---|
| `apps/web` | 3001 | `summitclient.io` | yes — marketing + the sign-in hub |
| `apps/scheduler` | 3000 | `scheduler.summitclient.io` | yes |
| `apps/data` | 3002 | `data.summitclient.io` | yes — the **clinician** portal |
| `apps/client` | 3003 | `client.summitclient.io` | yes — the **family** portal |
| `apps/employee` | 3004 | `employee.summitclient.io` | yes — MySummitHR |
| `apps/teacher` | 3005 | `teacher.summitclient.io` | **no** — one-line stub, 502 is expected |

Names do not match domains. `data` is the clinician portal, `client` is the
family portal. Get this wrong and you will edit the wrong app.

Shared packages: `design` (tokens, components.css, motion), `nav` (the
cross-portal bar), `portals` (the portal registry), `session` (identity),
`settings`, `db`, `analytics`, `clinical-ai`, `i18n`, `observability`.

## Commands

```bash
pnpm install
pnpm --filter @summit/<app> dev          # ports above, all pinned
pnpm turbo build --filter=@summit/<app>
pnpm -r --if-present run typecheck
node apps/employee/qa.mjs
cd apps/employee && node tests/onboarding-certificates.test.mjs
```

`packages/nav` and `packages/portals` and `packages/session` have **no build
step** — every consumer lists them in `transpilePackages` and compiles them from
source. If you add a shared package, do the same and add it to every consuming
app's `next.config`. A `tsup` build in `nav` once failed on a missing
`@types/node` and took down all five app builds with it, because turbo's
`dependsOn: ["^build"]` kills siblings when a dependency fails.

## One role vocabulary

`profiles.role` is `admin | supervisor | clinician | scheduler | client`. That
is what migration `0001` documents on the column and what `auth_role()` /
`auth_is_staff()` read.

**There is no `staff` role.** The scheduler used to declare one; it was retired
in `9554f20` because nothing in the database ever issued it, and the sign-in
redirect that pointed it at the employee portal sent people to a portal that
turned them away.

Do not confuse `profiles.role` with `staff.role`, a different column on a
different table holding the clinical credential (`BCBA | BCaBA | RBT |
Supervisor`), written by the scheduler's admin page.

## Where things belong

- **`@summit/portals`** — which portals exist, their URLs, which roles may use
  each, and where each role lands after sign-in. Pure data, no React, no
  Supabase. It is the *only* place that knows this. `nav` renders from it,
  `session` gates on it, `apps/web` redirects with it. Per-tenant portal
  visibility will eventually override `ACCESS` from org settings, which is why
  it is its own package.
- **`@summit/session`** — who is signed in: `userId`, `clinicId`, `appRole`,
  `fullName`, `supervisorId`, plus portal-independent problems. Cached; one
  in-flight request shared by all callers. `"use client"`, browser Supabase
  client.
- **Each app** — what that portal does about it. Screens and copy stay with the
  screens.

`AppNav` renders from **server** layouts in `apps/data` and `apps/employee`, and
`@summit/session` is client-only. Wrap it in a small `"use client"` component
rather than trying to resolve identity in the layout.

## Traps that have already bitten

**RLS returns empty sets, not errors.** A user who passes the auth gate but
fails `auth_is_staff()` sees a fully rendered portal with nothing in it. That
reads as an auth bug and is not one. Gate on role in the app and *say* something
— `explainProblem()` exists for this.

**`profiles.clinic_id` must be set.** Null means `auth_clinic_id()` returns null,
every policy evaluates false, and the portal is blank. Same symptom, different
cause. `NO_CLINIC` vs `ROLE_EXCLUDED` distinguishes them.

**`packages/settings` does not persist.** It is `localStorage` only, despite its
own header claiming it writes to the `0005` tables. `org_settings`,
`role_settings`, `user_settings` and `settings_audit` exist in production and
nothing writes to them. Every setting is per-browser and per-subdomain, so an
"organization setting" reaches nobody else. Do not build features that assume
otherwise until this is fixed.

**`NEXT_PUBLIC_DEV_PREVIEW=1` is double-gated.** The flag must be `1` *and* the
build must not be production. Preview mode therefore needs `next dev`, not
`next start`. Never set it on the server.

**Check what `main` has that you do not.** `git log <branch>..origin/main`, not
just the reverse. A review once concluded `deploy.yml` excluded `apps/employee`
by reading it off a branch whose merge-base predated the PR that added it.

**CRLF churn on Windows.** `core.autocrlf` is unset and there is no
`.gitattributes`. If `git status` shows hundreds of modified files with equal
insertions and deletions, that is line endings, not edits. Never `git add -A`
while it is present.

## Design system

`packages/design/tokens.css` is the single palette. Two text tones — `--ink` and
`--muted`; `--faint` resolves to `--muted` because a third step could not clear
WCAG AA at the 11px it carried. Colours are OKLCH and every pair has been
measured: **the whole palette clears AA, and it should stay that way.** If you
add a colour, check it against the surface it lands on, and remember element
`opacity` composites — reading `computedStyle.color` alone will tell you it
passes when it does not.

Apps must not redefine what `components.css` already defines. Each app imports
its own `app.css` *after* the shared file, so a duplicate silently wins and the
shared rule renders nowhere.

## Verification expected before you say something works

- `pnpm -r --if-present run typecheck`
- `pnpm turbo build` for every app you touched — all five if you touched a package
- `apps/employee/qa.mjs` **and** `tests/onboarding-certificates.test.mjs`

**The certificate suite self-skips.** If it cannot find esbuild in the workspace
store it prints `SKIP` and exits **0**, which looks like a pass. Run
`pnpm install` at the repo root first and confirm you see `7 passed`. A skip is
not a pass, and that suite is the only one that tests the shipped functions —
`qa.mjs` tests re-implemented copies and cannot catch drift.

For UI work, render it. Several defects here were only visible in a browser: a
10px overflow from a token that disagreed with the element it sized, a portal
bar that would have printed on a certificate, contrast failures that static
reading missed.

## Deploy

Automatic. Merge to `main` and GitHub Actions builds and restarts all five live
apps in two to four minutes. It checks every app's `.env.local` exists, then
verifies `.next/BUILD_ID` per app before touching pm2 — a half-finished build
fails the run instead of going live.

Never add an app to `deploy.yml` before its `.env.local` and pm2 process exist
on the server, or every deploy fails for every app.

Full operational detail, including the server, nginx, TLS and the failure modes:
the `summitclient-deploy-ssh.md` doc in the Claude project.

## Known open work

- `packages/settings` persistence — the next substantial piece
- `apps/client` has no `proxy.ts`; its guard is per-page in `getServerSideProps`,
  so a new page is public unless you remember
- `apps/scheduler/proxy.ts` uses `getSession()` (reads the cookie) where the
  others use `getUser()` (verifies the JWT), and sets the cookie domain
  unconditionally including in dev
- `apps/client/components/design-b.tsx` hardcodes `styles.confirmed` on every
  session status pill, so a cancelled session renders as confirmed
- ~4.8 MB of clinic-specific assets in `apps/employee/public`, and a BrightHR
  tenant token in `lib/content.ts`
- `.gitattributes` for the CRLF problem
