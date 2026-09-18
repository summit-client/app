# Overnight 2026-09-18 — 24 fixes + 6 security fixes + audit

Branch `claude/overnight-wins-audit-6y3lyg`, cut from `origin/main` at `af08599`.
Three accepted wins per module across eight modules, one commit each, then a
read-only security audit of all eight plus `supabase/functions/` and
`supabase/migrations/`, then the confirmed app-code findings fixed.

Method: two read-only subagents per module in sequence — an investigator
returning three ranked candidates with file:line, then a verifier that re-read
the cited lines. Five candidates were rejected that way (one already enforced
in the database by migration 0052, one a deliberate documented tradeoff, one a
documented product decision, two proven to be visual no-ops) and replaced by
second investigator passes. Phase 2 ran nine auditors in parallel, then one
verifier over every P0 and P1: **one P1 claim was downgraded to P3** and is
reported as such below rather than as a fix.

## FIXES

### scheduler

1. **Views were gated by the sidebar's links, not by its role table.**
`validViews` accepted any id off `?view=` for every role, and the only view gate
was a clinician-only exclusion set, so a scheduler typing `/?view=settings` got
the full SettingsView including its Admin tab — whose own comment asserts that
tab is admin-only on the strength of a hidden link. Sidebar now exports `NAV`
and `roleAdmitsView()`, and index.jsx drops an unadmitted view to Dashboard;
the clinician set it replaces was the exact complement of NAV's clinician
entries, so clinician behaviour is unchanged, verified by typecheck and build.

2. **Cancelled sessions counted as booked.** The sidebar footer printed
`bookings.length` under the active calendar's name while every other count in
the portal filters `status === "cancelled"` first, so a clinic that cancels
anything saw a total disagreeing with every other figure on screen. It now
counts the non-cancelled rows and the `bookings` prop is narrowed from
`unknown[]` to the status-bearing shape both callers already pass; typecheck and
build clean.

3. **The admin page's sessions read was unpaged.** It issued a plain
`from('sessions').select('*')`, the one unwindowed sessions read left after
PR #179 paged the rest, and PostgREST answers with at most 1000 rows without
saying it stopped. `fetchAllRows()` moved from pages/index.jsx into
lib/fetch-all-rows.ts so both pages share one copy, and the admin read now pages
through it; index.jsx's behaviour is unchanged and the scheduler builds.

### web

4. **`Set-Cookie` was replaced rather than appended.** lib/supabase-server.ts's
`setAll` used `res.setHeader`, and @supabase/auth-js writes cookies more than
once per request, so a refresh batch followed by sign-out's removal batch lost
the first — and with a chunked auth token that could leave the shared
`.summitclient.io` session valid after sign-out. The merge is now
`mergeSetCookie()` in the new lib/auth-guards.ts, covered by
tests/auth-guards.test.mjs, which compiles the shipped file and exercises the
real export: 46 passed, 0 failed.

5. **The raw `?error=` value was rendered verbatim on the login page.**
`readRedirectError` special-cased `missing_token` and returned everything else
unchanged into the styled alert, so `/login?error=<any+sentence>` displayed
attacker-chosen text as an official Summit message. Every producer now sends a
code (`missing_token`, `link_invalid`, `pending_activation`), the two
app-authored sentences keep their exact wording, raw Supabase strings go to
`console.error`, and the test reads the codes back out of the shipped producers
so a new producer without copy fails.

6. **Sign-out had no method, CSRF or origin check.** A third-party page could
fire the session-ending GET with an `<img src>` and log a clinician out of all
four portals. The route now rejects a request whose Origin or Referer is present
and foreign. **Stated plainly: this is a partial mitigation** — a request with
neither header is still allowed, because our own sign-out is a top-level `<a
href>` navigation, so an attacker setting `referrerpolicy="no-referrer"` still
gets through; the complete fix is a POST with a token, which would break every
portal's sign-out link.

### data

7. **The planning route trusted a body-supplied `clientId`.** `requireStaff()`
derives clinic_id from the session but nothing checked the client agreed, and
the row is stamped with the caller's clinic_id, so `with check (clinic_id =
auth_clinic_id())` passed for any client id including another clinic's. Adds
`requireClientInClinic()` to lib/server/authz.ts, called before any write or
packet build and reporting a foreign id as 404 rather than 403; new
tests/route-guards.test.mjs compiles the shipped authz.ts, exercises the real
export and reads the route to confirm ordering.

8. **Raw database errors were rendered in the sharing screen.**
lib/visibility.ts rethrew every PostgREST failure as `new Error(error.message)`
and the page printed it as `That didn't save. ${e.message}` — policy, table and
constraint names shown to whoever clicked — and the same `instanceof Error`
branch made the role-explaining fallback unreachable for exactly the case it was
written for. Failures now log the real reason and raise a `VisibilityError`
carrying a sentence written for the reader; the one deliberate operator message
in that file still reaches the user unchanged.

