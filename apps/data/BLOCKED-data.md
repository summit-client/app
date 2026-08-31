# Blocked items — apps/data hardening pass (round 2)

Items that could not be fixed inside `apps/data` because the real fix
requires a `packages/`, `supabase/migrations/`, or other shared-file change,
out of scope for this branch by instruction. Logged here instead of fixed.

This round went deeper on feature work per an explicit follow-up request:
several things round 1 left as "local-only prototype, not exploitable, out
of scope" are now wired to real Supabase persistence where the existing
schema already supports it (no migration needed) — see the PR description
for the full list. What's below is what remains genuinely blocked.

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
