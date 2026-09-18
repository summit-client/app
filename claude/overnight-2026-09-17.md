# Overnight 2026-09-17 — 24 fixes + security audit

Branch `claude/overnight-wins-audit-e2yjfq`, cut from `origin/main` at `bc179e7`.
Three accepted fixes per module across eight modules, one commit each, then a
read-only security audit of all eight plus `supabase/migrations/`.

Method: two read-only subagents per module in sequence — an investigator
returning three ranked candidates with file:line, then a verifier that re-read
the cited lines and rejected anything that was a guess, already shipped, or a
product decision. Three candidates were rejected or deferred that way and
replaced by a second investigator pass. Phase 2 ran nine auditors in parallel,
then a single verifier that re-read every P0 and P1; two findings were
downgraded and one was dropped outright.

## FIXES

### scheduler
1. **Paged every read past PostgREST's 1000-row cap** (`pages/index.jsx`). `loadData()` and `refreshBookings()` issued plain unbounded selects, and PostgREST answers with at most 1000 rows without saying it stopped, so past that mark the Sessions tab and its count, the dashboard stat cards, the "Needs attention" engagement leaderboard, the per-client session counts, the sidebar footer count and the Create wizard's conflict pre-check were all silently reading a truncated list. All eight reads plus the `sessions_visible()` refetch now go through `fetchAllRows()`, which pages with `.range()` until a short page arrives, reports a failed page as an error rather than passing off a partial list as complete, and stops loudly at 100k rows; verified with a 13-case harness over a fake builder covering the boundary at exactly 1000, multi-page order and de-duplication, an empty table and a mid-page failure.
2. **Bulk cancel no longer reaches rows hidden by the filter** (`pages/index.jsx`). Nothing clears the selection when a filter changes, so ticking rows, narrowing the Sessions filter and pressing "Cancel (N)" cancelled sessions the user could no longer see. `cancelSelected()` now intersects the selection with the visible rows exactly as `exportICS` a few lines below already did, and does nothing when that leaves an empty set; verified by build and by reading both call sites side by side.
3. **A failed recurring insert is no longer reported as success** (`components/calendar/RescheduleModal.tsx`). The "make this repeat weekly" insert discarded its result, so an RLS refusal or a conflict still produced "Session updated · N future sessions added" while the session had already been stamped with a recurrence_id, leaving a series of one. The insert's error is now checked and surfaced in the modal, distinguishing a slot someone else just took, mirroring the sibling-shift handling directly above; verified by build and by the calendar suite (53 passed, 0 failed).

### web
4. **The refresh retry no longer throws non-production browsers at the live site** (`pages/api/auth/refresh.js`). The bounded retry for a concurrent-redemption race built its URL as a literal `https://summitclient.io/...`, so outside production the browser was sent to a host where its cookies do not exist and the session became unrecoverable instead of retrying. It now builds the URL from `webUrl()`, which returns the same production origin and `localhost:3001` in dev; verified by build and by reading `webUrl()`'s definition.
5. **The magic-link dead end now explains itself** (`pages/auth/callback.jsx`). A user whose profiles row has no role completed sign-in and was then dropped on a bare `/login`, which looks like the link failed and invites a retry into the same dead end. It now redirects with the `?error=` parameter the login page's `readRedirectError` already renders into its `role="alert"` banner, reusing the wording the password path uses for the same state; verified by build and against the login page's existing reader.
6. **Removed the dead "Reviews" nav link** (`components/PublicNav.tsx`, `styles/globals.css`). It pointed at `/#testimonials`, but that section was deliberately removed and no `id="testimonials"` exists anywhere in the app, so it scrolled nowhere in both the desktop and mobile menus. The entry is gone and the now-unused selector was dropped from the grouped `scroll-margin-top` rule without touching the three live anchors it also covers; verified by grepping the whole app for the id and by build.