9. **A clinical decision reported as committed when the write failed.**
decision-tree and planning both awaited their `clinical_decisions` insert
without destructuring `error` and returned `committed: true` unconditionally,
and both callers ignored the response, so an RLS refusal showed a "Committed"
badge with no row behind it. Both routes now report the real outcome and both
callers bail before marking success; the test checks every
`clinical_decisions` insert captures its result: 48 passed, 0 failed.

### client

10. **Ten server-side redirects hardcoded the production login URL.** They used
`NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login"` while proxy.ts on the
same app used `NEXT_PUBLIC_LOGIN_URL || loginUrl()`, so under `next dev` with
that variable unset the edge guard sent a signed-out visitor to localhost and
these ten pages sent them to production. All ten now call `loginUrl()`;
@summit/portals was already a dependency of every one of them and production
behaviour is unchanged.

11. **The statement page gated family-wide and queried per child.** The gate was
`canForAny(family, "view_billing")` while the query is
`.eq("client_id", viewed.clientId)`, so a guardian holding the permission on one
child with the cookie pointed at a sibling passed the gate and was stopped only
by RLS — which returns an empty set, rendering "No budget on file yet" for a
child who has one. Now gated on the viewed child, with the legacy single-child
carve-out unchanged.

12. **Pending change requests were invisible for siblings.** The appointments
page loads sessions for every accessible child but read
`session_change_requests` with `.eq("client_id", viewed.clientId)`, while the
API stamps each request with the *session's* client_id — so a reschedule filed
against a sibling's session never reached `latestRequestBySession` and the card
offered "Request reschedule" again, inviting a duplicate. It now reads
`.in("client_id", accessibleIds)`; the family query moves ahead of it and the
change-request read runs beside the sessions query, so the page is still two
round trips deep.

### employee

13. **An issued certificate was filed against the admin who issued it.**
`issueOnboardingCertificate` resolves the subject and passes it to the backend
but omitted it from its `audit()` call, unlike the three siblings that act on
other people, so a certificate issued from the clinic-wide queue landed in the
admin's own history and out of reach of the subject's supervisor
(`hub_audit_read` keys on `hub_can_manage(subject)`). Self-issuance is
unchanged; `node qa.mjs` 27 passed, 0 failed.

14. **A time-off decision that changed no rows reported success.**
`decideTimeOff` checked only `res.error`, and a PostgREST update matching nothing
is not an error — which is what happens whenever RLS refuses, and migration 0006
grants an employee SELECT and INSERT on their own requests but no UPDATE. So an
employee cancelling their own request got a success toast and an optimistic
pill that reverted on reload. The update now returns the row it changed and
throws when it changed none, naming both possibilities rather than guessing.

15. **The Admin console's edit dropdown preselected the wrong role.** It was
seeded from `accessLevel`, the three-value display ladder, where hr-backend maps
clinician to "EMPLOYEE" — a value matching no `<option>`, so the browser showed
the first one and the dropdown claimed a clinician was an admin while the pill
beside it read "employee", and Save sent a role edit-teammate rejects. Seeded
from the real role instead (see also security fix 20, which finished this).

### packages/settings

16. **`setSetting` never checked a value against its declared type.** It
confirmed the key existed and that a locked key was written at org level, then
persisted anything — so an API call could store a non-colour in a colour that
goes straight into a CSS custom property, or an off-menu string in a select
whose readers expect one of its options. `settingValueProblem()` lives in the
new dependency-free value-types.ts; clearing an override is still always
allowed and `""` stays valid for a time. The two controls that wrote through on
every keystroke (hex and number) now keep a draft and commit only a complete
value, or the new check would throw on every partial one: 48 passed, 0 failed.

17. **Density and every accessibility preference did nothing in MySummitHR.**
apps/employee's `BrandingEffects` set only the three logo variables, while its
own app.css implements `data-density`, `data-textsize`, `data-line-spacing`,
`data-large-controls`, `data-focus-rings` and `data-reduce-motion` — a repo-wide
grep for those names in that app hits only the CSS. It now sets the same six
attributes apps/data does, minus the `run.tapSize` clause, which is a
data-portal setting.

