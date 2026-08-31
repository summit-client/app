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

## Item 5 — multi-tenant hardcoded-values audit results

Grepped `apps/data` for hardcoded clinic-specific UUIDs, "Mount Etna"/similar
literals, and single-clinic assumptions. Found and fixed one real bug (not a
literal, but the same class of problem — see below); nothing else found that
needed a code change.

**Fixed:** `lib/data.ts`'s `endRunSession()` wrote `clinic_id: null` into
every `session_program_summaries` row instead of calling `myClinicId()` like
every other write in the same file. `session_program_summaries`' RLS
policies (migration 0004) are `clinic_id = auth_clinic_id() and
auth_is_staff()` with no `clinic_id is null` fallback (unlike
`scorecard_metrics`/`credential_rule_versions`, which deliberately allow a
null clinic_id for shared/system-default rows) — `null = auth_clinic_id()`
is never true in SQL, so the insert's own `with check` would fail and the
whole upsert would throw. In live mode, ending a session with any computed
program summary would have thrown here every time. Not a cross-tenant leak
(the row would be unreadable to everyone, not readable to everyone), but a
real functional break. Fixed to pass the caller's real `clinic_id`.

**Found, not fixed (already tracked in `docs/context/product.md`, item 8 of
"Multi-tenant readiness"):** `app/layout.tsx` hardcodes "Summit Clinician" as
both the page `<title>` and the mobile topbar title, instead of reading
`org.name` from `@summit/settings`. Per the standing instruction not to
re-litigate what's already recorded, this branch does not touch it — noting
why: "Summit Clinician" is Summit's own product name (the same way any SaaS
product shows its own name unless white-labeled), and the desktop sidebar
already hardcodes "Summit" / "Clinician" as two static elements right next
to where the mobile topbar's single line would need to change. Swapping only
the mobile-topbar line for `org.name` would make the portal show two
different names depending on screen width, which is worse than the current
uniform (if non-parameterized) branding — the product.md item bundles this
with the logo-upload and accent-recolor work (items 9–10 in the same list)
for a reason; it wants one coordinated white-label pass, not a partial one.

Also worth noting for whoever picks up that pass: `packages/settings`'s
`org.name` setting default is itself `"Mount Etna Child & Family Services"`
(`packages/settings/index.ts`) — a real clinic-specific value baked in as
the fallback every new clinic sees until they set their own. Out of scope
here (packages/), but flagged since it's the literal thing CLAUDE.md's
"treat clinic-specific values as temporary and say so" instruction is about.

No hardcoded clinic UUIDs, clinic names, or single-clinic-assumption logic
were found anywhere else in `apps/data` — every other clinic-scoped write
already resolves the caller's own `clinic_id` dynamically via
`myClinicId()` / `profiles.clinic_id`.

---
