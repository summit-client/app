# Blocked / logged items — apps/client hardening pass

Nothing on the worklist was blocked by a missing dependency or a required
`packages/` change. This file records the items that turned out to already
be done, not applicable to this app, or that need a human/DB-level check
this session couldn't perform — so they aren't silently dropped.

## 1. RLS-empty-set trap audit — already done, no gaps found

`lib/admin-view-as.ts`'s `resolveViewedClient()` already distinguishes
`NO_CLINIC` (null `profiles.clinic_id`) from `NO_CLIENT_LINK` (a clinic but
no linked `clients` row), and both pages (`pages/index.tsx`,
`pages/appointments.tsx`) route through it and render
`AccountProblemNotice` instead of an RLS-emptied dashboard. The one other
"nothing to show" case — a non-`client` role reaching this portal — isn't
a blank screen either; it redirects to that role's real home via
`homeUrlFor()`. No screen in this app queries client-scoped data without
going through `resolveViewedClient()` first. No code change made.

## 2. proxy.ts auth pattern — already correct, no second call site found

`proxy.ts` calls `sessionFreshness()` before ever calling `getUser()`,
matching the documented cross-portal refresh-token race fix. Grepped the
whole app for `getSession(` / `getUser(` — the only other call sites are
`pages/index.tsx`, `pages/appointments.tsx` and
`pages/api/admin/view-as.ts`, all of which run **after** `proxy.ts` has
already gated the request (so the session is already known-fresh by the
time they call `getUser()` themselves for their own `user.id`) rather than
being a second unguarded entry point. No change made.

## 3. Data-exposure audit — already scoped server-side, no gaps found

Every query in this app is filtered by a `client_id`/`clinic_id` value that
comes from the server, never from a route param, query string, or request
body:
- `pages/index.tsx` / `pages/appointments.tsx` get `viewed.clientId` from
  `resolveViewedClient()`, which itself derives it from the signed-in
  user's own `clients` row (real client) or a cookie that is re-validated
  against the admin's own `clinic_id` on every single request (admin
  "view as").
- `pages/api/admin/view-as.ts` takes an untrusted `clientId` from the
  request body but re-checks caller role + re-checks the client belongs to
  the caller's own `clinic_id` before ever setting the cookie.
- `pages/api/admin/stop-view-as.ts` only clears the caller's own cookie.

No query anywhere accepts a `client_id`/`clinic_id` directly from a URL
param or query string. **This is app-layer defense-in-depth only** — this
session had no live Supabase MCP access (network access on this Claude
Code environment didn't include `api.supabase.com`; see CLAUDE.md's
Supabase MCP section), so the actual RLS policies on `sessions`,
`programs`, and `session_notes` were not re-verified against the live
schema. `docs/context/compliance.md` still lists "`apps/client`'s RLS has
never been reviewed" as open (as of 2026-08-27), though
`docs/context/decisions.md`'s 2026-08-30 entry says migration `0020` added
client-scoped RLS specifically for `programs`/`session_notes`. **Flagging
for a human with DB access**: confirm `pg_policies` on `sessions`,
`programs`, `session_notes`, and `clients` actually match what this app's
queries assume, the same way migration `0013`/`0014`'s audits did for the
scheduler/clinician tables.

## 4. Invite / magic-link / token-in-URL audit — not applicable to this app

Grepped the whole app for `token`, `invite`, and `magic` (case-insensitive)
— no matches outside `NEXT_PUBLIC_*` env var names. `apps/client` has no
invite acceptance or magic-link handling of its own; that lives in
`apps/web`'s `/auth/callback` (see `docs/context/decisions.md`), which is
out of scope here. Nothing to fix or log as blocked.

## 5. Multi-tenant hardening — already clean, nothing to parameterize

Grepped for UUID literals and "Mount Etna" (case-insensitive) — the only
hit is a comment in `lib/admin-view-as.ts` describing migration `0013`'s
history, not a live value. No hardcoded clinic id, name, or single-clinic
assumption found anywhere in `apps/client`'s own code. Nothing to
parameterize via `@summit/settings` because there's nothing clinic-specific
hardcoded here to begin with.