18. **The hex field ignored the admin-only lock.** Every other control in that
switch takes `disabled`; the hex box did not, so a non-admin could type into it,
the write returned early and the field snapped back with no explanation. Fixed
as part of the control rewrite in 16 rather than as its own commit, because that
rewrite replaced the same input.

### packages/nav

19. **The Admin console's roles were hardcoded in two places.** The bar that
offers the link and the gate that enforces it each held their own copy, with a
comment asking whoever changed one to remember the other, and `ACCESS.employee`
is a different set (it admits `clinician`). @summit/portals now exports
`ADMIN_CONSOLE_ROLES` and `admitsAdminConsole()` and both read it; the gate's
uppercase HubRole half is untouched, and all five apps typecheck.

20. **A whitespace-only name produced an empty avatar.** `initials` was `""`
rather than null, and the render used `??`, which does not fall back on `""` —
so the circle came out with no initials and no person glyph, while the two style
branches above it already treated `""` as "no initials". Coerced where it is
computed so all three checks agree.

21. **The portal bar showed a scrollbar in the scheduler.** AppNav scrolls
horizontally at phone width and hides that scrollbar with `.app-nav-scroll`,
which is defined only in @summit/design's components.css — a file apps/scheduler
deliberately does not import, while its own rule painted a 5px thumb inside the
bar's fixed 51px height. The two rules are copied into that app's globals.css
alongside its other kept-in-step duplicates.

### packages/design

22. **The sidebar slid under the cross-portal bar.** `.sidebar` is
`position: sticky; top: 0`, but AppNav is itself sticky at `top: 0` with
z-index 50 and an opaque background, and the sidebar sets no z-index — so on any
scrollable page the whole brand block and the first nav rows disappeared behind
it. `top: var(--portalnav-h)`, which is what the token's own comment says
everything under the bar must do.

23. **The mobile drawer ran off the bottom of the screen.** The drawer rule sets
`position: fixed` with top and bottom but never resets the inherited
`height: calc(100vh - var(--portalnav-h))`, and an over-constrained fixed box
drops `bottom` — so its lower edge landed at large-viewport `100vh`, behind the
phone's URL bar, putting `.sidebar-foot` out of reach and making the
safe-area padding on the same rule do nothing. `height: auto` inside the media
query; desktop untouched.

24. **The closed drawer kept its links in the tab order.** Below 820px the
sidebar is held off-canvas by `transform` alone, with no visibility, inert or
aria-hidden, so a phone keyboard or screen-reader user walked a full invisible
nav after the hamburger — the same bug class the checkbox rule immediately above
it already documents. Adds `visibility: hidden` with a delay equal to the slide
and `visible` with no delay on open, a companion reduced-motion query because
`transition-duration` does not touch `transition-delay`, and the same three
changes in apps/scheduler's own copy.

## SECURITY FIXES

25. **(P1, confirmed) Four more clinical routes trusted a body `clientId`.**
decision-tree, supervision, session-plan and reports/generate have the identical
hole fix 7 closed in planning: `requireStaff()` derives the clinic, the body
supplies the client, and every write stamps the caller's clinic_id so the RLS
`with check` passes for any client id at all. All four now call
`requireClientInClinic()` immediately after the auth gate; the test no longer
names a route but walks `app/api`, picks out every route that takes a body
clientId and calls requireStaff, and asserts the check exists and precedes each
write — so a route added later without it fails. 48 passed, 0 failed.

26. **(P1, confirmed) A support address could smuggle mailto headers.**
`supportMailto()` percent-encodes the subject and body but interpolated the
address raw, and the address is the one part that comes from the database: all
four portals pass the org-scoped `support.devEmail` setting, free text an admin
types. A stored `help@clinic.test?bcc=someone@elsewhere.test&` injected extra
mailto headers into a message already carrying the current page path and
whatever the person typed, and a bcc is invisible in most compose windows.
`safeSupportAddress()` accepts only a single plain address and otherwise falls
back to the real default inbox; the existing suite gains nine cases: 22 passed,
0 failed.

