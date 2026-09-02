# Blocked / logged items — apps/employee hardening pass

Items that are outside this session's walls (anything in `packages/`, `docs/`
or another app), need a decision this session cannot make, or turned out on
inspection to already be correct. Recorded so none of it is silently dropped.

---

## 2026-09-02 pre-demo audit — READ THIS FIRST

Full audit pass ahead of tomorrow's live demo (real staff, real invites, real
module completions). Everything below the `---` after this section is the
prior hardening pass, re-verified rather than re-done. This section is new.

### CRITICAL — migration `0041` is very likely still not applied to the live database

**Two of the Admin console's five queues — "Time-off requests" and "PD
awaiting verification" — will render empty for every admin/supervisor/
scheduler tomorrow unless a human runs this migration first.** This is not a
code bug; the app code is correct and already merged (PR #132). It is a
migration that was merged to `main` in a broken (base64-corrupted) state, sat
unrunnable for a full day, was only fixed hours before this audit
(`0a2fd4d`), and per its own header has never been applied live:

```
-- NOT YET APPLIED to the live database - the Supabase MCP configured for this
-- project is read-only by design (see CLAUDE.md's "Supabase access for
-- Claude sessions"). A human needs to run this migration.
```

Chain of events, confirmed from `git log`: PR #132 (`ff1c2e0`, correctly)
added `hub_pd_manage_select`/`hub_timeoff_manage_select` as
`0036_hub_pd_timeoff_manage_select.sql` — colliding with
`0036_client_documents.sql`, which had ALSO just been merged as `0036`. A
later rename to `0041` (PR #144) did a plain `git mv`-shaped rename that
corrupted the content into a single base64 line instead of carrying the SQL —
`git show --stat` on that merge shows 33 lines deleted from the old path, 1
line added on the new one. It sat on `main` in that state — unrunnable, a
human pasting it into the SQL editor would see a base64 blob, not a `CREATE
POLICY` — until this session's very first commit (`0a2fd4d`) decoded and
restored it byte-for-byte, verified against `apply.mjs` (all 46 migrations
replay clean against a throwaway Postgres). **That fix restores the file on
`main`. It does not and cannot apply it to the live project** — this session
still has no Supabase write access (read-only MCP; see CLAUDE.md), so this
was never anything but a hand-off to a human, and the base64 corruption is
exactly the kind of thing that could keep getting missed if nobody actually
opens the file.

**What this looks like tomorrow if not applied**: an admin, supervisor, or
scheduler opens the Admin console. "Pending sign-offs" and "Certificates to
issue" work (their policies shipped in migration `0006`). "Time-off requests"
and "PD awaiting verification" render "No pending requests." / "All PD
entries are verified." — even if there are real pending ones — because
`hub_can_manage()`-gated `SELECT` was never granted on those two tables and
RLS returns an empty set, not an error (CLAUDE.md's own named trap, about to
bite in exactly the screen it's already been cited against once this week).
It will look identical to "there's nothing to do," which is the worst
possible failure mode for a live demo where staff are actively generating PD
entries and time-off requests for someone to act on. The Team Directory table
and its `onboardingPercent`/`trainingDue` columns still read from
`hub_task_progress`/`hub_employee_training` (`0006`, live already) so they're
unaffected.

**Action needed before the demo, by a human with the Supabase SQL editor**:
run `supabase/migrations/0041_hub_pd_timeoff_manage_select.sql` against the
live project. It's two `CREATE POLICY ... FOR SELECT` statements, additive,
no data migration, safe to run at any time. Confirm with:
```sql
select policyname from pg_policies
where tablename in ('hub_pd_records','hub_time_off_requests') and cmd = 'select';
```
— expect `hub_pd_own` and `hub_pd_manage_select` for the first table,
`hub_timeoff_own` and `hub_timeoff_manage_select` for the second (the `_own`
policies are migration `0006`, already live; the `_manage_select` ones are
what `0041` adds). If either `_manage_select` policy is missing, the
migration hasn't run.

### New finding — an admin (or anyone `hr.record.read` covers) can approve their own onboarding, PD, time off and certificates

Asked to check whether a *non-admin* could self-issue a certificate or alter
their own credential status. Found the adjacent, unasked case instead:
**`hub_can_manage(subject)`, redefined in migration `0024`, does not exclude
`subject = auth.uid()`.** Its first branch is `auth_can('hr.hub.manage') and
subject.clinic_id = caller's clinic_id` — true for an admin's own id, since
an admin's own profile obviously sits in their own clinic. Verified live
against a scratch PGlite Postgres (fixtures: one clinic, one admin, one
`AWAITING_SIGNOFF` task submitted by that admin for themselves):

```
hub_can_manage(own id) for an admin: true
admin's own AWAITING_SIGNOFF row visible in the clinic-wide pending-signoffs query: 1
admin self-signs-off their own task, rows affected: 1
admin self-issues an onboarding certificate via hub_issue_certificate(): SUCCEEDED
```

So today, working exactly as designed: an admin can sign off their own
onboarding tasks, verify their own PD entries, approve/deny their own
time-off requests, and issue themselves the Module 00 / Phase 1 / Phase 2
onboarding certificates — all through the legitimate admin-console queue
paths, with no independent second approver and nothing in the audit trail to
distinguish it from a normal manager action. (A supervisor generally can't,
since their branch of `hub_can_manage()` requires `subject.supervisor_id =
auth.uid()`, i.e. being your own supervisor — abnormal, not the common case.)

**Not fixed here** — this is exactly a role-boundary / `hub_can_manage()`
change per this session's own walls, and it's a genuine product question, not
an obvious bug: Mount Etna's pilot clinic may have exactly one admin account,
in which case *forbidding* self-approval would leave that admin's own
onboarding tasks permanently stuck with nobody else able to clear them. The
fix, if wanted, is narrower than it sounds — exclude `subject = auth.uid()`
from `hub_can_manage()`'s first two branches specifically (leave the
supervisor branch alone, it's already self-exclusionary in the normal case)
— but that's a `supabase/migrations/` change and a real tradeoff, so it's
logged rather than written. Worth knowing before tomorrow regardless: if the
demo's admin account marks their own onboarding complete and self-approves
it in the same session, that's not a bug being demonstrated, it's this.

### Fixed this session — `hr_audit_log` writes have been failing silently since this table's own code was written

`lib/hr-backend.ts`'s `audit()` (the write path for every "My HR" module
action — credentials saved/removed, PD activity added, goals, recognition
sent, policy opened/acknowledged, scorecard ratings, peer feedback, forum
posts) inserted `{ actor, subject, action, detail: {note, previous, next} }`
into `hr_audit_log`. **That table has no `detail` column** — migration `0007`
gives it `previous_value text, new_value text, reason text, source text`
instead. Confirmed against a scratch PGlite Postgres: the exact insert this
code sent fails with `column "detail" of relation "hr_audit_log" does not
exist`; every write plus its `res.error` was swallowed by
`console.warn("hr audit write failed", ...)`. The read side had the matching
half of the same bug (`a.detail`, a column that isn't there, mapped through
`JSON.stringify(undefined ?? {})` on every row).

Net effect: this module's compliance audit trail — the one thing
`hr_audit_log`'s own immutable-row trigger (`forbid_audit_mutation`, `0007`)
exists to protect — has never actually recorded anything, for as long as
this code has existed. Invisible in the UI because nothing in this app reads
`hr()`'s `.audit` field on screen (only the Admin console's "Recent activity"
table is wired up, and that reads the *other* audit table,
`hub_audit_events`, which has always worked correctly).

Fixed: `audit()` now writes `reason: a.detail, previous_value: a.previous,
new_value: a.next`, and the read-side mapper reads those columns back.
Verified against the same scratch Postgres: the corrected insert succeeds,
`select count(*) from hr_audit_log` goes from 0 to 1. Not a migration, not
RLS, not a role boundary — a column-name mismatch in application code — so
fixed directly per this session's own rules rather than logged.

### Fixed this session — item 8 below (`pd_credit_allocations`) closed

Round 3. The drafted PostgREST inner-join fix from the last two passes is
applied — see the updated entry under "Checked, already correct" below (kept
in its original numbered slot rather than duplicated here) for what was
verified and how.

### Dead-file gut-check: the flagged signature image — worse than before, now removed

Asked to re-check whether the previously-flagged scanned signature at a
public, unauthenticated path (`public/clinical/assets/signature.png` — a real
person's signature, "Adina Yankov., MPEd., BCBA, RBA (Ont.) IBA", used on the
static certificate generator) had gotten worse. It had, in a way not caught
before: **it's now provably unreferenced.** `public/clinical-training.html`
(the page that paints certificates) embeds its signature as an inline base64
`data:` URI in `window.__ASSETS__`, not via this file path — grepped every
served file in `public/` and nothing points at
`clinical/assets/signature.png` any more. So it was sitting at a public URL
serving a real person's signature scan for zero purpose. Deleted, along with
`clinical/assets/megba-logo-card.png` (same check, also unreferenced anywhere
served — `megba-logo-dark.png`/`megba-logo-light.png` in the same folder ARE
referenced by `clinical/training-graphics.html` and were left alone). Both
were pure dead files with no functional risk to removing — the kind of fix
CLAUDE.md's own examples call for directly, not logged.

This doesn't touch the ~4.8 MB multi-tenancy gap itself (the training HTML
pages being Mount-Etna-specific content baked into a shared app) — that's
still open, still a product decision, not re-logged here.

