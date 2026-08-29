# Summit — working notes for Claude

Read this before changing anything. It is the accumulated context that is not
obvious from the code, including several failure modes that have already cost
real time.

## What this is

A pnpm + Turborepo monorepo, Next.js 16.2.x with Turbopack. Mount Etna is the
anchor client, not the ceiling: the objective is commercialization across
multiple clinics on a subscription, and "only one clinic exists today" is a
fact about current data, never a reason to skip clinic scoping on anything
new. **Treat clinic-specific values as temporary and say so when you add
one.** (2026-08-28: this correction followed directly from a real gap — see
the `clinic_id` note under Hard constraints below.)

This handles PHI. **PHIPA (Ontario) and PIPEDA (federal Canada) are the
binding regimes** — the anchor client, Mount Etna Child & Family Services
Inc., is Canadian. HIPAA is not binding, but HIPAA-shaped artifacts (a BAA)
are still the right thing to obtain, since that's the contractual instrument
vendors offer. See `docs/context/compliance.md` for what actually gates
revenue and what's still open.

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
cd apps/scheduler && node tests/calendar-utils.test.mjs
```

`packages/nav` and `packages/portals` and `packages/session` have **no build
step** — every consumer lists them in `transpilePackages` and compiles them from
source. If you add a shared package, do the same and add it to every consuming
app's `next.config`. A `tsup` build in `nav` once failed on a missing
`@types/node` and took down all five app builds with it, because turbo's
`dependsOn: ["^build"]` kills siblings when a dependency fails.

## Hard constraints

These are never violated regardless of what a task seems to ask for:

- The service role key bypasses RLS entirely. Server-side only, never behind a
  `NEXT_PUBLIC_` prefix, never in an app `.env.local`. Apps get the anon key
  only.
- Anything named `NEXT_PUBLIC_*` is readable by the browser. Never gate auth
  or security behavior on one. A preview/bypass flag must be gated on the flag
  **and** `NODE_ENV !== "production"` (see `NEXT_PUBLIC_DEV_PREVIEW` below).
- Every PHI table carries `clinic_id` and RLS policies. No exceptions. This
  is now actually true schema-wide (migration 0013) — `clients`, `staff`,
  `sessions`, `calendars`, `locations`, `session_types`,
  `client_availability` and `staff_availability` are the original scheduler
  tables that predate this repo's migration history and, until 0013, had
  neither: any admin or scheduler account had unconditional, clinic-wide
  access to all of them. If you add a table, it needs `clinic_id` and a
  `clinic_id = auth_clinic_id()`-shaped policy from the start — the
  8-table retrofit is exactly the kind of gap that's expensive to notice
  later and cheap to avoid at creation.
- Auth gates use `getUser()`, never `getSession()`. `getUser()` verifies the
  JWT against the auth server; `getSession()` trusts the cookie. All four
  portals' `proxy.ts` do this correctly as of PR #52 — but see the
  cross-portal refresh-token race below before calling `getUser()` a safe,
  no-side-effects check.
- `security definer` functions must schema-qualify every reference and name
  `pg_temp` last. `set search_path = public` alone does **not** exclude
  `pg_temp` — this was exploited on this schema (temp-table shadowing let any
  authenticated user insert themselves as admin of any clinic) and fixed in
  migration `0009`. See `docs/context/compliance.md`.
- No real PHI in the system until the Supabase BAA is signed.
- Never send identifiable data to a third-party model without a signed
  agreement covering it. `packages/clinical-ai` routes PHI to Azure OpenAI by
  default for this reason; Anthropic is only used for non-PHI scheduler
  matching.
- RLS policies are written per command, never `for all` — deletes are denied
  by default across this schema and `for all` would silently reopen them.

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

Confirmed shipped: `fix/role-vocabulary` merged as PR #48 (2026-08-27). Any
older doc that calls this "merge status unverified" is stale.

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

**`packages/settings` persists for real now (2026-08-28).** It still starts as
`localStorage` for preview (`NEXT_PUBLIC_DEV_PREVIEW=1`), but live mode backs
onto the `0005` tables via `@summit/session`'s identity — call `initSettings()`
once near the app root (see `apps/data`/`apps/employee`'s `SessionProvider`)
before reading anything. Every read (`getSetting`, `resolve`, `term`,
`readAudit`) is still fully synchronous — it reads an in-memory cache that's
`{}` (falls back to each setting's own default) until `initSettings()`
resolves, then the real values, with `onSettingsChange()` firing so
subscribers re-render. `setSetting()` is now `async` (optimistic update,
rolls back on a failed write) — existing fire-and-forget call sites don't
need to change, but a new one that cares about failure should `await` it.
Known gap: an org setting change doesn't push live to someone already using
the app elsewhere — it's fresh on next load, not real-time push (a deliberate
v1 scope call, not an oversight).

**Calling `getUser()` can silently sign a valid user out — cross-portal.**
All four portals share one `.summitclient.io` session cookie. `@supabase/auth-js`
redeems the refresh token on *any* `getUser()`/`getSession()` call once the
session is within 90 seconds of expiry, regardless of `autoRefreshToken`
(that option only controls the proactive background timer, not this
on-demand path). With four independently deployed processes reading the same
cookie, whichever portal's `proxy.ts` runs first in that window wins the
refresh; Supabase invalidates the old refresh token immediately, so a second
portal racing with the same stale token gets a hard, unrecoverable
`refresh_token_already_used` `AuthApiError` — which used to be treated
identically to "not signed in" and bounced a perfectly valid session to
login. This is exactly what "click employee in the nav bar, land back on the
web landing page" looks like from the outside. Fixed by `@summit/proxy-auth`'s
`sessionFreshness()`: every spoke portal's `proxy.ts` checks freshness by
reading the cookie directly (no auth call, so it cannot itself race) before
ever calling `getUser()`, and redirects to `apps/web`'s
`/api/auth/refresh` — the only place a refresh token is ever redeemed —
whenever the session is stale. Do not add a second place that calls
`getUser()`/`getSession()` on a possibly-stale session; route it through the
central refresh endpoint instead.

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

**Mobile nav pattern (added 2026-08-28).** Below 820px, an app's in-app
`.sidebar` becomes an off-canvas drawer instead of vanishing — a plain
`<input type="checkbox" id="nav-toggle" className="nav-toggle-input">` plus a
`<label htmlFor="nav-toggle">` hamburger and backdrop, all in
`components.css`, zero JavaScript so it works inside a Server Component
layout. See `apps/data/app/layout.tsx` for the reference wiring (checkbox +
`.mobile-topbar` + backdrop label, rendered as siblings immediately before
`.shell`). `apps/scheduler` duplicates this same pattern in its own
`styles/globals.css` (`.scheduler-sidebar`/`.scheduler-shell` instead of
`.sidebar`/`.shell`) rather than depending on `@summit/design`, since it
keeps its own copy of the tokens instead of importing that package — if you
change the shared version, check whether the duplicate needs the same fix.
The cross-portal `AppNav` bar (`packages/nav`) scrolls horizontally instead
of wrapping when its pills don't fit a phone width — `--portalnav-h` is a
fixed token too many `calc(100vh - var(--portalnav-h))` / `position:sticky`
rules depend on for the bar's height never to change.

**`apps/web`'s `styles/globals.css` was never imported anywhere until
2026-08-28** — `pages/_app.tsx` had no `import '../styles/globals.css'` line,
so nothing in that file ever took effect in production, on any screen size,
for as long as the file existed. That included the base `overflow-x:hidden`
safety net, the gradient-clipped hero headline (`.grad-text` — it rendered as
plain text), the logo marquee's scroll animation, and every hover state. Most
of the page still looked right only because it's built almost entirely from
inline styles. If a `className` in `apps/web` doesn't seem to do anything,
confirm the stylesheet it's meant to come from is actually imported before
assuming the class name or selector is wrong.

## Verification expected before you say something works

- `pnpm -r --if-present run typecheck`
- `pnpm turbo build` for every app you touched — all five if you touched a package
- `apps/employee/qa.mjs` **and** `tests/onboarding-certificates.test.mjs`
- `apps/scheduler/tests/calendar-utils.test.mjs` for anything in
  `apps/scheduler/components/calendar/` (date math, gap/conflict detection,
  conflict-resolution suggestions)

**Both esbuild-bundled suites (`onboarding-certificates.test.mjs` and
`calendar-utils.test.mjs`) self-skip.** If a suite can't find esbuild in the
workspace store it prints `SKIP` and exits **0**, which looks like a pass —
confirmed live in the remote sandbox this repo is sometimes worked in: no
esbuild anywhere on disk there at all (this Next.js version's Turbopack build
doesn't vendor it the way the comment in the certificate suite assumes), so
both suites always print SKIP in that environment specifically, regardless of
`pnpm install`. **A skip is not a pass.** Run `pnpm install` at the repo root
first; if it still skips, that's the sandbox, not a real failure — verify the
logic instead by compiling the subject files with plain `tsc` (`--module
commonjs`, no bundler needed since these files' relative imports resolve fine
under CommonJS) into a scratch directory and running the same assertions
against the compiled output with a bare `node` script. Either way, don't
report a suite as passing without an actual `N passed, 0 failed` line — from
the real harness when esbuild is available, from the tsc-compiled substitute
when it isn't. `qa.mjs` and the certificate suite test re-implemented copies
of `apps/employee`'s functions and cannot catch drift from the shipped code.

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

Fixed since the last pass, so don't re-fix: `apps/client` now has a `proxy.ts`
edge guard (PR #50); `design-b.tsx`'s status pill now reflects the session's
real status instead of hardcoding "confirmed" (PR #50); `packages/settings`
persists for real via Supabase (PR #57, see "Traps that have already bitten"
above); `apps/scheduler/proxy.ts` uses `getUser()` (PR #52); the BrightHR
tenant ID moved server-side (PR #54); `.gitattributes` now normalizes line
endings (PR #56); and the cross-portal refresh-token race that could bounce a
valid session to login is fixed via `@summit/proxy-auth` (see "Traps that
have already bitten" above) — application code only, no manual migration.

- ~4.8 MB of clinic-specific assets in `apps/employee/public`
- Scheduler calendar v2 (PR #74 onward) — full backlog is closed as of the
  overnight PR that follows PR #76; see `docs/context/product.md`'s
  "Scheduler calendar v2 — feedback backlog" section for the whole history
  before touching that tab again. Two things worth knowing before you do:
  `TimeGrid`'s `DayColumn.onClick` handler had a target-equality guard that
  silently made click-to-create dead on arrival in every PR before that
  last one — fixed, but if a future change to that handler brings back
  anything shaped like `e.target !== e.currentTarget`, read why it was
  wrong there first. And apps/scheduler now has its first automated test
  (`tests/calendar-utils.test.mjs`) — it esbuild-skips silently in this
  remote sandbox specifically (no esbuild anywhere on disk here); see the
  Verification section below before trusting a bare SKIP.

The full list — compliance gaps, product debt, ops debt, and unresolved
conflicts between past sessions — lives in `docs/context/`. Read the relevant
file before starting work in that area, and treat items there tagged OPEN as
genuinely undecided, not as a backlog to just pick up:

- `docs/context/decisions.md` — what was decided, what was only proposed, what
  is still open, and what was rejected and why.
- `docs/context/environments.md` — server, deploy pipeline, env files, and
  failure modes with their diagnostic tells.
- `docs/context/compliance.md` — regulatory regimes, what gates revenue, PHI
  handling rules, open compliance questions.
- `docs/context/product.md` — who this is for, portal-to-app naming, scope
  boundaries, commercial model.

These were assembled 2026-08-27 from project chat history and are already
missing that day's later merges (PR #49, #50) — cross-check dates against
`git log` before trusting a status claim in them.