27. **(P1, confirmed) The Admin console could silently demote a scheduler.**
Fix 15 seeded the role dropdown by mapping `accessLevel` back to an edit role,
and that mapping is lossy the other way: hr-backend's `ACCESS` knows only
admin/supervisor/clinician, so a scheduler, hr_admin or payroll_admin also
displays as EMPLOYEE and mapped back to "clinician". `saveEdit` always sent
`role`, and edit-teammate accepts clinician from an admin, so an admin opening a
scheduler's row to change their supervisor would have demoted them — and
edit-teammate's admin matrix has no hr_admin or payroll_admin, so it could not
be undone there. `Person` now carries the raw `profiles.role`, the select is
seeded from it, and a role this control cannot express is shown as text with
`role` omitted from the request entirely.

28. **(P1, confirmed) The clinical-AI preview flag had no NODE_ENV guard.**
`resolveProvider()` returned MockProvider whenever `NEXT_PUBLIC_DEV_PREVIEW` was
"1", and a `NEXT_PUBLIC_` variable bakes into the bundle regardless of build
mode — so one stray flag in a production env file replaced every clinical model
call with fixtures, with nothing on screen to say so. Now double-gated, like
@summit/session's `IS_PREVIEW`; a server-side `CLINICAL_AI_PROVIDER=mock` still
wins, deliberately.

29. **(P1, confirmed) A free-text clinical question was declared PHI-free.**
app/api/clinical-query passed `containsPhi: false` for a 500-character box that
is only trimmed and length-checked. To be exact about the mechanism:
`containsPhi` is asserted by the caller and nothing validates it —
`resolveProvider` never inspects the payload — so that declaration alone decided
whether the question could leave for a non-Azure provider. Nothing in the route
redacts anything, so it cannot honestly claim the text is PHI-free; now declared
true. **Cost, not absorbed silently:** in an environment without
`CLINICAL_AI_ALLOW_PHI` the question now falls to the offline keyword responder
the route already falls back to instead of reaching a model — a worse answer,
not a silent one — and the refusal reason is logged, since "not allowed for
identifiable questions here" and "the key is missing" previously looked
identical on screen. New tests/provider.test.mjs compiles the shipped provider
and exercises the real routing: 17 passed, 0 failed.

30. **(P2, confirmed — the P1 claim did not survive verification) The password
change endpoint checked almost nothing.** The audit called it a one-request
cross-site account takeover; on reading, it is not — the session cookie is
`SameSite=Lax`, so a cross-site form POST does not carry it. **Said plainly so
nobody re-reads this as a fixed P1.** What remains are two verified P2s and
defence-in-depth: the body must now be JSON, the claimed origin must be ours,
and the password must clear the 8-character floor that lived only in the page,
so a direct call could set a one-character password. Raw Supabase errors are
logged rather than rendered. **Cost:** the page no longer shows Supabase's
specific reason, so "that password is the same as your old one" now reads as
"choose a different one and try again."

## DEFERRED

- **The three ungated rate functions** (`billing_rate_for`, `pay_rate_for`,
  `cost_multiplier_for`, P1, confirmed) — both available fixes change reporting
  behaviour beyond the finding. Migration 0052 set `security_invoker = true` on
  every view in `public`, and 0033's economics view calls two of these, so
  revoking EXECUTE from `authenticated` would blank that view's cost column for
  whoever legitimately queries it, and flipping the functions to SECURITY
  INVOKER would do the same by another route. Which finance users should still
  see aggregate cost is a product call.
- **The `leads` table** (P1, confirmed) — apps/web inserts lead PII with the
  service-role key, and no migration in the repo defines that table at all, so
  whether RLS is even enabled on it cannot be answered from here. Needs the live
  schema, not a guess.
- **The browser client as a second writer of the shared session cookie**
  (P1, confirmed) — apps/web/lib/supabase.ts writes the `Domain=.summitclient.io`
  cookie from `document.cookie`, which cannot be httpOnly by construction, and
  login.tsx's prefill reads it back. The known "set Secure and httpOnly" fix
  cannot be applied without first replacing that prefill. A design change.
- **`invite-teammate`'s duplicate guard filters on `profiles.email`**
  (P1, confirmed) — no tracked migration creates that column, so the guard may
  be matching nothing. `profiles` is a `create table if not exists` baseline
  table; confirm against the live schema before changing either side.
- **Issue #171 (no-show / cancellation billing policy)** — filed as needing a
  decision.
- **family.tsx's delete-then-insert availability save** — migration 0082 makes
  the grid load, but whether an empty grid should erase the scheduler's entries
  or be refused is a product question.