### data
7. **The clinician sidebar marks the current screen** (`components/portal-chrome.tsx`). Every sidebar link rendered identically, so nothing showed which of Today / My Caseload / Attention / Tasks you were on — the in-app half of issue #160. `PortalNav` is already a client component, so it now reads `usePathname()` and sets `aria-current="page"` plus the active class `@summit/design` has always styled, with `/` matching exactly and every other link covering its own sub-routes; verified by typecheck, build, and by confirming the `.nav-item[aria-current="page"]` rule already exists.
8. **The "Preview data" pill is double-gated** (`app/layout.tsx`). It tested `NEXT_PUBLIC_DEV_PREVIEW` alone while every other preview gate in the app also requires a non-production build, and since a `NEXT_PUBLIC_` var bakes into the client bundle regardless of build mode, a stray flag in production would have labelled real PHI as fake data. The pill now carries the same `NODE_ENV !== "production"` check, written inline because this is a server component and the shared `IS_PREVIEW` export lives in a client-only package; verified by typecheck and build.
9. **Stopped discarding the mastery date** (`lib/facts.ts`). `masteredAt` was built as `p.status === "mastered" ? null : null` — both branches null — so the field the Attention screen's mastery evidence reads was never populated outside preview fixtures. `programs.updated_at` is now selected and used for mastered programs, with a comment recording that it is a row-touch timestamp rather than a true mastery date; verified by typecheck and build. (The companion `hasNextGoalProgrammed` flag is deliberately left alone — see DEFERRED.)

### client
10. **The dashboard follows the child you switched to** (`components/design-b.tsx`). Switching child updated local state and the viewed-child cookie, but Sessions, Skills, Goals, Funding and Recent Updates all come from `getServerSideProps`' single-child queries, so the heading and task list changed while every number underneath still described the previous child. Switching to a specific child now triggers the same `router.replace` refetch `pages/forms` and `pages/messages` already use; verified by build and by confirming `rememberView` writes the cookie synchronously before the refetch.
11. **The funding statement says access is not granted instead of claiming there is no budget** (`pages/statement.tsx`). The page queried `client_budgets` with no `view_billing` check, and that policy gates on exactly that permission, so a guardian without it got an RLS-empty set rendered as "No budget on file yet" — a confident and false statement about the family's money. It now reads `my_family` first and returns the same no-access shape `pages/forms.tsx` uses, keeping the legacy single-child carve-out; verified by build, and it is copy-only, so it cannot widen what anyone can see.
12. **Consent dates are pinned to the clinic's timezone** (`pages/forms.tsx`). The three dates on that page used `new Date(iso).toLocaleDateString()`, formatting in the server's timezone during SSR and the visitor's during hydration, so near a local midnight the two renders disagree on the calendar day for three `timestamptz` columns. All three now use `formatClinicDate`, written in this repo for exactly this and already used by every other date in the portal; verified by build and by grepping the file for any remaining `toLocaleDateString`.

### employee
13. **The MySummitHR sidebar marks the current screen** (`app/layout.tsx`, `components/sidebar-nav.tsx`). Every sidebar link rendered identically, so nothing showed which of Dashboard / Scoreboard / My Team / Payroll you were on — the other half of issue #160. Since reading the pathname requires a client component and `app/layout.tsx` is a Server Component, the nav loop moved verbatim into a small client component that sets `aria-current="page"` plus the active class; verified by typecheck, build and `qa.mjs` (27 passed, 0 failed).
14. **The admin console shows the clinic's activity, not the caller's** (`app/admin/page.tsx`, `lib/hub-backend.ts`, `lib/hub.ts`). "Recent activity" was the last queue on that screen still reading the caller's own hub snapshot, whose audit query filters on `subject = the signed-in user`, so a manager overseeing everyone else saw only their own events and any other actor's name rendered blank. It now loads through a new clinic-wide `HubBackend.listRecentActivity()` relying on migration 0006's `hub_audit_read` rather than a client-side filter, with the same loading/error states as the other five queues, names resolved through `directory()`, and a reload after each queue action; verified by typecheck, build and `qa.mjs`, and it needs no migration.
15. **Audit events are filed against the employee they are about** (`lib/hub.ts`, `lib/hub-backend.ts`, `app/admin/page.tsx`). Every audit insert hardcoded `subject = the caller`, so a manager's sign-off, PD verification or time-off decision was recorded against the manager rather than the employee whose record moved — wrong in that employee's history and invisible to the clinic feed, which keys on `hub_can_manage(subject)`. `audit()` now takes an optional subject id threaded from the three call sites, and the queue rows also supply the row title so the detail text stops degrading to a bare uuid; verified by typecheck, build, `qa.mjs` and the certificate suite (7 passed, 0 failed), and `hub_audit_write` only checks `clinic_id`, so no migration is needed.

