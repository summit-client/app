# Summit — working notes for Claude

Read this before changing anything. It is the accumulated context that is not
obvious from the code, including several failure modes that have already cost
real time.

## Plan first, get approval, then act

For anything with real architectural weight — a schema change, an RLS policy,
which table a new field lives on, a shared-package extraction touching
multiple apps — present the plan and wait for an explicit yes before writing
code. Don't build ahead of approval and explain the reasoning afterward, even
when the reasoning is sound and even mid-build when a new fact changes the
plan. Stop, say what changed and what you now think should happen, and wait.

(2026-09-16: a session picked `profiles` for new self-service contact-info
columns — phone, emergency contact — without stopping to ask first, over the
user's explicit direction to put them on `staff`. The reasoning wasn't even
wrong on its own terms (`profiles_self_update` is a convenient existing
unconditional self-write policy, `staff` has no `user_id` to key one on), but
`profiles` carries `role` and `clinic_id` — the exact columns this schema's
entire RBAC/RLS posture reads (`auth_role()`, `auth_clinic_id()`) — and is
not where plain contact fields belong regardless of how convenient the
shortcut is. Reverted. The user's own words: "Plan first to get my approval
then act on it.")

## How to explain things here

The account owner reads these explanations to make decisions, not to admire
the work. Write for that.

**Lead with what it means, not what it is.** "A person could award themselves
a credential, and it printed on a client's bill" — not "0086 adds a
verification trigger to employee_credentials".

**One idea per paragraph, and say the consequence.** Every claim should land
on something real: what breaks, who sees it, what it costs. If a paragraph
does not reach a consequence, cut it.

**Cash out every technical term the moment you use it.** Not "security
definer, so the drop was permitted" — "normally Postgres refuses to delete a
column something depends on; this kind of thing is invisible to that check,
so nothing would have stopped me."

**Name the cost honestly, at the end, unhedged.** "Your team re-enters their
credentials once. That's the bit you might want to push back on." If a
decision has a downside, it goes in the explanation, not in a footnote.

**Short.** A finding is three or four sentences. Three findings are not a
page. Bullet lists of everything you did are not an explanation.

**Do not narrate process.** What you checked, what you considered and
rejected, how long something took — none of that is the answer unless it
changed the outcome.

(2026-09-18: asked for directly, after a run of explanations that were
accurate and unreadable. The user's own words: "The drivel you usually spill
is hard to follow.")

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

## Supabase access for Claude sessions

**Read `pg_policies` before believing this repo's migration history.** You can
query production directly, and that habit is what found six unscoped policies
in 2026-09 — four of which appear in no migration here at all — plus a
migration the history says was applied and was not (`0014`), and a column
`0000` declares that does not exist. Three premises written from the history
have now turned out false against the deployed schema. Introspect first.

`SUPABASE_ACCESS_TOKEN` is set in the Claude Code environment's own env vars
(per-person, never committed). With it:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"query":"select ..."}'
```

**That token is account-wide and can write.** Nothing about the transport
restrains it, so the restraint is you: read freely, and treat a migration or
any other write as needing the account owner's explicit approval first, named
and with its consequences stated. `supabase/tests/tenancy.mjs --live` uses a
scoped read-only role instead, which is the right shape when something runs
unattended — see `supabase/tests/README.md`.

**The `.mcp.json` MCP server does not work, and the reason written here until
2026-09-19 was wrong.** It said the environment's proxy rejects
`api.supabase.com` with a 403 and prescribed adding it to Custom allowed
domains. That was true on 2026-08-31 and is not true now: the curl above
works with no environment change at all. Whatever keeps
`@supabase/mcp-server-supabase` from loading its tools is something else, and
nobody has diagnosed it. Do not spend a session on the network settings; use
the endpoint above.

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
  access to all of them. Their DDL was also missing entirely until migration
  `0000`, which reconstructs it from application code so a fresh database can
  be built from this repo at all. That reconstruction is unverified against a
  production dump — see the file's own header before treating a rebuilt
  database as a restore target. If you add a table, it needs `clinic_id` and a
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
- **Join on generated ids, never on names.** Locations, clients, staff,
  session types — everything. A name is display data: it is edited, it
  repeats (two staff called the same thing), and matching on it silently
  attaches a record to the wrong row rather than failing. This applies to
  code and to schema: a column that identifies another row holds that row's
  id, not its label. Do not add new name-matching anywhere.

  `sessions.type` was the standing counter-example and is **half fixed**.
  Migration `0085` adds `sessions.session_type_id`, backfills it, and keeps
  `type` in agreement in both directions — a trigger derives it from the
  pointer on every session write, and a second one carries a `session_types`
  rename out to the sessions holding the old label. `apps/scheduler` resolves
  through `findSessionType()` (id first, name only as a fallback for a row
  with no pointer), and the calendar feed, the type filter and every booking
  write use the id.

  What is **not** done, deliberately: `sessions.type` still exists, and
  `0029`'s `time_entry_economics` view and `0031`'s `session_delivery`
  function still join `session_types` on the name. They are correct only
  because the rename trigger keeps that name true — do not remove that
  trigger without moving them onto the key first.

  `clients.session_type_id` landed in `0086` with the same backfill, so the
  waitlist's "what service" is a pointer too. `staff.specialties` looks like
  the same bug and is not: those are descriptive tags from a fixed list,
  matched against nothing since PR #175.

  `session_types.is_intake` (`0086`) replaced the three places that matched a
  session type's name against the literal `"Assessment"` — the waitlist
  prefill, the multi-client waitlist filter and the post-booking
  auto-promotion. Seeded from that literal, so nothing moved the day it
  applied; it is a checkbox an admin owns now.

## One role vocabulary

`profiles.role` is `admin | supervisor | clinician | scheduler | client`, plus
`hr_admin` and `payroll_admin` added by migration `0024`. That is what migration
`0001` documents on the column and what `auth_role()` / `auth_is_staff()` read.

**Roles are no longer the unit of permission.** Migration `0024` added
`auth_can('domain.object.verb')`, resolved from a per-clinic role/action matrix
with per-user exceptions. New tables gate on actions, not on role names; the
existing policies still compare role names and are being moved over one table
at a time, which is why both forms are in the schema right now.

The `0024` seed reproduces every existing role's access exactly, so the two
forms agree today. If you change the seed, you are changing who can do what.

**There is no `staff` role.** The scheduler used to declare one; it was retired
in `9554f20` because nothing in the database ever issued it, and the sign-in
redirect that pointed it at the employee portal sent people to a portal that
turned them away.

**`scheduler` deliberately reaches the employee portal now, 2026-08-31 —
this is not that old bug back.** `@summit/portals`' `ACCESS.employee` admits
`scheduler` (previously admin/supervisor/clinician only), and
`apps/employee`'s Admin console has a scoped exception (`AdminAccessGate` in
`app/admin/page.tsx`) that also admits it, so an Admin nav link can appear
for schedulers. Scheduler still maps to `HubRole.EMPLOYEE` everywhere else
in that portal (`session.ts`) — self-service hub screens only, never
blanket supervisor power over other people's records; the Admin console
grant is the one deliberate exception, not a role promotion. Migration
`0022` (applied live 2026-08-31) widened `hub_can_manage()` to
`auth_role() in ('admin', 'scheduler')` so the console's queues actually
return data for a scheduler instead of rendering empty (the
`ACCESS.employee` "renders and shows nothing" trap this same section's
comment already warns about, for exactly this reason).

**`staff.role` is gone (migration `0086`).** It was a different column on a
different table holding a clinical credential as free text (`BCBA | BCaBA |
RBT | Supervisor`), typed into the scheduler's admin page, verified by
nothing, and a fourth copy of a vocabulary that already existed three times
over. A credential now lives in `employee_credentials`, pointing at a
per-clinic `credential_types` catalogue, and it is **confirmed by somebody
else** — see the credentials note under "Traps" below.

Two consumers had to move with it, and the second is the one that would have
been easy to miss: `apps/scheduler`'s `isClinicalStaff()` is now
`carriesSessions()` and tests capacity alone (a roster filter built on
credentials would answer differently depending on who was looking, since a
clinician reads only their own); and `my_care_team()` published `staff.role`
to FAMILIES as a job title, which is a second, unrelated meaning the column
carried. That function reads `hub_employee_profiles.job_title` now.

Confirmed shipped: `fix/role-vocabulary` merged as PR #48 (2026-08-27). Any
older doc that calls this "merge status unverified" is stale.

**The live `user_role` enum was actually missing `'supervisor'` until
2026-08-30 (migration `0021`).** This predates this repo's tracked migration
history, same as the `clients` table — the enum's real members were
`admin, scheduler, clinician, client, staff` only, despite every piece of
code above already being written correctly for the five-role vocabulary.
Inviting a supervisor, or any code path that cast the literal `'supervisor'`
to `user_role`, failed with `22P02: invalid input value for enum` — not a
logic bug, the value genuinely could not exist yet. Fixed live; no
application code changed. If you ever see `22P02` on a role-shaped enum,
check `select enumlabel from pg_enum where enumtypid = 'user_role'::regtype`
before assuming the code is wrong.

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

**Deleting a user from Supabase Auth can fail with a bare "Database error
deleting user," and the real cause is usually `clients.user_id` or
`staff.user_id` (2026-08-31).** Those two are the pre-migration-history
scheduler tables (same ones the `clinic_id` retrofit note above is about) —
their `user_id` foreign key to `auth.users(id)` has no `ON DELETE CASCADE`,
so Postgres refuses the delete the instant either table still has a row
pointing at that user, and Supabase Studio surfaces that as the one generic
message with no constraint name. Confirmed live on two stuck test accounts:
introspecting `information_schema` the obvious way (joining
`constraint_column_usage` on `table_schema`) silently misses every
cross-schema FK — `public.* → auth.users` never matches, because
`constraint_column_usage.table_schema` is the *referenced* table's schema,
not the referencing one — so it looked like nothing was blocking the delete
when `clients`/`staff` were the whole problem. Diagnose with `pg_constraint`
directly (`conrelid`/`confrelid`, immune to that mismatch) instead. Fix:
**unlink, don't delete** — `update clients set user_id = null where ...` /
same for `staff` — that's what those columns are for (a client/staff record
can exist before anyone has a portal login), then the `auth.users` delete
goes through.

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

**The same "only one place is allowed to touch the shared cookie" rule
applies to signing out, and for the same reason (2026-08-30 fix).** Every
portal's own browser Supabase client is built with `createBrowserClient()`
and no cookie overrides, so its default cookie writer only clears a cookie
scoped to *that portal's own host*. The real session cookie was written with
an explicit `Domain=.summitclient.io` by `apps/web`'s client specifically
(the only client-side writer configured that way) — a browser will not
remove a cookie via a delete that doesn't repeat that same `Domain`.
`apps/scheduler` and `apps/client` both had their own sign-out buttons that
called `supabase.auth.signOut()` on their own client: it looked like it
worked (that tab's state cleared, redirect to login fired) while leaving the
real cross-portal cookie valid, ready to sign the same browser straight back
in on the next portal visit or reload. Every sign-out now navigates to
`signOutUrl()` (`@summit/portals`) → `apps/web/pages/api/auth/signout.js`,
which uses `apps/web/lib/supabase-server.ts`'s domain-scoped server client —
the only place a session is actually allowed to end, mirroring
`/api/auth/refresh` exactly. Never call `supabase.auth.signOut()` directly
in a portal; navigate to `signOutUrl()` instead.

**`NEXT_PUBLIC_DEV_PREVIEW=1` is double-gated.** The flag must be `1` *and* the
build must not be production. Preview mode therefore needs `next dev`, not
`next start`. Never set it on the server. **This only held for each portal's
own `proxy.ts` bypass until 2026-08-30** — `@summit/session`'s own `IS_PREVIEW`
export (what `hub.ts`, `@summit/settings`, and `apps/data`'s preview-data path
actually branch on) had no `NODE_ENV` check at all, just the flag. Since a
`NEXT_PUBLIC_` var bakes into the client bundle regardless of build mode, a
stray `NEXT_PUBLIC_DEV_PREVIEW=1` left in a production env file would have
kept those consumers on `localStorage`/fixtures — scoped to the *browser*,
not the signed-in user — with a real, correctly authenticated session sitting
on top of it. That's confirmed live as the cause of one clinician's
onboarding/training progress in `apps/employee` appearing to "belong" to
whoever else had used that browser. Fixed by adding the same `NODE_ENV` check
to the one shared export every consumer reads, instead of trusting each new
consumer to remember it independently.

**Edge Functions need to handle their own CORS preflight — nothing does it
for you.** `invite-teammate`, `edit-teammate` and `provision-clinic` (see
`supabase/functions/`) had no `Access-Control-*` headers and no `OPTIONS`
handling; every `Deno.serve` fell straight to a 405 "POST only" check. A
browser's CORS preflight `OPTIONS` request got that bare 405 back with no
CORS headers and was blocked client-side before the real request ever went
out — which surfaces as supabase-js's generic `FunctionsFetchError`
("Failed to send a request to the Edge Function"), a fetch-level failure
that looks identical to "the function isn't deployed" or "the gateway
rejected the JWT" and gives no hint that CORS is the actual cause. Fixed via
`handlePreflight()`/`CORS_HEADERS` in `supabase/functions/_shared/auth.ts`,
called first in every function's handler, before any method or auth check.
Any new Edge Function needs the same call.

**A credential's standing is something somebody else asserts, and it reaches
a bill (migration `0086`).** `credentials_own_update` (0007) let a person
update their own `employee_credentials` row including `status`, and migration
`0034`'s receipt view puts a `GOOD_STANDING` credential number on a client's
receipt under that clinician's name. So a self-entered, self-approved number
was the clinic's assertion of who delivered the service, checked by nothing.
`0086` keeps the self-write — a person must be able to enter and correct
their own credential — and adds a trigger: entering or amending one sets
`PENDING`, and moving it to `GOOD_STANDING` stamps `verified_by`/`verified_at`
and is **refused when the actor is the holder**, for every role, admin
included. The verification is a human act (a supervisor looks the number up on
the issuer's register; nothing in Summit contacts an issuer), which is exactly
why the row records who made it.

Gated on `hr.credential.verify`, a new action seeded to admin, supervisor and
`hr_admin`. Not `hr.record.write` — that looks right and is not: `0024` grants
it to admin and `hr_admin` only, so a supervisor would have got a screen that
refuses them. `scheduler` is explicitly denied, because `hub_can_manage()`
admits schedulers and absence alone would not have been enough.

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

## Open work

What is still wrong, plus the landmines. **History — what was fixed, when, and
in which PR — lives in `docs/context/decisions.md`**, so this section stays
about the present. Cross-check any status claim against `git log` before
trusting it; that habit is what caught the last three gaps.

### Landmines — read before touching the schema

- **Never apply migration `0014`.** It was never applied, and nothing drops
  it. Its `sessions` half would OR with `0077`'s narrow policy and silently
  undo the clinician/client privacy boundary.
- **`0000` is a reconstruction, not a dump.** `sessions.created_at` is
  declared there and does not exist in production — the first measured
  divergence, recorded in `0000`'s own header. Treat every other column there
  as inferred until the `pg_dump` reconciliation happens.
- **`sessions.type` still exists** alongside `0085`'s `session_type_id`
  pointer, and `0029`'s `time_entry_economics` and `0031`'s `session_delivery`
  still join `session_types` on the NAME. They are correct only because
  `0085`'s rename trigger keeps that name true — do not remove that trigger
  without moving them onto the key first. Dropping the column is safe only
  once a release shows nothing lands unmatched (2085 of 2085 rows resolved at
  backfill).
- **`supabase/tests/tenancy.mjs`'s `KNOWN` map is empty and must stay empty.**
  An entry there is a policy the suite will not fail on. It runs twice on
  every PR — once against the migration files, once against production — and
  a skipped live run fails the build rather than reporting green.
- **`invite-teammate`'s existing-account guard must stay ahead of
  `inviteUserByEmail` in the file.** A trigger creates a default `profiles`
  row the instant any `auth.users` row appears, including the one the invite
  itself creates, so the same query moved below that call would reject every
  legitimate invite instead of catching a pre-existing account.
  `supabase/tests/invite_teammate_guard.mjs` asserts the ordering.
- **`TimeGrid`'s `DayColumn.onClick`**: anything shaped like
  `e.target !== e.currentTarget` there makes click-to-create dead on arrival.
  It did, in every PR before the one that fixed it.

### Still broken — tracked as GitHub issues

**Open defects live in GitHub Issues, not here.** This list is pointers, so it
cannot drift out of date the way a prose list does: the issue carries the
detail and the state, and closing it is what marks the work done.

- **#190** — `hub_pd_records` and `hub_time_off_requests` have no
  `..._manage_select` RLS policy at all. Any clinic-wide query against either
  returns nothing for anyone but the caller, silently.
- **#191** — Three Admin console queues and the team directory still read the
  caller's own hub snapshot instead of the clinic's. Blocked on #190 for two
  of them, which would otherwise look fixed and show nothing.
- **#192** — `0029` picks a billing rate using the time entry's clinic rather
  than the session's.
- **#193** — `behaviour.mjs` is one-red on `main` and predates `0085`.
- **#194** — CI does not run the PGlite database suites. Needs a decision on
  whether they should gate.
- **#195** — ~4.8 MB of clinic-specific assets ship to every tenant.
  `blocked`: needs a product decision on where per-tenant content lives.
- **#196** — the scheduler Dashboard's "No-show rate" reads a meaningless
  number, because nothing ever sets `sessions.status = 'completed'`.
  `blocked`: see `decisions.md` for the choice it waits on.

**Where to file what.** A defect or a piece of work is a GitHub issue. A
*decision* — what was chosen, what is still genuinely undecided, why something
was rejected — goes in `docs/context/decisions.md`, which is the one thing
issues are bad at. A *rule* a future session must not break is a Landmine
above or a Trap earlier in this file, because those are read automatically and
an issue is not. Don't put the same thing in two places; link instead.

Not a defect, so no issue: **three clinics exist now**, not one — Mount Etna
plus two test clinics. The "only one clinic exists today" framing elsewhere in
this file is about posture, not a count.

### The deeper files

`docs/context/` holds the full record — compliance gaps, product debt, ops
debt, and unresolved conflicts between past sessions. Read the relevant one
before starting work in that area, and treat items tagged OPEN as genuinely
undecided, not as a backlog to pick up.

- `decisions.md` — what was decided, what was only proposed, what is still
  open, what was rejected and why, and the dated record of what shipped.
- `environments.md` — server, deploy pipeline, env files, failure modes with
  their diagnostic tells.
- `compliance.md` — regulatory regimes, what gates revenue, PHI handling.
- `product.md` — who this is for, portal naming, scope, commercial model.
- `workforce.md` — employment, pay and scheduling rules.

`ARCHITECTURE.md` at the repo root is a different kind of file and nothing
used to point at it, which is why it is named here. It holds the binding
rules for anything AI-adjacent — the LLM never computes a number, every
surfaced flag ships a structured evidence object, every suggestion carries a
provenance label, the clinician decides. Read it before touching
`packages/analytics`, `packages/clinical-ai`, or any screen that shows a
clinical conclusion.

`BLOCKED.md` is gone as of 2026-09-19. It held one investigated-but-unfixed
item under a title naming a branch that merged weeks ago, with its own private
status vocabulary — which is a tracker nobody checks. Its full content,
manifest and all, is issue #195.
