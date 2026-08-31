# Blocked items — apps/data hardening pass (round 2)

Items that could not be fixed inside `apps/data` because the real fix
requires a `packages/`, `supabase/migrations/`, or other shared-file change,
out of scope for this branch by instruction. Logged here instead of fixed.

This round went deeper on feature work per an explicit follow-up request:
several things round 1 left as "local-only prototype, not exploitable, out
of scope" are now wired to real Supabase persistence where the existing
schema already supports it (no migration needed) — see the PR description
for the full list. What's below is what remains genuinely blocked.

Carried over from the merged round-1 pass (`#99`) — still true, nothing in
`packages/` or `supabase/migrations/` changed since:

---

## Carried over — cross-portal refresh-token race: client-side `getUser()` calls are not freshness-checked

`proxy.ts` correctly uses `getUser()` and routes through `@summit/proxy-auth`'s
`sessionFreshness()` before ever calling it. `lib/data.ts` and
`@summit/session`'s `resolve()`, though, call `sb().auth.getUser()` directly
from the browser in several places (`createRunSession`, `ensureSessionRecord`,
`recordIncident`, `saveNote`, `myClinicId()`, and now this round's
`getPendingCountersigns()`/`countersignNote()`/`createProgram()`/
`activateProgram()`/`saveClinicalReportProgress()` too — every new write this
round follows the same existing pattern). None of these go through
`sessionFreshness()` first, because that function is explicitly documented
as server/edge-only (`packages/proxy-auth/index.ts`: "never import this from
a React component or anything client-rendered"). A client-safe freshness
check would be a `packages/proxy-auth` or `packages/session` change, out of
scope for `apps/data`-only work.

---

## Carried over, HIGH — `session_notes`/`client_sessions`/`programs` RLS grants clinician the same write rights as supervisor

The root cause behind two things this round actually made functional (the
Review Queue and the Programs sign-off action): `auth_is_staff()`-shaped
RLS policies (`clinic_id = auth_clinic_id() and auth_is_staff()`) admit
`admin`, `supervisor` and `clinician` identically on every table this
applies to, with no primitive anywhere in the schema for "staff at or above
supervisor." Both new features now work correctly cross-user for the first
time, but the actual countersign/activate writes are still gated by app
code only (`identity.appRole` checks in `review/page.tsx` and
`programs/page.tsx`), not by the database. A clinician who knows the API
surface could still call the same Supabase update directly and have RLS
allow it. The real fix is a migration — either a new
`auth_is_supervisor_or_admin()` helper function plus a `with check` on the
specific status transitions that matter, or an equivalent — applied to
`session_notes`, `client_sessions` and `programs` together, since it's one
root cause showing up in three places, not three separate bugs.

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

## Noted, not fixed — the rest of the session-history views are still local-only

Fixing the Review Queue (see the PR description) surfaced how far this
goes: `runSessionsFor()`, `getRunSession()` and `openSessionFor()` (all in
`lib/data.ts`) read exclusively from the in-browser `mem.sessions`
mirror, never from `client_sessions` in Supabase. That mirror is
persisted to `sessionStorage` (survives a reload, not a different
device/browser), so `app/clients/[id]/sessions/page.tsx`, `.../timeline`,
`.../graphs`, and the client overview's "sessions this device" tile all
only ever show sessions *this specific browser* ran — not the client's
real, full session history from other clinicians' devices or a previous
browser session.

This is a much larger rework than the Review Queue was (it touches the
whole Run Session state machine: `createRunSession`, `updateRunSession`,
`startRunSession`, `endRunSession`, `completeRunSession`, and every
screen that calls `runSessionsFor`/`getRunSession`/`openSessionFor`), and
it's a different shape of problem — "this device doesn't remember other
devices' work" rather than a cross-user workflow that's actually broken
the way the Review Queue was (a supervisor's queue being permanently
empty defeats the whole feature; a clinician's own session list being
scoped to their own device is a real gap but a narrower one). Flagging it
here rather than attempting it in this pass, since a wrong rewrite of the
session state machine risks a much worse regression than the win is worth
in one sitting.

---

## Item 3 — the same countersign-shaped RLS gap now also applies to `programs`

Wiring `NewGoalForm` to a real `programs` insert (see the PR description)
surfaced the identical gap the Review Queue finding already documented for
`session_notes`: `programs`' RLS update policy (`clinic_id = auth_clinic_id()
and auth_is_staff()`, migration 0001) admits `clinician`, `supervisor` and
`admin` identically, so nothing at the database stops a clinician account
from flipping their own goal's `status` from `pending_signoff` to `active`
— the sign-off is app-layer only (`app/clients/[id]/programs/page.tsx`'s
`canSignOff` check), same posture as the Review Queue.

Not filing this as a second, separate finding since it's the same root
cause (`auth_is_staff()`-shaped policies don't distinguish clinician from
supervisor anywhere in this schema) — the real fix belongs with the
`session_notes` one, likely as one migration that introduces whatever the
correct primitive is (a `auth_is_supervisor_or_admin()` helper, or a
`with check` that inspects the target status), applied to both tables
together rather than patched table-by-table as each one is separately
noticed.

---