## 8. Accessibility — one fix made, one known limitation not fixed here

Added a visible keyboard-focus style for the mobile nav toggle (see the
commit for detail). One thing found but **not** fixed, because fixing it
would mean changing a pattern shared identically across every portal
rather than something local to this app: the off-canvas drawer's hidden
`<input type="checkbox">` is the first focusable element in the DOM on
every page load, including on desktop widths where the drawer itself is
inert (`display: none` above 760px) — so a keyboard user tabbing through a
desktop view hits an "Open menu" checkbox that does nothing visible before
reaching real content. This is inherent to the zero-JS checkbox-hack
pattern documented in root `CLAUDE.md`'s "Mobile nav pattern" and used the
same way in `apps/data`/`apps/scheduler`, not something introduced here —
flagging it for whoever owns that shared pattern rather than diverging
from it unilaterally in just this portal while two sibling sessions are
using it as a live reference tonight.

## Findings not on the worklist, noted for awareness

- `pages/appointments.tsx`'s page header (`<h1>`, subtitle) and its `<main>`
  background still use hardcoded hex colours (`#173f5f`, `#6c8290`,
  `#edf7f8`) instead of `@summit/design` tokens, unlike the rest of the
  page after this pass. Pre-existing, not part of any of the 9 worklist
  items (which cover stylesheet-import hygiene and breakpoints, not
  token-vs-hardcoded-colour consistency), so left as-is rather than
  expanding scope. Worth a follow-up if `apps/client` is the reference
  portal going forward.

---

## Round 2 (functionality pass) — additional finding, not fixed

**`AdminViewBanner` isn't sticky, so it can scroll out of view on a tall
dashboard.** Its own doc comment states the point of the banner is that an
admin viewing a family's data "as" them is never mistaken for that
family's own session, by the admin or by anyone glancing at their screen -
but the banner renders in normal document flow with no `position: sticky`
or `fixed`, so scrolling down `dashboardGrid`'s five cards on a narrow
screen scrolls the banner away while the rest of the page (and the
mobile nav's own sticky topbar) stays visible. Not fixed here: `.mobileTopbar`
(`design-b.module.css`, only active below 760px) is *also*
`position: sticky; top: 0`, and it renders directly after the banner in the
DOM - making the banner sticky too without visually verifying the two
don't overlap when both are "stuck" (this session has no way to render the
app in a browser; no live Supabase project reachable, same limitation as
the rest of this pass) risked leaving the banner in a worse state -
overlapping the hamburger topbar - than simply not being sticky. Flagging
for whoever can check it in an actual browser rather than guessing at the
stacking blind.

Everything else re-audited this round (`proxy.ts`, `lib/supabase-server.ts`,
`Sidebar.tsx`, `mobile-nav-chrome.tsx`, both API routes) came back clean -
no second functional issue found beyond what's fixed in this round's
commits (the clinic-timezone date bug, the three query-error-vs-empty
sites, goal ordering, SOAP-note null ordering, the date-format hydration
mismatch, and the dashboard session-count tile).

---

## Round 3 (feature-depth pass)

Built two of the Sidebar's five permanently-stubbed nav destinations out
into real pages backed by data this app already had proven access to
(`pages/progress.tsx`, `pages/updates.tsx` - see their commits for detail).
The remaining three stay stubbed, and a fourth thing (a nav slot for
`/updates`) was deliberately not added. Recorded here so the reasoning survives past this session:

- **Messages** — not built. This is a two-way communication feature (a
  family messaging their clinical team), which needs its own backing data
  model (a `messages`/`conversations`-shaped table), likely real-time
  delivery, and probably moderation/staff-routing decisions - none of
  which this session could safely invent. Building against a guessed
  schema risks shipping something that references tables/columns that
  don't exist, which wouldn't fail at build time (Supabase queries are
  only checked at runtime) - it would fail silently or loudly in
  production instead. Needs a real design decision plus schema work,
  which is out of scope for an app-only session with no migration access.
