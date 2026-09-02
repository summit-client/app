# Blocked items — apps/data hardening pass (round 4)

Items that could not be fixed inside `apps/data` because the real fix
requires a `packages/`, `supabase/migrations/`, or other shared-file change,
out of scope for this branch by instruction. Logged here instead of fixed.

**Round 4 was a full pre-demo audit and stress test** (2026-09-02, ahead of
tomorrow's demo — employee portal is the focus, but web/scheduler/data/client
are all shown), not just a re-read: RLS re-verified against a real scratch
Postgres (not just code review), every screen driven with Playwright in
preview mode as clinician/supervisor/admin, and a full write→sign→countersign
walkthrough exercised end to end. Summary of what changed this round:

- **Closed the last two `getUser()`-freshness gaps** `lib/data.ts`'s BLOCKED
  note already flagged: `lib/workforce.ts` and `lib/funding.ts` now call the
  same `ensureFreshSession()` guard before every direct
  `sb().auth.getUser()` call, exactly the two-line shape the note said it
  would be. No architectural change.
- **Re-verified migration `0043` (supervisor-gated status transitions)
  actually blocks a clinician's raw `.update()` call, not just the UI
  button** — see "Verified" section below for how and what was tested. It
  holds. The "Carried over, HIGH" RLS gap this round 3's doc still listed is
  now closed and the section below reflects that.
- **Fixed a real infinite-hang bug**: `app/clients/[id]/layout.tsx` had no
  way to distinguish "still loading" from "no such client" — a bad,
  cross-clinic-blocked-by-RLS, or deleted client id spun on "Loading
  client…" forever with no way out. Now shows a "Client not found" screen
  with a link back to the caseload once the lookup genuinely comes back
  empty.
- **Fixed a genuine demo-breaker**: `lib/preview-facts.ts` (the Attention
  screen's synthetic caseload) used `clientId` 201-204 and named one client
  "Alex R." — none of which match `preview-data.ts`'s real preview clients
  (101-104: Arjun S./Maya T./Leo K./Sofia R.). Every one of the five flagged
  cards on `/attention`'s "Review case" button linked to a client that
  doesn't exist in preview mode. `lib/preview-report.ts` had the same `202`
  literal baked into its incident branch. Both fixed; verified all five
  links now resolve to a real client record.
- **Fixed a second, narrower instance of the same fixture-id bug**:
  `lib/funding.ts`'s preview budgets used `clientId: 1` (none of the real
  preview clients), so the Funding tab showed "No budget recorded" for
  every demo client regardless of which one was open. Now `101` (Arjun S.).