### Stale comments fixed

Three doc comments (`lib/hub-backend.ts` ×2, `app/admin/page.tsx` ×1) still
said "migration `0036`" for the pending-timeoff/PD-verification SELECT
policies after the `0036` → `0041` rename (PR #144). Updated to `0041` so a
future reader chasing the reference doesn't land on the unrelated
`0036_client_documents.sql`. Trivial, fixed directly.

### Verification run for this pass

- `pnpm -r --if-present run typecheck` — clean (`apps/employee`, `apps/data`).
- `pnpm turbo build --filter=@summit/employee` — clean, all 21 routes.
- `node apps/employee/qa.mjs` — **27 passed, 0 failed**.
- `apps/employee/tests/onboarding-certificates.test.mjs` — **SKIP** in this
  sandbox (no esbuild anywhere on disk, exactly the documented gap; `pnpm
  install` at the repo root first, as instructed, did not change that). Per
  CLAUDE.md's own fallback: compiled the actual shipped `lib/hub.ts` (plus its
  real transitive deps — `lib/content.ts`, `lib/hub-backend.ts`,
  `lib/session.ts`, `@summit/session`, `@summit/portals`) with plain `tsc
  --module commonjs`, wired `@summit/session`/`@summit/portals`'s no-build TS
  entry points to a CommonJS-resolvable path, and ran the same seven
  assertions the esbuild suite makes against the real code. **7 passed, 0
  failed.**
