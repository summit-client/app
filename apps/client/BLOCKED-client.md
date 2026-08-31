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