- **Documents** — not built, same reasoning. A family-facing document
  library needs actual file storage (Supabase Storage or similar) and a
  documents table this session has no evidence exists. Note:
  `session_notes` (now fully surfaced via `/updates`) *is* arguably
  "clinical documentation shared with the family," so there's a
  legitimate argument that `/updates` substantially covers what
  "Documents" was meant to be - but repurposing the Sidebar's actual
  "Documents" label for it is a product-facing decision, not something to
  decide unilaterally on an engineering pass. Flagging the overlap rather
  than acting on it.
- **Consents** — not built. Consent tracking (recording that a parent
  authorized something specific, with a timestamp and scope) is exactly
  the kind of PHI-adjacent feature `docs/context/compliance.md` says needs
  real compliance sign-off before it exists at all, not just a schema
  guess.
- **Settings** — not built. `apps/client` doesn't depend on
  `@summit/settings` today (the package that would actually back a real
  settings screen, already consumed by `apps/data`/`apps/employee`).
  Adding it means adding a new workspace dependency to
  `apps/client/package.json`, which this session's instructions
  explicitly say not to do without logging it here instead: **request** —
  add `@summit/settings` as a dependency of `apps/client` so a real
  Settings screen (notification prefs, language, etc.) can be built
  against it, the same way the other two portals already do.
- **No new Sidebar entry for `/updates`.** `/progress` maps cleanly onto
  the Sidebar's existing "Progress" label (unambiguous, so it was wired up
  directly). `/updates` doesn't have an equally obvious existing slot:
  reusing "Documents" risks conflicting with whatever the actual planned
  Documents feature turns out to be (see above), and adding it as a brand
  new sixth nav item would grow the Sidebar's five-item roadmap without
  being asked to. Reachable via the dashboard's new "View all" link
  instead, the same way `/appointments` and `/progress` both are.

All three real pages (`/`, `/appointments`, `/progress`, `/updates`) now
share one auth/account-problem/error pattern
(`resolveViewedClient()` + `AccountProblemNotice`/`LoadErrorNotice`), one
empty/error-state box (`.emptyBox`), and the same three breakpoints - the
two new pages don't introduce a second design language, they extend the
one this app already had.

---

## Round 4 (deeper feature work) — two new appointment-adjacent features

Built a calendar export and a month-view calendar for `/appointments`,
staying inside the same "no new schema, no live-DB guessing" boundary as
round 3 - both are pure additions over the exact `sessions` columns this
app already queries, no new table or column assumed. Full reasoning is in
each commit; two decisions worth surfacing here too:

- **Not a subscribable calendar feed.** `pages/api/calendar.ics.ts` is a
  one-time authenticated download, not a `webcal://` subscription a
  calendar app could poll on its own. A real subscription needs a
  shareable secret token in the URL (calendar apps have no way to send
  the session cookie this app's auth otherwise relies on), and
  minting/storing/expiring that token needs its own DB table - this
  session can't create one. **Logging as a request**: a
  `calendar_feed_tokens`-shaped table (user id, token, created/revoked
  timestamps) would let a future pass build a real subscription link
  without changing the trust model of anything else in this app.
- **Assumed a 60-minute session duration for calendar events**, since no
  query this app has ever run (including this round's) has access to an
  actual duration - no `session_types` join, no duration column.
  `@summit/settings` has the real per-org default
  (`org.defaultSessionDuration`, 120 minutes) but apps/client still
  doesn't depend on that package (see the Settings item above - same
  blocker, `lib/ics.ts` hits it independently). Said so explicitly in
  each exported event's description rather than asserting a duration
  this app doesn't know, but the real fix is the same as Settings':
  add `@summit/settings` as a dependency of `apps/client`.

Both features were verified without a live Supabase project the same way
- by compiling the pure logic in isolation and running it against hand-
built cases: the timezone-conversion helper (`clinicWallTimeToUtc`)
against 8 cases spanning both of 2026's DST transitions, the ICS builder
against sessions with special characters and a title long enough to force
RFC 5545 line folding, and the calendar-grid math against 6 months
including a leap-year February and a 6-week grid case. See each commit
for the actual verification output.

---

## Round 6 (pre-demo full audit + stress test, 2026-09-02) — live DB access this time

**This session had live, read-only Supabase access that every prior round
lacked** (`ToolSearch` for the Supabase MCP came back empty as usual — see
CLAUDE.md's diagnostic — but `curl`ing the Management API directly with
`SUPABASE_ACCESS_TOKEN` worked (`HTTP 200` from `api.supabase.com`) and let
this round run read-only SQL against the live schema via
`POST /v1/projects/{ref}/database/query`, same account-wide token the MCP
server would have used, same read-only intent — no write ever attempted
through it). That changes the confidence level on several things every prior
round could only reason about statically. Two real findings came directly
out of that access that static reading alone did not catch:

### FINDING — `session_change_requests` (migration `0040`) is not applied live. The "Request reschedule / cancellation" feature is broken in production right now.

`select to_regclass('public.session_change_requests')` returns `null` on the
live database. The table, and everything downstream of it, does not exist:

- `pages/appointments.tsx`'s "Request reschedule" / "Request cancellation"
  buttons render unconditionally (nothing gates them on whether the change-
  requests query succeeded) and open `RequestChangeModal` regardless.
- Submitting one posts to `pages/api/sessions/request-change.ts`, which
  inserts into `session_change_requests` and gets back a Postgres "relation
  does not exist" error, surfaced to the family as the generic "Couldn't
  submit your request. Try again." (a real, if slightly better than a
  crash, degraded failure - it doesn't 500 into a broken page or leak the
  underlying error).