### packages/settings
16. **A failed write only rolls back if it is still the current value** (`index.ts`). `setSetting` captured the prior value before awaiting and then restored it unconditionally on failure, so with overlapping writes to one key — a dragged range input fires one per pointer move — a late-failing earlier write could overwrite a newer value that had already saved. The rollback now only fires when the cache still holds the value that call wrote, which is sound because every `SettingValue` is a primitive; verified by typecheck and by building every consuming app.
17. **A failed initial load is no longer permanent** (`index.ts`). `loadLive()` has no catch and `getIdentity()` can reject, so one failed load left `liveLoad` a permanently rejected promise and `live` null: every read silently returned registry defaults for the rest of the session, and each `void initSettings()` call site leaked an unhandled rejection. The failure is now caught, logged, and turned into an empty cache with a `notify()`, and the latch is cleared so a later `refreshIdentity()` + `initSettings()` can genuinely reload; verified by typecheck and by building every consuming app.
18. **The scheduler stops claiming an org write saved when it did not** (`apps/scheduler/pages/index.jsx`). Its Settings panel fired a success toast synchronously beside a bare `void setSetting(...)`, so a non-admin — org settings are admin-only under migration 0012's RLS — saw "updated" while the value rolled back under them and the rejection surfaced unhandled. The local toast is gone, since `setSetting` announces both outcomes itself, and the four org writers here now `.catch()`, matching `apps/data`'s `controls.tsx`; verified by build.

### packages/nav
19. **The scheduler portal has a sign-out control** (`apps/scheduler/pages/_app.tsx`). `AppNav` was mounted without `signOutHref` and the `signOut` fn passed down was consumed by no page, so the portal had no way to sign out at all and a staff member on a shared machine had to close the browser. It now passes `signOutUrl()` exactly as `apps/data` and `apps/employee` do, routing to `apps/web`'s `/api/auth/signout` — the only place allowed to clear the shared cookie; verified by build and by confirming nothing else in the app rendered a sign-out.
20. **The profile avatar waits for a resolved role** (`src/AppNav.tsx`). Callers compute `profileHref` as `profileUrl(role)`, and `profileUrl` falls through to the employee portal for any role it does not recognise, including the `undefined` passed while identity is in flight — so a family user clicking in that window was sent to a portal `ACCESS` does not admit them to. The avatar now requires a non-null role, the same loose-null test the portal pills already use, with the sign-out control's margin following the same condition so the bar does not shift; verified by typecheck and by building all five apps.
21. **Keyboard focus stays with the support panel** (`src/SupportButton.tsx`). Opening the panel unmounts the trigger button, so focus dropped to `<body>` and a keyboard user had to tab from the top of the page to reach the field they had just asked for, with Cancel and Escape leaving focus nowhere. The textarea is now focused on open and the trigger refocused on close, guarded so the first render does not steal focus; verified by typecheck and by building every consuming app.