- Rendered every screen (Playwright + Chromium, `NEXT_PUBLIC_DEV_PREVIEW=1`,
  no login needed) as the preview admin: Dashboard, Onboarding, Credentials,
  Professional Development, Time Off, Certificates, and all three Admin tabs
  (Queues/Staff & Teams/Backend Settings) — desktop (1280×900) and mobile
  (390×844). **Zero browser console errors, zero uncaught page errors**
  across the whole pass. Confirmed the Admin console's Team Directory table
  genuinely scrolls horizontally on mobile rather than clipping
  (`scrollWidth` 783px vs `clientWidth` 356px, `overflow-x: auto`) — matches
  the pattern already documented and accepted under item 7 below, still
  correct. (The floating black circle visible near the bottom-left corner in
  every screenshot is Next.js's own dev-mode indicator, not app UI — it does
  not exist in a production build.)
- Spot-checked the write-side double-submit/self-action concerns the brief
  named: `edit-teammate`'s Edge Function already refuses
  `target_user_id === callerId` server-side (an admin cannot deactivate or
  edit their own account from the Staff & Teams tab — confirmed in code, not
  just by the UI hiding it). Onboarding task completion goes through
  `upsert(..., onConflict: "user_id,task_key")`, so a double-click is
  idempotent by construction. `signOffTask`/`verifyPd`/`decideTimeOff` all
  gate their `UPDATE` on the row's current status
  (`AWAITING_SIGNOFF`/`verified = false`/`REQUESTED`), so a second click (or a
  stale queue) matches zero rows instead of re-applying — already correct,
  already documented in the code's own comments, not re-tested by clicking
  twice in a browser since the guard is server-side and unconditional either
  way. Did not test the cross-portal refresh-token race live (needs a real,
  near-expiry Supabase session across two portals, not reproducible against
  fixtures) — `proxy.ts` still matches the documented `sessionFreshness()`
  pattern exactly, re-confirmed by re-reading it this session.
