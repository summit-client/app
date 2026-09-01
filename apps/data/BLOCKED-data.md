# Blocked items — apps/data hardening pass (round 3)

Items that could not be fixed inside `apps/data` because the real fix
requires a `packages/`, `supabase/migrations/`, or other shared-file change,
out of scope for this branch by instruction. Logged here instead of fixed.

Round 3 closed the largest item round 2 explicitly deferred: the
session-history views (Sessions/Timeline/Graphs tabs, the client overview,
the "Resume session" badge) were reading exclusively from a per-browser
local mirror instead of the client's real, clinic-wide history. See the PR
description for what changed. What's below is what remains genuinely
blocked, carried forward from round 1 (`#99`) and round 2 (`#104`) — still
true, nothing in `packages/` or `supabase/migrations/` changed since either.

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

**Not covered by this round, same shape of gap, found while fixing the
above:** `apps/data/lib/workforce.ts` and `apps/data/lib/funding.ts` also
call `sb().auth.getUser()` directly from the browser (own `createBrowserClient()`
instances, not `lib/data.ts`'s) with no freshness check. They were out of
scope for this dispatch (scoped to `packages/proxy-auth` plus the specific
`lib/data.ts` call sites the round-2/3 note already tracked), but the fix is
now a two-line addition per call site (`import { clientSessionFreshness }
from "@summit/proxy-auth/client"` and the same `ensureFreshSession()`-shaped
guard `lib/data.ts` now has) rather than a new architectural decision.

---

## Carried over, HIGH — `session_notes`/`client_sessions`/`programs` RLS grants clinician the same write rights as supervisor

The root cause behind two things round 2 made functional (the Review
Queue and the Programs sign-off action): `auth_is_staff()`-shaped RLS
policies (`clinic_id = auth_clinic_id() and auth_is_staff()`) admit
`admin`, `supervisor` and `clinician` identically on every table this
applies to, with no primitive anywhere in the schema for "staff at or
above supervisor." Both features work correctly cross-user, but the
actual countersign/activate writes are still gated by app code only
(`identity.appRole` checks in `review/page.tsx` and `programs/page.tsx`),
not by the database. A clinician who knows the API surface could still
call the same Supabase update directly and have RLS allow it. The real
fix is a migration — either a new `auth_is_supervisor_or_admin()` helper
function plus a `with check` on the specific status transitions that
matter, or an equivalent — applied to `session_notes`, `client_sessions`
and `programs` together, since it's one root cause showing up in three
places, not three separate bugs.

Round 3 does not add a fourth instance: the newly-hydrated tables
(`behaviour_incidents`, `session_program_summaries`) are read-only from
`apps/data`'s side (hydration never writes), so there's no new write path
for this same gap to show up on.

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

## New this round — `trial_events` (raw per-trial observations) still isn't hydrated

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

## New this round — hydration runs more than once per page view

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