### packages/design
22. **The hidden drawer checkbox no longer takes a desktop tab stop** (`components.css`, mirrored in `apps/scheduler/styles/globals.css`). `.nav-toggle-input` was only `opacity: 0; pointer-events: none`, which does not remove an element from the tab order, so above 820px — where the whole drawer is `display: none` — every page in `apps/data` and `apps/employee` began with a phantom tab stop focusing nothing visible. It is now `display: none` by default and re-declared inside the 820px block where it is actually the control, which is safe because `:checked ~` combinators and `<label for>` both work on a `display: none` checkbox; verified by building the three affected apps.
23. **The mobile nav hamburger has a visible focus ring** (`components.css`, mirrored in `apps/scheduler/styles/globals.css`). Below 820px the drawer's only control is a `<label>`, which can never take focus, so the global `:focus-visible` ring drew on the invisible checkbox and a keyboard user had no idea where they were. The ring is now forwarded to the visible hamburger via `.nav-toggle-input:focus-visible ~ .mobile-topbar .nav-toggle-btn`, using each stylesheet's own focus colour; verified against the real markup in both layouts to confirm the sibling combinator matches, and by build.
24. **Dropped `apps/data`'s duplicate `.shell` rule** (`apps/data/app/app.css`). It redeclared `.shell` byte-identically to `components.css` and, being imported after it, silently won — the exact drift the shared stylesheet exists to prevent, where the next edit to the shared rule would render nowhere in that app. Removed in favour of the pointer comment `apps/employee` already carries; verified by build, and since the declarations were identical nothing renders differently.

## DEFERRED

- **Scheduler dashboard no-show-rate denominator** — the denominator admits only `completed`/`no_show` and nothing in the app writes `completed`, but the status is schema-valid, set by `supabase/tests/rls.mjs` and consumed by migrations 0031/0056, and the code comment documents the current denominator as deliberate; redefining the metric is a product decision.
- **`hasNextGoalProgrammed` in `apps/data/lib/facts.ts`** — nothing in the schema records that a next goal was programmed, so "has one" needs a definition (name-matching against `goalBankNextOptions`? draft programs? `goal_bank_relations`?). Until it is decided, `detectMasteredWithoutNext()` stays dormant and the Attention tile stays 0 even with the `masteredAt` half fixed.
- **Announcement read-receipts in `apps/client`** — `announcement_reads` has no write path anywhere, so every clinic notice is pinned to the dashboard forever; the insert policy already permits a guardian's own receipt with no migration, but mark-on-mount vs mark-on-click is a product call (mount silently clears an urgent notice a parent scrolled past).
- **The client dashboard's "Everyone" view** — switching to Everyone clears the viewed-child cookie and the server falls back to the first child, so it shows one child's numbers under a family heading. The child→child case is fixed; an actual aggregate family view needs a decision about what each figure means across siblings.
- **Issue #171 (no-show / cancellation billing policy)** — explicitly filed as needing a decision before it is operationalized.
- **Every Phase 2 finding** — Phase 2 fixes nothing by instruction. The two P0s and the edit-teammate P1 are the ones worth reading first.
- **Migration-backed fixes** — none of the 24 accepted fixes needed one, so no migration was written this run.

## AUDIT

Nine auditors (one per module plus `supabase/migrations`), then one verifier that re-read every P0 and P1. P0/P1 rows below all survived that second pass. P2 rows carry their own auditor's VERIFIED mark (they read the lines) but were not re-verified.

### P0

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P0 | apps/scheduler/pages/api/match.ts:102-115 | AI-match route POSTs straight to `api.anthropic.com` with `ANTHROPIC_API_KEY`, bypassing `@summit/clinical-ai`'s `containsPhi` gate and Azure routing entirely | VERIFIED |
| P0 | apps/scheduler/pages/index.jsx:2247 → :2308 → match.ts:88,110 | That prompt embeds `CLIENT: ${selectedClient.name}` and the route forwards the string verbatim, so identifiable client names leave the tenancy to an unapproved processor on every AI match | VERIFIED |