- The same page's `getServerSideProps` also queries this table (for the
  family's past requests) and silently swallows the failure into
  `changeRequestsError` - which is computed but **never actually rendered
  anywhere in the page** (confirmed by reading the whole file: `grep -n
  changeRequestsError` only shows it being set and logged, never branched
  on in the JSX). A family sees no visible sign anything is wrong until they
  actually click one of the two buttons and try to submit.

The migration itself (`supabase/migrations/0040_session_change_requests.sql`)
is well-formed - correct RLS (family insert/select scoped through
`auth_client_row_id()`, a same-clinic-and-same-client check tying
`session_id` to `client_id` so the two can't disagree, staff read/update
gated on the already-live `scheduling.session.book` action) - it just has
never been run. Its own trailing comment already says so ("APPLY MANUALLY").
This is **not a code bug** and not something to fix in this app - it's a
human running `supabase db push` (or pasting the file into the SQL editor)
against the live database. Flagging with real urgency because this app *is*
being shown in tomorrow's demo: if anyone clicks "Request reschedule" on a
booked session, it will visibly fail. Either apply the migration before the
demo, or make sure nobody clicks that button.

### FINDING (fixed) — `pages/statement.tsx` silently masked query failures as "no budget on file" - the exact RLS-empty-set-vs-error trap this app was already fixed for everywhere else

