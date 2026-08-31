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