- **Minor UX fix**: `.client-tabs` scrolls horizontally instead of wrapping
  (by design, see CLAUDE.md's design-system section) — but nothing scrolled
  the active tab into view, so landing directly on a tab late in the list
  (Timeline, Case Review, Report) could put it off-screen with no visible
  indication which tab was current. Added a `scrollIntoView` on the active
  tab's ref.
- Everything below not marked "Fixed" or "Verified" this round was
  re-checked against current `main` and is still exactly as described —
  nothing in `packages/` or `supabase/migrations/` touched any of it since
  round 3.

---

## Verified this round — migration `0043`'s supervisor gate actually holds at the database

Round 3 logged this as the "Carried over, HIGH" gap below; migration `0043`
(merged the same night as this audit) is the fix it called for. Re-verified
independently rather than trusting the migration's own comment: built a
scratch Postgres (local `postgresql-16`, not the live project — per
CLAUDE.md, a migration is verified against scratch, never applied live from
here), ran the actual migration files (`0000`, `0001`, `0004`, `0021`,
`0043` — unmodified, straight from `supabase/migrations/`) against it with a
minimal stub of Supabase's `auth.uid()`/`auth.users`, seeded one clinician
and one supervisor profile, and issued raw `update` statements as each role
(`set role authenticated; set request.jwt.claim.sub = '<uuid>'`) — no app
code involved, exactly the "devtools, a script, curl with their own JWT"
threat model `0043`'s own header names.

Result: a clinician's direct `update session_notes set status =
'countersigned' ...` / `update programs set status = 'active' ...` /
`update client_sessions set status = 'locked' ...` against their own
clinic's rows all raise the expected `raise exception` from `0043`'s
triggers. The same three statements as the supervisor succeed. A follow-up
check confirmed the migration is narrowly scoped as its header claims: a
clinician's *other* legitimate writes on the same three tables (planning →
active, draft → signed → awaiting_countersign, draft → pending_signoff)
are untouched and still succeed for a clinician. This closes the "Carried
over, HIGH" item round 3 logged — see that item's history immediately below
for the original gap description, kept for the record.

---

## Fixed — cross-portal refresh-token race: client-side `getUser()` calls are not freshness-checked

Closed by a `packages/proxy-auth`-scoped overnight change (module-scoped
dispatch, not an `apps/data`-only branch — this is exactly the kind of fix
this doc kept saying was out of reach for one): `packages/proxy-auth/client.ts`
adds `clientSessionFreshness()`, a new, additive, browser-safe sibling of
`sessionFreshness()` (`index.ts`, left untouched). It reads the same
`sb-<ref>-auth-token` cookie via `document.cookie` instead of a server
request object — confirmed safe by reading `@supabase/ssr`'s own source
(v0.10.3): every portal's `createBrowserClient()` already manages this exact
cookie through `document.cookie` (that's how the SDK persists a session in
the browser at all), and `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` sets
`httpOnly: false` explicitly, so nothing about reading it client-side was
ever unsafe — it just hadn't been done yet. See `client.ts`'s own file
header for the full trail.

`lib/data.ts` now calls a new local `ensureFreshSession()` (mirrors
`proxy.ts`'s own "check freshness, redirect through the central refresh
endpoint if stale" pattern, using `@summit/portals`' `refreshUrl()`/
`loginUrl()`) before every function that reaches `sb().auth.getUser()` —
directly or transitively through `myClinicId()`/`ensureSessionRecord()`:
`createRunSession`, `createNoteOnlySession`, `ensureSessionRecord`,
`getMyClients`, `myEmployeeId`, `createProgram`,
`saveClinicalReportProgress`, `recordIncident`, `saveNote`,
`countersignNote`, `myClinicId` (which transitively covers `endRunSession`
and `recordEvent`, neither of which calls `getUser()` directly). This list
has shifted since round 2 wrote it: `getPendingCountersigns()` does **not**
call `.auth.getUser()` (it's a plain RLS-scoped read) so it needed no
change, and `activateProgram()` doesn't either — the list above is what's
actually true of the current file, not the round-2 list verbatim. `@summit/session`'s
`resolve()` was deliberately **not** touched — the fix above is fully additive
and narrow enough not to need it.

**Fixed this round (round 4):** `apps/data/lib/workforce.ts` and
`apps/data/lib/funding.ts` also called `sb().auth.getUser()` directly from
the browser (own `createBrowserClient()` instances, not `lib/data.ts`'s)
with no freshness check. Round 3 confirmed the fix was a two-line addition
per call site and left it for a future pass; round 4 made that pass — both
files now have their own `ensureFreshSession()` (same shape as
`lib/data.ts`'s), called before every direct `.auth.getUser()` call
(`workforce.ts`'s `myClinicId()`; `funding.ts`'s `myClinicId()`,
`saveBudget()`, `postEntry()`, `reconcile()`). No architectural change, as
predicted.

---

## Closed (round 4) — `session_notes`/`client_sessions`/`programs` RLS grants clinician the same write rights as supervisor

Closed by migration `0043` (merged the same night as round 4's audit) —
`auth_is_supervisor_or_admin()` plus three narrowly-scoped `before update`
triggers, exactly the shape this section originally asked for. Independently
re-verified against a scratch Postgres, not just read — see "Verified this
round" near the top of this file for how and what was tested. Original gap
description kept below for the record.

The root cause behind two things round 2 made functional (the Review
Queue and the Programs sign-off action): `auth_is_staff()`-shaped RLS
policies (`clinic_id = auth_clinic_id() and auth_is_staff()`) admit
`admin`, `supervisor` and `clinician` identically on every table this
applies to, with no primitive anywhere in the schema for "staff at or
above supervisor." Both features worked correctly cross-user, but the
actual countersign/activate writes were gated by app code only
(`identity.appRole` checks in `review/page.tsx` and `programs/page.tsx`),
not by the database — a clinician who knew the API surface could call the
same Supabase update directly and have RLS allow it.

Round 3 didn't add a fourth instance: the newly-hydrated tables
(`behaviour_incidents`, `session_program_summaries`) are read-only from
`apps/data`'s side (hydration never writes), so there was no new write path
for this same gap to show up on. Still true — round 4 didn't add one either.

---

## Carried over — "Summit Clinician" branding still hardcoded

`app/layout.tsx` still hardcodes "Summit Clinician" as both the page
`<title>` and the mobile topbar title instead of reading `org.name` from
`@summit/settings`. Already tracked in `docs/context/product.md`'s
multi-tenant-readiness list (item 8), bundled there with the logo-upload
and accent-recolor work — a partial (e.g. mobile-only) fix would make the
portal show two different names at two breakpoints, worse than the
current uniform branding. Left alone, per the standing instruction not to
re-litigate what's already recorded elsewhere.

---

## Carried over — `trial_events` (raw per-trial observations) still isn't hydrated

`hydrateClientHistory()` (see the PR description) pulls in a client's real
`client_sessions`, `session_notes`, `behaviour_incidents` and
`session_program_summaries` — everything the Sessions/Timeline/Graphs tabs
need except the raw atomic observations (`eventsForSession()`/
`eventsFor()`, backed by `trial_events`). That table is one row per trial
tap, by far the highest-volume table this app writes, and every current
caller of those two functions only ever needs a count or a same-session
live feed — never the full observation list for display. Bulk-fetching a
client's entire raw-observation history into the browser to show a number
(`eventsForSession(s.id).length` in the Sessions tab and Timeline) is a
worse trade than the gap it closes.

Concretely: a session's observation count and per-trial tally (Y/P/N
breakdown, the Graphs tab's lineage panel) still read as zero/unavailable
when viewed from a device other than the one that ran the session. The
UI now says so explicitly (`graphs/page.tsx`'s lineage panel) instead of
silently showing a wrong-looking "0× Y · 0× P · 0× N". If this needs
closing properly, the right shape is probably a per-session aggregate
(count + Y/P/N breakdown) computed server-side — matching what
`session_program_summaries` already does for the percentage/count metric
— rather than shipping the raw rows to the browser.

---

## Carried over — hydration runs more than once per page view

`app/clients/[id]/layout.tsx` calls `hydrateClientHistory(clientId)` on
every route change within a client (so the header's "Resume
session"/"last completed" badges stay current across tab switches), and
each of `sessions/page.tsx`, `timeline/page.tsx`, `graphs/page.tsx`,
`clients/[id]/page.tsx` and `run/page.tsx` *also* calls it once on its own
mount — meaning navigating to e.g. `/clients/5/sessions` fires two
concurrent, redundant queries for the same data (the layout's and the
page's). Both converge on the same merged result (the merge is
idempotent), so this is a wasted round trip, not a correctness bug.

Not fixed here: doing so properly needs either a shared per-client
hydration cache with a short TTL (skip a re-fetch that happened moments
ago) or lifting the fetch to be owned by the layout alone with a context/
prop to signal "hydration for this client is done" down to whichever tab
is mounted — both are a real, if modest, restructuring of how these pages
get their data, and given this schema's data volumes are clinic-scale
(not high-traffic), the actual cost of the duplicate query is small.
Flagging it as a known inefficiency rather than fixing it speculatively.

---

## New — `/caseload`'s clinician scoping is a proxy, not a real assignment

`feat/clinician-roster-quick-access` made `getMyClients()`
(`lib/data.ts`) filter the "My Caseload" roster to clients this clinician
has at least one `client_sessions` row for (`clinician_id = auth.uid()`).
That's the closest real, already-populated relationship this schema has —
migration 0014's own header states plainly that there is no
clinician-to-client assignment table, which is why it granted `clients`/
`sessions` read clinic-wide instead of scoping them. Filtering
`client_sessions` by `clinician_id` needed no new grant (it's already
readable clinic-wide under `auth_is_staff()`, migration 0004); this is a
`WHERE` clause on data already permitted, not a widened policy — in
keeping with the instruction not to add a broad new grant to work around
a relationship that isn't cleanly queryable.

**Known gap this proxy inherits, not fixed here:** a client with no
`client_session` yet — a brand-new intake this clinician hasn't run a
first session with — won't appear on their roster even if they are the
intended clinician. The real fix is a clinician-assignment column or
table (e.g. `clients.primary_clinician_id`), which is a migration, out of
scope for an `apps/data`-only branch. Until that exists, a brand-new
intake's clinician has to reach that client by some other route (the
scheduler, a direct link) rather than the roster, for as long as it takes
for a first session to exist.

Also not filtered by clinician: the scheduler's own booking table
(`sessions`, `employee_id → staff.id`) has no link from `staff` back to
`auth.users`/`profiles` until migration 0026's employment-record
reconciliation, so "this clinician's own upcoming bookings" can't be
computed the same way. The roster's "Next session" column instead shows
the client's next scheduled booking with *any* staff member (still
useful — it's about the client, not who's covering it — but not
guaranteed to be this clinician's own session), and the "Schedule" quick
link opens the scheduler's general Sessions view rather than one
pre-filtered to the client, since the scheduler has no URL param it reads
for a client filter and this branch doesn't touch `apps/scheduler`.

---