- **Widening `EDIT_ROLES` to scheduler / hr_admin / payroll_admin** —
  edit-teammate's own matrix does not admit them either, so this is a decision
  about the invite/edit vocabulary.
- **Migrations written but NOT applied:** `0081`, `0082`, `0083` — see
  MIGRATIONS below. They are the deliverable for five confirmed findings
  (2 × P0, 3 × P1) whose fix is an RLS or grant change.

## AUDIT

Nine auditors, then one verifier that re-read every P0 and P1. Rows below are
what remains unfixed. Items the verifier confirmed are marked; P2 rows carry
their own auditor's VERIFIED mark (they read the lines) but were not
re-verified.

### P0

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P0 | supabase/migrations/0031:286 | `derive_pending_session_deliveries` — SECURITY DEFINER, no role/clinic gate, no revoke; any authenticated caller names a tenant and writes time_entries, budget_entries and organization_events into it | VERIFIED — **migration 0081 written, awaiting your run** |
| P0 | supabase/migrations/0031:113 | `record_session_delivery` — same, on an enumerable session id, returning another clinic's minutes and charged amount | VERIFIED — **migration 0081 written, awaiting your run** |

### P1

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P1 | 0029:185, :209, :232 | `billing_rate_for` / `pay_rate_for` / `cost_multiplier_for` — SECURITY DEFINER, ungated, never revoked; bypass the payroll and billing read policies | VERIFIED — DEFERRED, see above |
| P1 | 0068:48 | `log_family_access_event` — SECURITY DEFINER, RPC-callable, takes clinic_id/client_id/action/detail from the caller; audit rows can be forged in any clinic | VERIFIED — **migration 0081 written** |
| P1 | 0051:134-145 | `announcements_family_read`'s `all_families` branch has no clinic predicate | VERIFIED — **migration 0083 written** |
| P1 | apps/client/pages/family.tsx:257 + 0076 | Guardians hold insert/update/delete on `client_availability` and no SELECT, so the grid loads empty and the save wipes the scheduler's entries | VERIFIED — **migration 0082 written** |
| P1 | apps/web/lib/supabase.ts:87-113; pages/login.tsx:86 | The browser client is a second writer of the shared domain cookie, so it cannot be httpOnly, and the login prefill depends on that | VERIFIED — DEFERRED |
| P1 | apps/web/pages/api/leads/create.js:3-6,181 | Lead PII written with the service-role key into a table no migration defines | VERIFIED (absence of migration) — DEFERRED |
| P1 | supabase/functions/invite-teammate:117-121 | The duplicate-account guard filters on `profiles.email`, a column no tracked migration creates | VERIFIED — DEFERRED |
| P1 | supabase/migrations/0036:85-136 | The `client-documents` bucket's storage.objects policies exist only as commented manual steps | VERIFIED (carried from PR #179) |
| P1 | packages/design/tokens.css:1 | `@import` from fonts.googleapis.com on every authenticated page in all five apps; a hostile response injects CSS, and there is no CSP anywhere in the repo | VERIFIED (carried) — needs font binaries |
| P1 | supabase/migrations 0080:87-105 | 0080's `staff.user_id` backfill made the clinic-blind pre-history "Staff can read own sessions" policy live rather than dead; guarded only by a write-side trigger | VERIFIED |

### P2

