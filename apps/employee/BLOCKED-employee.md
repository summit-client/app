# Blocked / logged items — apps/employee hardening pass

Items that are outside this session's walls (anything in `packages/`, `docs/`
or another app), need a decision this session cannot make, or turned out on
inspection to already be correct. Recorded so none of it is silently dropped.

---

## Blocked: needs a `packages/` or product change

### 1. BrightHR tenant id is a clinic-specific value in code — fixed this session

Was: `lib/content-server.ts` fell back to Mount Etna's own BrightHR tenant
UUID when `BRIGHTHR_TENANT_ID` was unset, and `COURSE_LINKS` hardcoded Mount
Etna's own eight BrightHR/BrightSafe course slugs. This session had
`packages/settings` in scope (additive only), so the upstream change this
item asked for is now done: a `training.brighthr` org-scoped
`@summit/settings` group — `training.brighthr.tenantId` plus one
`training.brighthr.courses.<courseKey>` entry per course (`BRIGHTHR_TENANT_DEFAULT`/
`BRIGHTHR_COURSE_DEFAULTS` in `packages/settings/index.ts`) — seeded with
exactly the old hardcoded values as the default, so Mount Etna is
byte-identical with no override set. `lib/content-server.ts` now resolves
both from `getSetting()` instead of the removed fallback/`COURSE_LINKS`
object; the vendor (BrightHR vs BrightSafe) and URL shape per course key stay
in code as structural routing, not tenant data.

**Residual gap, not fixed here:** `getSetting()` in a Route Handler (this
file's only caller) always reads the settings registry's static default,
never a real org's override — `@summit/settings`' live cache is only ever
populated by `initSettings()`, called client-side. This is the same
limitation `app/layout.tsx` and `app/certificates/[id]/page.tsx` already
carry for `getSetting("org.name")`, logged as open in `apps/data`'s
`BLOCKED-data.md`. So a second clinic's override, once one exists, would not
yet actually change what this route resolves to — this session gives that
clinic a place to put its tenant ID and course slugs and removes Mount
Etna's values from code, but a Route Handler actually reading a live
override needs the server-side settings read that's already tracked as open
elsewhere. Not re-logged here to avoid two open items for the same root
cause.

---

### 2. Client-facing receipts — the data now exists, the screen is not mine

Asked for directly: receipts carrying the practitioner's credential number.
**Nothing anywhere in the repo generates a receipt today.** The two greps that
match "invoice" are a settings label ("Billing cycle — how often invoices are
generated") and an integrations description; neither produces anything.

**The data is all there since PR #96.** A Canadian insurance receipt needs the
client, the service dates, the amount paid, the practitioner's name and
registration number, and the clinic's name and address. Every one of those is
now reachable in one query chain:

| Receipt field | Source |
|---|---|
| Client, dates, service, amount | `budget_entries` (0023) — the charge ledger |
| Practitioner | `sessions.employee_id` → `staff` → `employment_records.user_id` (0026) |
| Credential + number | `employee_credentials.credential_number` (0007) |
| Clinic name | `clinics.name` |
| Clinic address | **missing — no address column on `clinics`** |

`apps/client/pages/statement.tsx` is already most of a receipt: it renders the
same ledger with a running balance and prints. A receipt is that, filtered to
one date range, with the practitioner block added and the balance removed.

**Why it isn't built here.** The receipt belongs in `apps/client` (the family
downloads it) or `apps/data`. Both are outside this session's walls and both
had live sessions on them. Generating it from `apps/scheduler`, as asked, is
the weakest of the three options: the scheduler knows the booking but not the
charge, so it would have to re-derive an amount that `budget_entries` already
holds — a second answer to "what was this session billed at".

**What is needed, in order:**

1. A `clinics.address` column (plus the legal/operating name if they differ).
   Nothing else on the receipt is missing.
2. A receipt view or function joining the chain above, so the credential number
   on the receipt is read rather than passed in by a caller who might send the
   wrong one.
3. The screen, in `apps/client`, reusing `statement.tsx`'s print path.

The employee-portal half is done in this branch: `primaryCredential()` and
`credentialLine()` in `lib/hr-store.ts` return the credential in good standing
with the furthest renewal, recorded once and read everywhere. A lapsed
credential is deliberately never returned — presenting a lapsed registration
number on a receipt is worse than presenting none.

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

### 8. `pd_credit_allocations` is the one query with no app-layer filter

Round 2. Every other read in `lib/hr-backend.ts` is scoped by `user_id` or
`clinic_id`. This one is a bare `select("*")` and relies entirely on the RLS
policy from migration `0007`:

```sql
create policy allocations_own_select on pd_credit_allocations for select
  using (exists (select 1 from pd_activities a
                  where a.id = activity_id and a.user_id = auth.uid()));
```

That policy is correct, so this is not a live leak. It is the only place in
the app with no defence in depth, though — if the policy ever regressed,
nothing in the client would stop another employee's CEU allocations arriving.

**Why it isn't filtered:** the table has no `user_id` of its own; it reaches
the user through `activity_id → pd_activities.user_id`. The activities are
fetched in the same `Promise.all`, so their ids aren't available yet to filter
on without adding a round trip.

**The fix I'd want**, left for someone who can verify it against a live
database (this session had no Supabase access — see CLAUDE.md's MCP section):
a PostgREST inner-join filter, which keeps it to one request —

```ts
db.from("pd_credit_allocations")
  .select("*, pd_activities!inner(user_id)")
  .eq("pd_activities.user_id", uid)
```

Not applied blind, because it changes the returned row shape (every row gains a
nested `pd_activities` object) and the mapper below it would need to strip that.
Getting the embed name wrong fails at runtime, not at typecheck, and this
session cannot run the query to confirm the relationship resolves.

### 9. PHI in logs, URLs and error messages

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

## Policies (migration 0058)

- **`hr_policies` has no write path anywhere in this app.** The Policies
  screen reads the table; nothing in apps/employee ever inserts or
  updates a row, so a clinic's policies have to be loaded out of band
  (SQL, or an admin tool that does not exist yet). Migration 0053 adds
  the `body` column the preview needs, and the read path now uses it,
  but until something can write a policy an administrator still cannot
  add one from the product. Flagged rather than built: a policy editor
  is a screen with its own versioning and acknowledgement-reset
  semantics, not a form to bolt onto a read-only page.

- **An embedded document cannot report that it failed to load.** A
  cross-origin iframe that a host refuses to frame - a Google Drive file
  that is not shared "anyone with the link", most commonly - renders as a
  blank rectangle and fires no event this page can observe. The preview
  now always shows a direct link beside the frame rather than trying to
  detect the failure, because the detection is not possible from here.
  The real fix is storing policy documents in Summit's own storage
  instead of linking out, which needs a bucket and signed URLs - the same
  blocker as message attachments.
