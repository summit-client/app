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
