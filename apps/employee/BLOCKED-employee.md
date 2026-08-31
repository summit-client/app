# Blocked / logged items — apps/employee hardening pass

Items that are outside this session's walls (anything in `packages/`, `docs/`
or another app), need a decision this session cannot make, or turned out on
inspection to already be correct. Recorded so none of it is silently dropped.

---

## Blocked: needs a `packages/` or product change

### 1. BrightHR tenant id is a clinic-specific value in code

`lib/content-server.ts` falls back to Mount Etna's own BrightHR tenant UUID
when `BRIGHTHR_TENANT_ID` is unset. Marked temporary in the file this session,
per CLAUDE.md's standing instruction, but not fixed.

**Why it isn't a same-session fix.** An environment variable can express one
tenant per deployment, and the objective is several clinics on one
subscription. The real shape is a per-clinic setting — but it is not only the
id: the eight course slugs in `COURSE_LINKS` are Mount Etna's own BrightHR
catalogue, so a second clinic needs its own course list, not just its own
`?tid=`. That makes it a `@summit/settings` key plus a data model for
per-clinic training catalogues, and `packages/settings` is read-only to this
session.

**Upstream change wanted.** A `training.brighthr` org-scoped settings group
holding `{ tenantId, courses: Record<courseKey, slug> }`, so
`lib/content-server.ts` resolves both from settings and keeps the current
values as the seeded default for the anchor client.

**Interim risk if a second clinic onboards first:** they would be sent to
Mount Etna's BrightHR tenant. The links would resolve and the wrong
organization's training would be recorded.

---

## Checked, already correct — no change made

### 2. `proxy.ts` auth pattern

Already matches the documented cross-portal refresh-token fix exactly: it calls
`sessionFreshness()` on the raw cookies before ever calling `getUser()`, and
redirects to `apps/web`'s central refresh endpoint when the session is stale.
The preview bypass is double-gated on the flag AND `NODE_ENV !== "production"`.
The redirect target is built from `urlFor("employee")` rather than
`request.url`, which is correct behind nginx.

Grepped the whole app for other `getUser(` / `getSession(` call sites. The only
hit is `lib/session.ts`'s own exported `getSession()`, which is this portal's
function name for resolving its `HubRole` — it delegates to
`@summit/session`'s `getIdentity()` and never calls Supabase auth directly. Not
a second unguarded entry point. No change made.

### 3. Role gating is server-side where it needs to be

`proxy.ts` gates authentication for every route. Role gating is then done in
two places: `@summit/portals`' `ACCESS.employee` (via `gate()` in
`lib/session.ts`) and `AdminAccessGate` on the Admin console.

`AdminAccessGate` reads the RLS-backed identity's `appRole`, not a role the
browser holds — a previous session fixed a real hole here where the check read
a role out of `localStorage` that the My Profile screen let anyone set. The
gate is client-side, but the data behind it is protected by `hub_can_manage()`
in the database (migrations `0006` and `0022`), so hiding the UI is
defence-in-depth rather than the enforcement point. No change made.

### 4. RLS empty-set trap

`lib/session.ts` routes every problem through `@summit/session`'s
`explainProblem()`, which distinguishes `NO_CLINIC` from `ROLE_EXCLUDED`, and
`components/hr-provider.tsx` / `hub-provider.tsx` render it. A user who fails a
gate gets a sentence, not a blank portal. No gaps found.

### 5. Dead stylesheets and dead classNames

`app/app.css` is imported by `app/layout.tsx` (line 7), after the three
`@summit/design` stylesheets, which is the documented order. Not the dead-file
situation `apps/web` had.

Scanned every `className` in the app against every rule in the four stylesheets
that are actually imported. Thirteen candidates came back with no matching
rule; all thirteen resolved on inspection:

- `.no-print`, `.cert-scroll` — defined in an inline `<style>` block on
  `app/certificates/[id]/page.tsx` itself, which is also what keeps the portal
  bar and sidebar off a printed certificate.
- `.tab`, `.status`, `.value`, `.subject`, `.a`, `.c`, `.e`, `.i`, `.st`,
  `.true`, `.erupt` — all false positives from the scanner. The real class is
  `mode-tab` (defined in `packages/design/components.css`); the rest are
  JavaScript identifiers inside template literals, not class names.

No dead classNames. No change made.

### 6. `NEXT_PUBLIC_*` gating

No auth or security behaviour is gated on a `NEXT_PUBLIC_` var anywhere in this
app. The two Supabase vars are the anon URL/key, which are public by design.
The one misuse found — the "Preview data" badge reading the raw flag without
the `NODE_ENV` check — is fixed in this branch rather than logged here.

### 7. Responsive breakpoints — no tiers needed, and adding them would be noise

The brief points at `apps/client`'s `design-b.module.css` (1100/760/520 on top
of the shared 820px drawer) as the reference. This app has only the 820px
block, and after checking, that is correct rather than a gap:

- Both grids in `app.css` use `repeat(auto-fill, minmax(...))`, which reflows
  continuously. Fixed tiers would do nothing they do not already do.
- No `gridTemplateColumns` anywhere in the TSX declares fixed columns.
- No fixed width at or above 600px except the certificate itself
  (`width: 1123` — A4 landscape), which is deliberately fixed and already sits
  inside its own `.cert-scroll { overflow-x: auto }` container.
- `.settings-nav` is the one fixed-width element (230px) and the existing 820px
  block already collapses it.
- All nine `<table className="data">` are already wrapped in
  `.card table-wrap`, so they scroll inside themselves rather than pushing the
  page body sideways. (I initially read this as nine unwrapped tables — the
  wrapper is on the preceding line and a same-line grep missed it. Checked
  before changing anything; no change was needed.)

Adding three empty media queries to match another app's file would be
cargo-culting. No change made.

### 8. PHI in logs, URLs and error messages

Two `console.warn` calls, both in audit-write failure paths
(`lib/hub-backend.ts`, `lib/hr-backend.ts`), and both log a Supabase
`PostgrestError` — `message`, `details`, `hint`, `code` — for a write to an
audit table. The row being written is not logged. `details` on a constraint
violation can echo the offending value, which for these tables is an actor id
and an event name rather than anything clinical.

No PHI in any route, query string or client-side error surface: this portal's
screens are the signed-in employee's own HR records, keyed by `auth.uid()`, and
no screen takes an identifier from the URL except `certificates/[id]`, which is
a certificate id belonging to the caller.

Left as-is rather than changed. Flagged here because "audit write failed"
losing its error object entirely would be worse, and narrowing it to
`error.code` is a judgement call about diagnosability that belongs with whoever
owns the audit trail.