- Did not exercise a real `invite-teammate` call (preview mode disables it by
  design — "there is no real account to send one to" — and this session has
  no live Supabase project to send a real one against). Re-read the Edge
  Function instead: the duplicate-profile guard (item logged 2026-09-01,
  `479bbf8`) is unchanged and still runs before `inviteUserByEmail`, still
  normalizes the email (`trim().toLowerCase()`) before both the existing-row
  check and the write, still distinguishes a real pre-existing account from
  the auto-created trigger row by ordering. Holds.

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

### 8. `pd_credit_allocations` is the one query with no app-layer filter — fixed 2026-09-02

Round 3. Rounds 1–2 left this open because nobody could run the drafted
PostgREST inner-join against a live database to confirm the embed actually
resolves. This session had a scratch Postgres (`supabase/tests/`'s existing
PGlite harness — "a real Postgres compiled to WASM," per its own README, not
a mock) and used it:

1. Confirmed `pd_credit_allocations.activity_id → pd_activities.id` is the
   only foreign key between the two tables (`pg_constraint`, `conrelid`/
   `confrelid`), so PostgREST's `pd_activities!inner(user_id)` embed resolves
   without needing a `!fkey`-name hint.
2. Under RLS, as two different clinicians each with their own activity and
   allocation: the join+filter shape returns exactly the same single row the
   existing (correct) RLS policy already scoped the bare `select("*")` to —
   it doesn't accidentally widen or narrow anything.
3. **The actual point of a second layer**: with RLS simulated as fully open
   on both tables, the bare `select("*")` leaks both employees' rows (2), but
   the join+filter shape still returns only the caller's own (1) — proving
   this is real defence in depth, not a no-op.

All four checks passed. Applied: `lib/hr-backend.ts`'s `load()` now queries
`.select("*, pd_activities!inner(user_id)").eq("pd_activities.user_id", uid)`,
and the existing client-side `activityIds` filter beneath it is now commented
as the third, independent layer it actually is (RLS, then this query filter,
then that display filter) rather than sole defence.

**Correction to the prior write-up**: rounds 1–2 said this was "the only
place in the app with no defence in depth" — not quite right even before this
fix. `lib/hr-backend.ts` already filtered `allocs.data` client-side against
`activityIds` (the caller's own `pd_activities` ids, fetched in the same
`Promise.all`) before ever returning it to a screen, and always had, since the
original provisioning commit. That's real protection against a leaked row
ever *rendering*, just not against it ever *arriving in the browser* — which
is the gap the query-level filter above actually closes.

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

**Re-checked 2026-09-02, per this pass's brief, specifically for whether a new
caller now passes something more sensitive through either site.** Both call
sites are unchanged in shape (still log only `res.error`, never the row). The
`lib/hr-backend.ts` one did get materially more likely to actually fire this
session — its insert was silently failing 100% of the time before today's fix
above, so `res.error` was always set and this `console.warn` should have been
firing on every single HR-module action already (it evidently wasn't
noticed, which is its own small data point about how easy this class of bug
is to miss). Now that the insert is fixed to match the real schema, it should
stop firing under normal operation, which lowers the practical exposure of
this site rather than raising it. No new caller passes anything beyond what
was already assessed here.
