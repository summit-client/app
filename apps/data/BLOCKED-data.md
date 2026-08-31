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

## Carried over — cross-portal refresh-token race: client-side `getUser()` calls are not freshness-checked

`proxy.ts` correctly uses `getUser()` and routes through `@summit/proxy-auth`'s
`sessionFreshness()` before ever calling it. `lib/data.ts` and
`@summit/session`'s `resolve()`, though, call `sb().auth.getUser()` directly
from the browser in several places (`createRunSession`, `ensureSessionRecord`,
`recordIncident`, `saveNote`, `myClinicId()`, plus round 2's
`getPendingCountersigns()`/`countersignNote()`/`createProgram()`/
`activateProgram()`/`saveClinicalReportProgress()`). None of these go
through `sessionFreshness()` first, because that function is explicitly
documented as server/edge-only (`packages/proxy-auth/index.ts`: "never
import this from a React component or anything client-rendered"). Round
3's new `hydrateClientHistory()` and its helpers do **not** add to this —
they're plain table reads under RLS, no `.auth.getUser()` call in any of
them. A client-safe freshness check would still be a `packages/proxy-auth`
or `packages/session` change, out of scope for `apps/data`-only work.

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