| Severity | file:line | Finding | Status |
|---|---|---|---|
| P2 | supabase/functions/_shared/auth.ts:94 | `isRateLimited()` fails open on a count error — its comment says deliberately | VERIFIED |
| P2 | supabase/functions/provision-clinic:55-63 | A second, uncommented copy of that fail-open, on clinic creation | VERIFIED |
| P2 | 0022:22-28 | `hub_can_manage(subject)` is true when `subject = auth.uid()` — self-approval of own time off, PD and sign-offs | VERIFIED |
| P2 | 0022:23 | That same helper's `auth_role() in ('admin','scheduler')` branch is clinic-blind; contained only because every calling policy ANDs the clinic | VERIFIED |
| P2 | 0006:282-283, 0007:421 | `hub_audit_write` / `hr_audit_log` insert policies check only clinic_id — any member can forge an actor/subject | VERIFIED |
| P2 | 0015:30-31, 0024:405-406, 0047:350-351 | Reference-table reads gated on `auth.uid() is not null` or nothing — HR scorecard metrics, the action vocabulary with its `exposes_phi` flags, guardian permission kinds | VERIFIED |
| P2 | 0072:114 | `calendar_feed_tokens_front_desk_update` pins neither user_id nor the token column | VERIFIED |
| P2 | 0069:148 | `auth_can_see_record()`'s `specific` branch has no clinic or client check; contained by its callers | VERIFIED |
| P2 | 0003:47, 0004:37, 0007:104/257/267, 0023:77, 0038:55 | Seven trigger guards with no `set search_path` at all, referencing tables unqualified | VERIFIED |
| P2 | apps/data/lib/goal-bank.ts:248,:313; lib/data.ts:832,:1068,:1087 | Browser-side inserts take client_id from the URL; the insert policy checks only clinic and staff | VERIFIED |
| P2 | apps/data/lib/server/retriever.ts:32-33, :37-38 | `treatment_modifications` and `integrity_checks` selected with no client_id filter, narrowed in memory | VERIFIED |
| P2 | apps/data/lib/funding.ts:252 | A budget update sends a caller-built row including client_id with only `.eq("id")` — a budget can be re-pointed at another client | VERIFIED |
| P2 | apps/data/components/settings/workforce.tsx:18 | No role gate where every sibling settings section checks for admin; offers the derivation action to any clinician | VERIFIED |
| P2 | apps/data/lib/data.ts:110; clinical-docs.ts:84; instruments.ts:186; clients/[id]/supervision/page.tsx:197; documents/page.tsx:61 | SOAP bodies, ABC incidents, drafts, assessment answers, supervision notes and a consent audit trail persisted to sessionStorage | VERIFIED |
| P2 | apps/client/pages/api/family/observation.ts:51; forms/withdraw-consent.ts:39-58 | Act on a body-supplied id with no server-side family re-derivation | VERIFIED |
| P2 | apps/client/pages/api/messages/start.ts:109 | Re-derives the child but checks membership only, never `message_clinic` for that child | VERIFIED |
| P2 | apps/client/pages/api/calendar/feed-token.ts:59 | GET reads the feed bearer token with no `user_id` filter, unlike POST and DELETE | VERIFIED |
| P2 | apps/client/pages/forms.tsx:534; documents.tsx:447; updates.tsx:239; index.tsx:248; messages.tsx:322 | Family-wide gates over per-child queries, and reads with no app-level permission check | VERIFIED |
| P2 | apps/client/lib/family.ts:156, :177 | `rememberView` is keyed on the household though its comment promises per-user; the viewed-child cookie has no `Secure` | VERIFIED |
| P2 | apps/client/pages/api/admin/stop-view-as.ts | Now method-guarded, still no `getUser()` and no CSRF token | VERIFIED |
| P2 | apps/client/lib/supabase-server.ts:16 | `setAll` still replaces rather than appends `Set-Cookie` — the same defect fixed in apps/web here | VERIFIED |
| P2 | apps/scheduler/pages/admin.tsx:558, :326-329, :126 | Role gate fails open when identity is null; a free-form partial is written with no column allowlist or clinic predicate; `fetchAll()` still runs before the gate | VERIFIED |
| P2 | apps/scheduler/pages/index.jsx:896-897, :986-987 | Availability save is delete-then-insert with neither result checked — the same shape as the family-portal finding | VERIFIED |
| P2 | apps/scheduler CalendarView.tsx:559-562; index.jsx:3306, :297, :311; FilterPanel.tsx:492 | Client names resolved without `visibleClient()`/`sessionPrivacy`; protection is `sessions_visible()` nulling client_id, not the app | VERIFIED |
| P2 | apps/scheduler/pages/api/match.ts:38; lib/calendar-feed-tokens.ts:37-39 | Unbounded in-process rate-limit Map; 256-bit feed tokens in the URL path with no expiry | VERIFIED |
| P2 | apps/web/next.config.ts:3-7 | No `headers()` at all — no CSP, X-Frame-Options or frame-ancestors anywhere in the repo, so /login is framable | VERIFIED |
| P2 | apps/web/pages/api/auth/confirm.js:25,32 | `type` goes from the query string into `verifyOtp` with no allowlist | VERIFIED |
| P2 | apps/web/pages/api/leads/create.js:15,49 | IP-keyed rate-limit Map never pruned | VERIFIED |
| P2 | apps/web/pages/login.tsx:114; lib/authErrors.ts:344 | No app-side sign-in throttling; an enumeration-positive message | VERIFIED |
| P2 | packages/settings/index.ts:439-463, :517-527 | 200 clinic-wide `settings_audit` rows with actor UUIDs pulled into any staff browser; `clearSettings()` does not clear @summit/design's theme keys | VERIFIED |
| P2 | packages/session/index.ts:89-107 | `summit-preview-role` survives sign-out; bounded to preview by the NODE_ENV guard | VERIFIED |
| P2 | packages/portals/index.ts:83-99 | The `isKnownOrigin` allowlist is built from `NEXT_PUBLIC_URL_*` inlined at build time, and it gates both auth-bearing redirects | VERIFIED |
| P2 | packages/clinical-ai/provider.ts:32 | `CLINICAL_AI_PROVIDER` is cast straight to its union with no validation | VERIFIED |
| P2 | packages/nav/src/SupportButton.tsx:73 | The report body embeds the real pathname in apps/data and apps/employee, so a client id can be prefilled into an outbound email | VERIFIED |
| P2 | packages/nav/src/AppNav.tsx:135-149; packages/design/index.ts:21 | Everything is inline `style`, and the theme script is injected via `dangerouslySetInnerHTML`, so a CSP would need both `style-src` and `script-src 'unsafe-inline'` | VERIFIED |
| P2 | packages/design/index.ts:102-108; tokens.css:327; components.css:61 | `applyLogoColors` writes an unvalidated string into a custom property; `:focus { outline: none }`; `.nav-icon` composites to 2.87:1 | VERIFIED |
| P2 | apps/employee/app/documents/page.tsx:16-26 | The Vulnerable Sector Check "upload" stores a filename in localStorage; no file is transmitted, while the copy says it is verified | VERIFIED |
| P2 | packages/settings/index.ts:112 | `BRIGHTHR_TENANT_DEFAULT` is exported from a package client components import, so the tenant id moved server-side in PR #54 ships in the browser bundle anyway | VERIFIED |