### P1

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P1 | apps/web/pages/api/auth/confirm.js:19-21 | `safeRedirect` blocks `//host` but not `/\host`; browsers normalize the backslash, so an offsite `Location` is emitted after `verifyOtp` has already set the session cookie | VERIFIED |
| P1 | apps/web/lib/supabase-server.ts:16-25 | The shared `.summitclient.io` session cookie is written with no `Secure` flag (and `@supabase/ssr`'s defaults set `httpOnly:false`); no HSTS config exists anywhere in the repo | VERIFIED |
| P1 | packages/settings/index.ts:416-417, 473-495 | `live`/`liveLoad` are module-level and `initSettings()` is latched, so a same-tab user switch leaves the previous user's org/role/user settings readable | VERIFIED |
| P1 | apps/scheduler/pages/_app.tsx:21; apps/client/pages/_app.tsx:47 | Neither app calls `refreshSettings`/`refreshIdentity` anywhere, so that latch is never cleared on an auth change | VERIFIED |
| P1 | packages/session/index.ts:128, 182-192 | The identity promise is module-level and cleared only by `refreshIdentity()`, which no sign-in or sign-out path calls | VERIFIED |
| P1 | apps/data/components/session-provider.tsx:31-42 | `refreshSettings()`/`refreshIdentity()` run only under `reload(true)`, and no consumer ever calls `reload` — the refresh path is unreachable in that app | VERIFIED |
| P1 | packages/clinical-ai/provider.ts:60 | Raw `NEXT_PUBLIC_DEV_PREVIEW` check with no `NODE_ENV` guard: a stray production flag routes every clinical AI task to `MockProvider`, i.e. fabricated clinical output | VERIFIED |
| P1 | apps/scheduler/pages/index.jsx:3032-3057 | Bulk cancel never applies `canManageSession()`, which gates the equivalent per-row button at :3297 — missing app-side authorization on a mutation | VERIFIED |
| P1 | apps/scheduler/pages/index.jsx:3204, 3247 | Selection checkboxes render for colleagues' masked rows, which is what feeds that ungated bulk cancel | VERIFIED |
| P1 | apps/data/app/api/clinical-query/route.ts:39 | Hardcodes `containsPhi: false` for a free-text question that is only trimmed and length-checked, so a name-bearing question takes the non-Azure provider path | VERIFIED |
| P1 | supabase/migrations/0051_announcements_and_notifications.sql:134-145 | The `audience = 'all_families'` branch has no `clinic_id` scope, so a guardian in any tenant can read every clinic's all-families announcements | VERIFIED |
| P1 | supabase/functions/edit-teammate/index.ts:45-86 | `EDIT_INTO_MATRIX` gates only the role being set, never the target's current role, so a scheduler can demote their clinic's admin; the deactivate branch has no target-role check at all | VERIFIED |
| P1 | supabase/migrations/0036_client_documents.sql:85-136 | The `client-documents` bucket's `storage.objects` policies exist only as commented "manual steps" — no migration creates them, so the PHI files themselves have no version-controlled access control | VERIFIED |
| P1 | packages/design/tokens.css:1 | `@import` from `fonts.googleapis.com` on every authenticated PHI page in all five apps: viewer IP/UA to a third party with no DPA, and a hostile response injects CSS into every portal | VERIFIED |

### P2

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P2 | apps/data/app/review/page.tsx:64 | Countersign authority is a client-side check only — **downgraded from P1**: migration 0043's `forbid_unauthorized_countersign()` trigger enforces it server-side. Residual: "returned" is ungated by design, so any staff member can return a colleague's note | VERIFIED |
| P2 | packages/settings/index.ts:497-501 | `refreshSettings()` is a no-op in preview and the localStorage layer keys are never cleared on sign-out — **downgraded from P1**: preview builds only, and it leaks settings layers rather than PHI | VERIFIED |
| P2 | apps/web/lib/supabase-server.ts:16 | `res.setHeader('Set-Cookie', …)` replaces rather than appends; a second `setAll` in one request drops the earlier batch, which can leave a chunked auth cookie uncleared at sign-out | VERIFIED |
| P2 | apps/web/pages/api/auth/signout.js:15 | Session-ending GET with no method, CSRF or Origin check — any third-party page can force-log-out every portal at once | VERIFIED |
| P2 | apps/web/pages/login.tsx:28, 173 | The raw `?error=` query value is rendered verbatim as an official message on the real login page (content spoofing / phishing lure) | VERIFIED |
| P2 | apps/web/pages/api/auth/update-password.js:10 | Only `!password` is checked server-side; the length rule is client-only, and there is no re-authentication and no CSRF token on a password change | VERIFIED |
| P2 | packages/portals/index.ts:83-99 | The redirect allowlist behind `isKnownOrigin` is built from `NEXT_PUBLIC_URL_*` values inlined at build time — a `NEXT_PUBLIC_` variable gating a security control | VERIFIED |
| P2 | apps/web/pages/login.tsx:114 | No app-side rate limiting or lockout on `signInWithPassword`; throttling is entirely Supabase's defaults | VERIFIED |
| P2 | apps/web/lib/authErrors.ts:344 | "An account with that email already exists" — enumeration-positive, inconsistent with the deliberately neutral forgot-password path | VERIFIED |
| P2 | apps/scheduler/pages/admin.tsx:147 | The one read of `sessions` in this portal that does not go through `sessions_visible()`, and it has no clinic scope | VERIFIED |
| P2 | apps/scheduler/pages/admin.tsx:125 vs :553 | `fetchAll()` runs before the admin/scheduler role gate, so an excluded role's browser still issues full-PHI `clients`/`staff`/`sessions` queries | VERIFIED |
| P2 | apps/scheduler/pages/index.jsx:3408 vs :3577 | `?view=settings` is reachable by a `scheduler`; the Sidebar entry is `roles: ["admin"]`, i.e. link-hiding only | VERIFIED |
| P2 | apps/scheduler/pages/index.jsx:327, 341 | The create-wizard preview grid resolves client names with no `sessionPrivacy` call, so a masked colleague session renders nameless instead of "Client (private)" | VERIFIED |
| P2 | apps/scheduler/lib/calendar-feed-tokens.ts:37-39 | A 256-bit bearer feed token is carried in the URL path, so it lands in proxy/CDN access logs; no expiry, revocation only | VERIFIED |
| P2 | apps/scheduler/pages/api/match.ts:38 | Rate limiter is an unbounded in-process `Map` with no eviction, ineffective if the app is ever clustered | VERIFIED |
| P2 | apps/data/app/api/planning/route.ts:41-46 | The commit path inserts `clinical_decisions` with a request-supplied `clientId` before any ownership check; only `clinic_id` is derived | VERIFIED |
| P2 | apps/data/lib/server/retriever.ts:32-33 | `treatment_modifications` select omits `.eq("client_id", clientId)`, pulling clinic-wide rationale text into retrieval and filtering in memory afterwards | VERIFIED |
| P2 | apps/data/lib/data.ts:110; lib/clinical-docs.ts:84; lib/instruments.ts:186 | Full SOAP bodies, ABC incidents, document drafts and assessment answers persisted to `sessionStorage` — PHI at rest in the browser on shared clinic workstations | VERIFIED |
| P2 | apps/data/app/clients/[id]/supervision/page.tsx:197 | Supervision meeting notes about a named client are written only to `sessionStorage`, never to `supervision_notes` — unauditable PHI outside RLS | VERIFIED |
| P2 | apps/data/app/sharing/page.tsx:43, 78, 93 | Raw Postgres/RLS error messages rendered into the UI, leaking policy and constraint internals | VERIFIED |
| P2 | apps/client/pages/api/family/observation.ts:51, 80-87 | Inserts with a request-body `clientId` and no server-side family re-derivation, unlike `messages/start.ts`; not exploitable today because RLS holds | VERIFIED |
| P2 | apps/client/pages/api/forms/withdraw-consent.ts:39-58 | `consentId` from the body drives an UPDATE with no family re-derivation; only `consent_records` RLS stands in the way | VERIFIED |
| P2 | apps/client/pages/statement.tsx:524, 535; pages/forms.tsx:534 | The page gate is family-wide `canForAny(...)` while the query uses the cookie-chosen child, so per-child enforcement rests entirely on RLS | VERIFIED |
| P2 | apps/client/pages/updates.tsx:241; pages/index.tsx:235 | `session_notes` bodies are read for the cookie-chosen child with no app-level `view_clinical_progress` check | VERIFIED |
| P2 | apps/client/pages/api/admin/stop-view-as.ts:6-12 | POST route with no `getUser()` and no method/CSRF guard; impact is nil since it clears only the caller's own cookie | VERIFIED |
| P2 | apps/client/lib/supabase-server.ts:16 | `setAll` replaces rather than appends `Set-Cookie`, so it can clobber a cookie queued earlier in the same response | VERIFIED |
| P2 | supabase/migrations/0022_hub_manage_admits_scheduler.sql:22-28 | `hub_can_manage(subject)` is true when `subject = auth.uid()`, so a scheduler can self-approve their own time off, self-verify their own PD and sign off their own onboarding | VERIFIED |
| P2 | supabase/migrations/0006_employee_hub.sql:282-283 | `hub_audit_write` checks only `clinic_id` — any clinic member can forge audit events under someone else's `actor`/`subject`. 0012 fixed exactly this for `settings_audit` | VERIFIED |
| P2 | supabase/migrations/0007_my_hr_module.sql:421 | Same defect on `hr_audit_log` — arbitrary `actor`/`subject`; a PHIPA audit-integrity gap | VERIFIED |
| P2 | supabase/functions/_shared/auth.ts:94 | `isRateLimited()` fails open on a count error, silently lifting the invite/edit rate limits | VERIFIED |
| P2 | supabase/migrations/0015_scorecard_metrics_rls.sql:30-31 | `scorecard_metrics_read` has no staff/role predicate, so a family account can read the clinic's HR scorecard metric definitions; 0057 fixed the sibling cases but missed this one | VERIFIED |
| P2 | supabase/migrations/0024_action_rbac_and_privacy_boundary.sql:405-406 | `permission_actions_read using (auth.uid() is not null)` — the whole action vocabulary, including the `exposes_phi` flags, is readable by any authenticated caller | VERIFIED |
| P2 | supabase/migrations/0047_households_and_guardians.sql:350-351 | `guardian_permission_kinds_read` has the same unscoped reference-table read | VERIFIED |
| P2 | packages/session/index.ts:183-186 | A rejected identity promise is cached forever, so settings' new retry re-awaits the same rejection without an explicit `refreshIdentity()` | VERIFIED |
| P2 | packages/nav/src/AppNav.tsx:104-105, 112 | With `role == null` the bar still renders a pill and href for `activeKey` regardless of ACCESS admission (link only — the portal's own gate still applies) | VERIFIED |
| P2 | apps/employee/components/portal-bar.tsx:55 | Admin-link roles hardcoded rather than read from the registry, so they must be kept in sync with `AdminAccessGate` by hand | VERIFIED |
| P2 | apps/client (8 pages, e.g. appointments.tsx:493) | Login URL hardcoded as `https://summitclient.io/login` instead of `@summit/portals`' `loginUrl()` | VERIFIED |
| P2 | packages/design/index.ts:102-108 | `applyLogoColors` writes a DB-sourced string straight into `--logo-1/2/3` with no format check; safe only because no consumer uses the var in `background`/`url()` yet | VERIFIED |
| P2 | packages/settings/index.ts:600-648 | `setSetting` upserts with no validation against `def.type`, so a `color` setting is constrained only by the `<input type="color">` widget | VERIFIED |
| P2 | packages/design/index.ts:21 (+ both app layouts) | The inline theme script is injected via `dangerouslySetInnerHTML`, forcing `script-src 'unsafe-inline'` or a nonce the package does not expose; no CSP header is defined anywhere in the repo | VERIFIED |
| P2 | packages/design/components.css:61 | `.nav-icon { opacity: 0.65 }` composites to 2.87:1 light / 3.56:1 dark — not a WCAG failure (aria-hidden, duplicated by its text label) but the one composite under 3:1 | VERIFIED |
| P2 | packages/design/tokens.css:327 | `:focus { outline: none }` with recovery only via `:focus-visible`, so programmatic focus moves can land with no visible ring | VERIFIED |

**Dropped in verification:** the claim that the scheduler's bulk-cancel toast reports success regardless of the write error — line 3056 already reads `showToast(err ? "Cancel failed. Please try again." : …)`. The missing-authorization half of that finding survived and is listed above.

## MIGRATIONS

None added. No accepted fix needed one — every app-code fix was reachable under existing RLS, and the two schema-shaped items (`announcement_reads` write path, the `client-documents` bucket policies) are in DEFERRED and AUDIT respectively.

**Collision check:** `supabase/migrations/` holds 80 files, `0000`–`0080`, no duplicate numbers, one pre-existing gap at `0042`. Next free number is **0081** — note that `0077`–`0080` landed on `main` after the CLAUDE.md text that still calls `0077` free.

## Test results

| Check | Result |
|---|---|
| `pnpm -r --if-present run typecheck` | PASS — `apps/data` and `apps/employee` (the only two packages with a typecheck script), `tsc --noEmit` clean |
| `node apps/employee/qa.mjs` | PASS — 27 passed, 0 failed |
| `apps/employee/tests/onboarding-certificates.test.mjs` | SKIP in the harness (no esbuild in this sandbox) → PASS via the tsc-compiled substitute: 7 passed, 0 failed |
| `apps/scheduler/tests/calendar-utils.test.mjs` | SKIP in the harness (no esbuild in this sandbox) → PASS via the tsc-compiled substitute: 53 passed, 0 failed |
| `fetchAllRows` paging harness (written for this run) | PASS — 13 passed, 0 failed |
| `pnpm turbo build --filter=@summit/web` | PASS |
| `pnpm turbo build --filter=@summit/scheduler` | PASS |
| `pnpm turbo build --filter=@summit/data` | PASS |
| `pnpm turbo build --filter=@summit/client` | PASS |
| `pnpm turbo build --filter=@summit/employee` | PASS |

Two notes on the environment, both pre-existing and confirmed against an unmodified `origin/main` checkout: there is no esbuild anywhere on disk here, so both bundled suites print `SKIP` and exit 0 — exactly as CLAUDE.md's Verification section warns — which is why each was re-run against `tsc --module commonjs` output to get a real pass line; and no app has a `.env.local`, so `@summit/scheduler` cannot build without `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, which were supplied as placeholders. The other four build with no env at all.

## Phase 3 — next 3 per module

**scheduler** — Apply `canManageSession()` to bulk cancel and stop rendering selection checkboxes on masked colleague rows (P1). Route the AI matcher through `@summit/clinical-ai` so no client name reaches Anthropic (P0). Make `pages/admin.tsx` read sessions through `sessions_visible()` and move its `fetchAll()` behind the role gate.

**web** — Reject backslash-authority destinations in `confirm.js`'s `safeRedirect`. Set `Secure` (and reconsider `httpOnly`) explicitly in the server cookie writer, and append rather than replace `Set-Cookie`. Stop rendering the raw `?error=` query value verbatim on the login page.

**data** — Derive `containsPhi` from the actual question in `clinical-query` instead of hardcoding `false`. Stop persisting SOAP bodies, document drafts and supervision notes to `sessionStorage`, and write supervision notes to `supervision_notes`. Decide `hasNextGoalProgrammed` so `detectMasteredWithoutNext()` can fire.

**client** — Re-derive family membership server-side in the `observation` and `withdraw-consent` routes instead of relying on RLS alone. Gate `statement` and `updates` on the viewed child rather than family-wide `canForAny`. Decide when an announcement counts as read, then add the read-receipt write path.

**employee** — Check the target's current role in `edit-teammate` before a demote, and add a target-role check to the deactivate branch. Add `actor = auth.uid()` to `hub_audit_write` and `hr_audit_log`'s insert policies. Exclude `subject = auth.uid()` from `hub_can_manage()` so a scheduler cannot self-approve.

**packages/settings** — Clear the settings cache on sign-in and sign-out by calling `refreshSettings()` from an auth listener in every app. Clear the preview `localStorage` keys on sign-out. Validate a setting's value against its declared `type` before writing.

**packages/nav** — Read the employee admin-link roles from `@summit/portals` instead of hardcoding them in `portal-bar.tsx`. Stop rendering an `activeKey` pill for a role `ACCESS` does not admit. Replace the eight hardcoded login URLs in `apps/client` with `loginUrl()`.

**packages/design** — Self-host the two Google fonts instead of `@import`-ing them from a third party on every PHI page. Constrain or validate tenant colour values before `applyLogoColors` writes them. Expose a nonce for the inline theme script so a CSP can drop `script-src 'unsafe-inline'`.