Every other page in this app that queries client-scoped data
(`pages/index.tsx`, `pages/appointments.tsx`, `pages/messages.tsx`,
`pages/documents.tsx`, `pages/activities.tsx`, `pages/progress.tsx`,
`pages/updates.tsx`) captures the query's `error` and threads a boolean
through to render a distinct "couldn't load" message - Round 2's own
commit (`dc1de84`) is literally titled "error-vs-empty masking... fixes."
`pages/statement.tsx` was the one page that never got that treatment: its
`client_budgets` and `budget_entries` queries discarded `error` entirely
(`const { data: budgetRows } = await supabase...`, no `error` destructured,
no `console.error`, nothing threaded to the component), so a real query
failure (network blip, a transient DB error, RLS misconfigured) would have
rendered the exact same "No budget on file yet" copy as a family who
genuinely has no budget - indistinguishable, for a page whose entire purpose
is a financial reconciliation a family or a funder might actually read
closely. **Fixed**: both queries now capture `error`, log it the same way
every sibling query in this app does, and a `budgetsError` prop drives a
distinct message ("Couldn't load your funding statement... contact your
clinic") in the same empty-state slot, matching the established pattern
exactly rather than inventing a new one. See the commit for the diff.

### Fixed in passing: a stale doc comment

`pages/api/admin/view-as.ts`'s header comment referenced
`pages/admin/select-client.tsx` as the picker's location - that page never
existed under that path; the picker is `components/select-client.tsx`,
rendered inline by `pages/index.tsx`. Harmless (comment-only, no behavior
depends on it) but corrected since it actively misdirects the next person
who goes looking for that file.

### Live-verified, not just re-read: everything else in this file's prior "RLS never independently verified" gap is now closed

Round 1's item 3 flagged that this app's RLS had never actually been
checked against the live schema, only reasoned about from the migration
files. This round ran `pg_policies` and `pg_proc` directly against the live
project for every table `apps/client` queries and confirms, live, not
inferred:

- `sessions`, `programs`, `session_notes`, `client_budgets`,
  `budget_entries`, `clients` all carry exactly the family-scoped
  (`client_id = auth_client_row_id()` / `user_id = auth.uid()`) and
  clinic-scoped staff policies their migrations describe. No policy grants a
  broader read than the code assumes anywhere in this set - the
  highest-consequence leak class this app has (one family reading another's
  child's data) was specifically hunted for and not found.
- `public.auth_client_row_id()`'s body is exactly `select id from
  public.clients where user_id = auth.uid()` - it cannot be steered by
  anything in a request; a family's scope is derived server-side from their
  own auth identity only.
- `client_messages` (0035), `client_documents` (0036), `calendar_feed_tokens`
  (0044), and `home_program_activities` (0038) **are all actually applied
  live**, despite every one of those migration files' own header comments
  still saying "NOT APPLIED" - those comments are stale, not current status;
  someone ran them since they were written and never updated the file (per
  CLAUDE.md's own warning to cross-check dates against `git log` rather than
  trust a status claim in a comment or doc). Confirmed via `pg_policies`
  matching each migration's policies exactly, `pg_tables`, and (for
  `client_messages`) `role_permissions` rows matching the seed exactly
  (`admin`/`supervisor`/`clinician` granted, `scheduler`/`hr_admin`/
  `payroll_admin`/`client` explicitly denied - not just absent).
- The `client-documents` Storage bucket exists, is **private**, and all four
  `storage.objects` policies migration `0036`'s footer suggested are applied
  live and match exactly. Round 5's "flagging for a human with a live
  project" manual-steps list is fully done - nothing left open there.
  Signed download URLs are generated fresh per page render with a 10-minute
  TTL (`SIGNED_URL_TTL_SECONDS`, `pages/documents.tsx`) - a copied/shared
  link stops working after 10 minutes, confirmed by reading the code path
  (this is inherent to `createSignedUrl()`'s own contract, not something
  that needed a live upload/download round trip to confirm).
- The calendar feed token route (`pages/api/calendar/feed/[token].ics.ts`)
  fails closed in every case tested by reading the code against the live
  schema: unknown token -> 404, revoked token -> 404 (same response as
  unknown, deliberately, so a probe can't distinguish "never existed" from
  "revoked"), a token whose owner has no linked `clients` row -> 404, and a
  DB error on any step -> 500 with a generic message, never a stack trace or
  row data. Every query after the token check is scoped by the token's own
  `user_id` -> that user's own `clients.id` -> `sessions.client_id` chain,
  never by anything in the request itself, so there's no path from "a valid
  token for family A" to "family B's sessions." The service-role client this
  route uses is confined to this one file, matches the same pattern
  `apps/web`'s `pages/api/leads/create.js` already established, and
  `SUPABASE_SERVICE_ROLE_KEY` being actually set in `apps/client`'s
  production environment (flagged as unconfirmed in `lib/calendar-feed-
  tokens.ts`'s own comment) - **still not something this session could
  check** - Supabase's Management API has no visibility into another app's
  process environment; if that key isn't set, the failure mode is every feed
  request 500ing, not a leak, but it's worth a human confirming before
  relying on the feature in the demo.
- `@summit/settings` is now an actual dependency of `apps/client`
  (`package.json`, `next.config.mjs`'s `transpilePackages`, `pages/_app.tsx`
  calling `initSettings()`) - added by a different overnight PR
  (`overnight/portals-per-org-visibility`, for `nav.visiblePortals`) since
  Round 3/4 logged the request. **Superseded, not still open**: Round 3's
  Settings-screen request and Round 4's session-duration request both cited
  "apps/client has no `@summit/settings` dependency" as the blocker - that's
  no longer true. A real Settings screen (replacing the Sidebar's
  "Settings... Soon" stub) is buildable against the package now; still not
  built here, since it's a product screen, not a bug fix, and out of scope
  for an audit pass. `lib/org-settings.ts`'s direct `org_settings` table read
  (bypassing `@summit/settings`'s public API) is still correct as-is despite
  the package now being available - its own header explains why: it runs in
  API routes with no request-scoped `@summit/session` identity to drive
  `initSettings()`'s cache, a server-side-vs-client-side distinction the new
  dependency doesn't change.

### Not attempted: a Playwright + mocked-Supabase stress-test harness

The task briefing for this round described `apps/client`'s recent PRs
(#124, #143) as having "established a working pattern" for a local mock
Supabase REST/Auth server driven by Playwright. **That pattern does not
exist anywhere in this repo** - checked directly: no `playwright` anywhere
outside `node_modules` search paths, no mock-Supabase server of any kind,
`apps/client/package.json` has no test runner or Playwright dependency at
all, and neither PR #124's nor PR #143's actual commits (`fd187b7`,
`105fd3f` and their surrounding merges) touch any test infrastructure.
Building one from scratch - a mocked PostgREST-shaped HTTP server plus a
mocked GoTrue auth flow, wired to real cookies this app's `proxy.ts` and
`lib/supabase-server.ts` would accept - is a substantial standalone project,
not a fits-in-this-pass addition, and this round had something strictly
better available for the question that mattered most (RLS/cross-family
leaks): direct read-only queries against the actual live schema (see above),
which confirms the real policies rather than whatever a hand-built mock
would have been programmed to assume. What this round could **not** do that
a real Playwright pass would have: render actual pages in a browser (mobile
breakpoints, both themes, the admin banner's real stacking - all still
verified by reading code and CSS rather than pixels, same limitation every
prior round in this file has had), or exercise the upload/download/mutation
round trips end-to-end with a real authenticated session (no real user
credentials were available to this session either). **Logging as a
request**: if a demo-quality stress-test harness for this app is wanted
going forward, it needs to be built as its own piece of work with schema
access and either real test-account credentials or a genuine mock - not
assumed to already exist.

### Overall read on demo readiness

Nothing found this round is cross-family-leak-shaped - every RLS policy this
app depends on was checked live and matches what the code assumes. The one
real functional gap (`session_change_requests` unapplied) is visible only if
someone actually clicks "Request reschedule"/"Request cancellation" on
`/appointments`, and fails safely (a clear error message, not a crash or a
blank page) when they do. Everything else audited this round - messaging,
documents, the calendar feed, the admin view-as banner, the sticky-banner
fix, budgets/statement (after this round's fix) - is live, correctly scoped,
and matches its own code's claims about itself. If the demo doesn't click
"Request reschedule," this app is in good shape to show as-is; if there's
time before tomorrow, applying migration `0040` closes the one gap that
would visibly misbehave.

---

## Round 5 (`feat/client-document-center`) — Documents built

Round 3's "Documents — not built" item above is superseded: a
`documents`-table and Storage-bucket did not exist when that pass ran, and
now do (as of this round), so the blocker it described no longer applies.

Built `pages/documents.tsx` (list + download of documents shared by the
clinic, plus an upload control for the family to send signed paperwork
back), `lib/documents.ts` (bucket name, upload-path convention, size cap),
`lib/supabase-browser.ts` (this app's first browser-side Supabase client -
upload is also this app's first mutation of any kind; disabled entirely
while `isAdminViewingAs`, matching `lib/admin-view-as.ts`'s read-only-
support-session design), and migration `0036_client_documents.sql`
(`client_documents` table + RLS, clinic-wide staff / own-record-only
family, same split as 0020/0023).

**Migration 0035 is not applied, and the Storage bucket it depends on does
not exist, as of this round.** The Supabase MCP available to this session
is read-only (root CLAUDE.md), so both are logged for a human, in the
migration file's own trailing comment and in the PR description:

1. Run migration `0035` against the live database.
2. Create a Storage bucket named `client-documents`, **private** - table
   RLS on `client_documents` governs the metadata row only; the bucket and
   its `storage.objects` policies are a wholly separate permission system
   this migration cannot set up.
3. Add the `storage.objects` RLS policies the migration's footer suggests
   (staff clinic-wide, family own-`client_id`-only, matching the table's
   split), scoped to the `{clinic_id}/{client_id}/{filename}` path
   convention `lib/documents.ts`'s `buildDocumentPath()` writes.

Until all three are done: the page still renders correctly (verified by
reading the code path, not a live render - see below) - the document list
loads empty (or errors if the table itself doesn't exist yet) rather than
crashing, every "Download" link degrades to a "Download link unavailable
right now" notice plus one central banner instead of a broken link per row
(`storageUnavailable` in `getServerSideProps`), and the upload form is
disabled with an inline explanation rather than failing silently.

Verified without a live Supabase project or a browser, same limitation
every prior round in this file notes (no `.env.local` in this worktree, no
reachable Supabase project) - `pnpm turbo build --filter=@summit/client`
(includes a full `tsc` pass; Next 16 does not skip type-checking on this
app's `next.config.mjs`) and a manual read-through of every branch in
`getServerSideProps` and the upload handler against the RLS policies
migration `0035` defines. **Flagging for a human with a live project**:
confirm the three setup steps above, then actually exercise the upload/
download round trip with a test file - this round could not.

## Messaging (migration 0038, `pages/messages.tsx`)

- **Staff senders show as "Your clinic", not by name.** A family session
  cannot select `profiles`, so a join for the author's name comes back
  null and would render as an unnamed sender. Every alternative is a
  schema change this session should not make unilaterally: a
  family-readable display-name view, a denormalized `author_display_name`
  on `messages`, or a `security definer` name resolver. The denormalized
  column is probably right, because it also survives a clinician leaving
  and their profile being deactivated. Flagged rather than guessed.

- **Attachments are metadata only.** `message_attachments` records the
  file, its type and its size, and the portal lists them. Nothing
  uploads or downloads: that needs a Supabase Storage bucket with its own
  policies plus a signed-URL route, and no bucket exists in this repo to
  write policies against. The allow-list and the 25 MB ceiling are in the
  table now so that whatever writes rows later cannot widen them.

- **No notification when the clinic replies.** The unread count is
  correct and per-reader, but it is only visible to someone who opens the
  portal. Email or SMS needs the notification tables from the brief's
  §17, which do not exist yet, and per that brief no PHI may appear in a
  notification preview - which is a design decision to make with the
  clinic, not to assume.

- **This portal still cannot be rendered without a real Supabase
  project.** `proxy.ts` now honours `NEXT_PUBLIC_DEV_PREVIEW=1` the way
  `apps/data` and `apps/employee` do, so the auth gate no longer bounces
  every route to login. That is only half of it: all ten pages load
  through `lib/supabase-server.ts`'s `createClient()` inside
  `getServerSideProps`, and there is no fixture path behind it the way
  `apps/data` has `lib/preview-data.ts`. Preview mode gets you past the
  gate and straight into a data error.

  Not built here because a fixture layer means inventing a plausible
  shape for every query on every page - households, guardians,
  permissions, sessions, goals, milestones, budgets, forms, consents,
  messages, announcements - and a fixture that disagrees with what the
  query actually returns is worse than none: it makes a broken page look
  fine. `apps/data`'s equivalent is ~600 lines and was written alongside
  its screens.

  What was done instead: `createClient()` now names the missing variable
  and the file it belongs in, and says explicitly that the preview flag
  does not cover data loading. Previously every page died on
  supabase-js's generic "Your project's URL and Key are required",
  thrown from inside whichever `getServerSideProps` ran first, naming no
  variable and no app.

  So: the accessibility and responsive pass in the brief's §13 has been
  done for `apps/data`'s screens and NOT for this portal's. Nobody has
  looked at these ten pages in a browser.
