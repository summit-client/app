# Blocked items — apps/data hardening pass

Items from the hardening task list that could not be fixed inside `apps/data`
because the real fix requires a `packages/`, `supabase/migrations/`, or other
shared-file change, which is out of scope for this branch by instruction.
Logged here instead of fixed. Dated 2026-08-31.

---

## Item 2 — cross-portal refresh-token race: client-side `getUser()` calls are not freshness-checked

`proxy.ts` correctly uses `getUser()` and routes through `@summit/proxy-auth`'s
`sessionFreshness()` before ever calling it, exactly as documented in
`CLAUDE.md`. No change needed there.

However, `apps/data/lib/data.ts` (a `"use client"` module) calls
`sb().auth.getUser()` directly from the browser in several places —
`createRunSession`, `ensureSessionRecord`, `recordIncident`, `saveNote`,
`myClinicId()` — and `@summit/session`'s own `resolve()` (used by
`SessionProvider`) does the same on every identity load/refresh. None of
these go through `sessionFreshness()` first, because that function is
explicitly documented as server/edge-only ("never import this from a React
component or anything client-rendered, and never add `use client` here" —
`packages/proxy-auth/index.ts`).

This means the same cross-portal refresh-token race the `proxy.ts` fix closes
for page navigations is still reachable from the browser: if a clinician's
session is within the ~90s expiry margin and they hit "Save" on a note (or
any other write) around the same moment another portal tab is also making an
auth call, one of the two can get a hard `refresh_token_already_used` error
instead of a successful save. Today this fails safe (the write throws and is
not silently lost — `saveNote`/`createRunSession` etc. all surface the
Supabase error), but it is a bad time for a clinician's save button to break,
and it happens without a clear failure message.

**Why this isn't fixed in this branch:** the fix would be a client-safe
freshness check (either a browser variant of `sessionFreshness()` reading the
non-`HttpOnly` cookie via `document.cookie`, or restructuring these calls to
go through a server action so `proxy.ts`'s existing guard covers them) — both
are `packages/proxy-auth` or `packages/session` changes, out of scope for
`apps/data`-only work. Flagging for whoever owns `packages/proxy-auth` to
decide whether a client-safe sibling is worth adding, given it would need to
be re-verified against the exact same race `sessionFreshness()` was built to
avoid.

---

## Item 3 — HIGH: `session_notes`/`client_sessions` RLS does not distinguish clinician from supervisor, so a clinician can countersign their own note

**Security finding, not just an app bug.** `app/review/page.tsx` ("Supervisor
review queue") lets whoever opens it countersign a session note
(`saveNote({ ..., status: "countersigned" })`) and lock the session
(`lockRunSession` → `client_sessions.status = "locked"`). Both writes go
through the browser Supabase client under RLS.

Checked `supabase/migrations/0001_clinical_data_collection.sql`: every
clinical table in that migration, `session_notes` and `client_sessions`
included, gets the same generic per-command policy —

```sql
create policy %I_staff_update on %I for update
  using (clinic_id = auth_clinic_id() and auth_is_staff());
```

— and `auth_is_staff()` is `auth_role() in ('admin','supervisor','clinician')`.
There is no policy anywhere that further restricts the countersign/lock
write to `admin`/`supervisor` only. Combined with `@summit/portals`' `ACCESS`
map (`clinician` portal admits `admin`, `supervisor`, `clinician` equally),
**a plain clinician-role account has exactly the same RLS-level permission
to countersign a session note as a supervisor does.** The whole point of a
countersignature — an independent second person confirming the note — is
not actually enforced by the database; only the UI's framing ("Supervisor
review queue") and the fact that a clinician wouldn't normally think to look
suggested it was.

**Fixed in this branch, UI layer only:** `app/review/page.tsx` now checks
`identity.appRole` and shows an explanation instead of the queue when the
viewer is `clinician`; `components/portal-chrome.tsx` also hides the "Review
Queue" nav link for `clinician`. This stops the everyday accidental case and
matches the app's existing "hide the UI, but the real gate is elsewhere"
pattern (see `CLAUDE.md`'s RLS-empty-set trap notes) — but it is **not** the
authoritative fix. A clinician who knows the API surface (devtools, a
script using their own session) can still call the same
`session_notes`/`client_sessions` update directly and have RLS allow it.

**Real fix needs a migration** (out of scope for this `apps/data`-only
branch): split the generic `%I_staff_update` policy for `session_notes` and
`client_sessions` so the specific transition to `countersigned`/`locked`
requires `auth_role() in ('admin', 'supervisor')`, while leaving clinicians
able to update their own note's other fields (drafting, submitting for
countersign) under the existing broader policy. This likely needs a
`with check` that inspects `NEW.status` rather than a blanket per-table
split, since the same table serves both the clinician's draft/submit writes
and the supervisor's countersign/return writes.

Also worth checking while in there: `programs.status` has the same shape
of problem if/when goal creation actually starts writing to the DB (today
`app/clients/[id]/programs/page.tsx`'s "Save goal (pending supervisor
sign-off)" is local UI state only, with no Supabase write at all, so there
is nothing to exploit yet — but the same missing distinction would apply
the moment that feature is wired up for real).

---

## Item 3 — settings write UI now defers to RLS's admin-only org write, but the underlying settings tables have no clinician/supervisor split either

Not a new finding — `org_settings`/`role_settings` are already correctly
admin-only per migration 0012 (`auth_role() = 'admin'`), so nothing to log
as broken here. Noting only because the app-layer fix in this branch
(`components/settings/controls.tsx`, `components/settings/custom.tsx`)
disables org-scope controls in the UI for non-admins to avoid the confusing
"click it, it reverts with no explanation" round trip described in
`CLAUDE.md`'s RLS-empty-set section — this is a UX fix riding on an
RLS boundary that was already correct, not a new gate.

---