**Resolved since the last pass, confirmed by re-reading:** the scheduler's P0
(the AI-match prompt no longer carries a client name, and match.ts now requires
a staff role, pins the model and rejects a prompt containing an identity label,
email or long digit run); `edit-teammate` now checks the target's current role
before the role, rename, supervisor and deactivate branches; `invite-teammate`
now returns 409 for a pre-existing profile; the settings and identity caches are
now cleared on every auth change in all four portals; `IS_PREVIEW` gained its
NODE_ENV guard; the rejected-identity cache is cleared. Migration 0041 exists
and creates both `hub_pd_manage_select` and `hub_timeoff_manage_select` — any
note calling those missing is stale.

**Downgraded in verification:** the update-password CSRF claim (P1 → P3), on the
grounds that the session cookie is SameSite=Lax so a cross-site form POST does
not carry it. The two P2s in the same handler survived and were fixed.

## MIGRATIONS

Three files added. **None has been applied.** Each carries what it does, how to
verify it, and what it deliberately leaves open.

| File | What it does |
|---|---|
| `0081_lock_down_ungated_definer_functions.sql` | Revokes `record_session_delivery` and `log_family_access_event` to service_role (neither has an application caller; 0068's four audit triggers are themselves SECURITY DEFINER, so the audit trail is unaffected), and re-creates `derive_pending_session_deliveries` with 0031's body verbatim plus an admin-and-own-clinic gate, keeping its grant because apps/data calls it over RPC. |
| `0082_guardian_reads_client_availability.sql` | Adds `client_availability_guardian_select`, mirroring 0076's write predicate exactly, so the family portal's grid loads what it is already allowed to overwrite. |
| `0083_scope_all_families_announcements_to_clinic.sql` | Re-creates `announcements_family_read` with a clinic predicate on the `all_families` branch, resolved through the caller's household. |

**Collision check, run against every earlier migration, not from any doc:**
`ls supabase/migrations` yields 83 files numbered `0000`–`0083`. No duplicate
numbers. One gap, at `0042`, which is pre-existing and unchanged by this branch.
Next free number after this PR is `0084`.

**No Edge Function changed in this PR**, so nothing here needs a separate
`supabase functions deploy`. The two `supabase/functions/` findings that remain
(`isRateLimited` failing open in `_shared/auth.ts` and its uncommented copy in
`provision-clinic`) are reported, not fixed.

## Test results

| Check | Result |
|---|---|
| `pnpm -r --if-present run typecheck` | PASS — `apps/data` and `apps/employee`, the only two packages with the script, `tsc --noEmit` clean |
| `node apps/employee/qa.mjs` | PASS — 27 passed, 0 failed |
| `apps/web/tests/auth-guards.test.mjs` (new) | PASS — 46 passed, 0 failed |
| `apps/data/tests/route-guards.test.mjs` (new) | PASS — 48 passed, 0 failed |
| `packages/settings/tests/value-types.test.mjs` (new) | PASS — 48 passed, 0 failed |
| `packages/clinical-ai/tests/provider.test.mjs` (new) | PASS — 17 passed, 0 failed |
| `apps/employee/tests/onboarding-certificates.test.mjs` | SKIP in the harness → PASS via tsc substitute — 7 passed, 0 failed |
| `apps/scheduler/tests/calendar-utils.test.mjs` | SKIP in the harness → PASS via tsc substitute — 53 passed, 0 failed |
| `packages/nav/tests/support.test.mjs` | SKIP in the harness → PASS via tsc substitute — 22 passed, 0 failed |
| `apps/data/tests/visibility.test.mjs` | SKIP in the harness → PASS via tsc substitute — 12 passed, 0 failed |
| `apps/data/tests/messaging.test.mjs` | SKIP in the harness → PASS via tsc substitute — 20 passed, 0 failed |
| `pnpm turbo build` — web, scheduler, data, client, employee | PASS — 5 successful, 5 total |

Five suites print `SKIP` and exit 0 here because there is no esbuild anywhere on
disk in this sandbox, exactly as CLAUDE.md warns. **A skip is not a pass**, so
each was re-run against `tsc --module commonjs` output and the counts above are
from that run. The four new suites need no substitute: they locate TypeScript in
the workspace store rather than requiring esbuild, and each exercises the
shipped file — none restates the rule it is checking, and several read the
shipped source back to confirm the rule is actually wired in.

`@summit/scheduler` cannot build without `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and there is no `.env.local`, so placeholders
were supplied; the other four build with no env at all.

## Next 3 per module

Populates `claude/board.json`'s `next`.

**scheduler** — Gate `pages/admin.tsx`'s role check so it fails closed when
identity is null, and move `fetchAll()` behind it. Check the result of the
availability delete-then-insert at index.jsx:896 so a refused write stops
wiping the grid. Resolve client names in CalendarView's conflict message and the
reschedule header through `visibleClient()` rather than a raw `find()`.

**web** — Reject backslash-authority destinations in `confirm.js`'s
`safeRedirect`. Allowlist the `type` parameter before it reaches `verifyOtp`.
Add a `headers()` block with a CSP and `frame-ancestors`, which nothing in the
repo defines today.

**data** — Give `WorkforceSection` the admin gate its sibling settings sections
have (and which migration 0081 will otherwise turn into a database error).
Add the missing `client_id` filters in `retriever.ts` and stop `funding.ts`
sending a caller-built `client_id` in a budget update. Stop persisting SOAP
bodies, drafts and supervision notes to `sessionStorage`.

**client** — Re-derive family membership server-side in `observation.ts` and
`withdraw-consent.ts`. Gate `forms.tsx` and `documents.tsx` on the viewed child,
as `statement.tsx` now is. Append rather than replace `Set-Cookie` in
`lib/supabase-server.ts`, the same fix this PR made in apps/web.

**employee** — Fail `isRateLimited()` closed, and remove `provision-clinic`'s
uncommented copy of the same fail-open (both are Edge Functions, deployed
separately). Pin `actor = auth.uid()` on `hub_audit_write` and `hr_audit_log`.
Exclude `subject = auth.uid()` from `hub_can_manage()` so a scheduler cannot
self-approve.

**packages/settings** — Stop pulling 200 clinic-wide `settings_audit` rows with
actor UUIDs into every staff browser. Clear @summit/design's theme keys in
`clearSettings()` too. Stop re-exporting `BRIGHTHR_TENANT_DEFAULT` from a
package client components import.

**packages/nav** — Pass the route template rather than the real pathname to
SupportButton in apps/data and apps/employee, so a client id cannot be prefilled
into an outbound email. Move the bar's inline styles into `components.css` so a
CSP need not allow `style-src 'unsafe-inline'`. Validate `support.devEmail` on
the way in, now that it is guarded at the point of use.

**packages/design** — Self-host the two Google fonts so no authenticated PHI page
fetches CSS from a third party. Expose a nonce for the inline theme script.
Raise `.nav-icon`'s composited contrast above 3:1.
