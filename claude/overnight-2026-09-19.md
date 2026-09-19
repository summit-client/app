# Overnight 2026-09-19 — the family app on mobile, 7 fixes, 3 security fixes

The primary work was `apps/mobile`. It was a four-screen scaffold this morning;
it is now the beginning of the family app, sharing the web portal's logic rather
than restating it. The three-wins sweep ran after that and is the rest of this
document.

## MOBILE

**A parent signs in and sees their child's next session.** Which child, when,
what service, who is on the care team, and what else is coming up. Multi-child
households get a switcher; one child skips it. It replaced a screen showing
`profiles.role` and `clinic_id` — both null for a parent, because the family
read path keys on `auth.uid()` through `guardian_relationships` and touches
neither column. The one test guardian in production has no `profiles` row at
all, so that screen showed them "null" and "null".

**It joins nothing.** A guardian cannot read `staff` under any policy, and
`locations` and `session_types` need `auth_role()` in
(scheduler|client|clinician), which a parent without a `profiles` row does not
have. An embedded join returns NULL rather than erroring, so the screen would
have quietly claimed sessions have no clinician and no location. Clinician names
come from `my_care_team()`, a security-definer function written for families;
the service name comes from the session row's own `type` column.

**An empty list says which access is missing.** RLS answers a refused read with
an empty set. A parent without `view_appointments` would otherwise be told
"nothing scheduled" about a child with weekly sessions. The screen reads the
permissions `my_family` returns and says which one is absent.

**What was extracted, not rewritten.** `packages/family` now holds the pure half
of `apps/client/lib/family.ts` and all of `lib/clinic-date.ts`, moved verbatim.
`apps/client` re-exports both from their old paths, so no page changed an
import, and `family.test.mjs` — which compiles the shipped `.ts` — passes
unchanged at 29. What needs a browser stayed: `rememberView`/`recallView` still
use `localStorage` and the cookie the server reads.

**What the phone reads, and under which policy.** `my_family` (an
invoker view, so `clients_family_read` filters it), `sessions` (scoped by
`auth_guardian_can(client_id,'view_appointments')`), and `my_care_team()`. No
new policy, no new migration, no service-role anything.

**Deliberately left:** progress, notifications, messages, documents, forms, and
billing — in that order, with billing last because receipts carry a clinician's
credential number and issue #192 says `0029` already picks rates off the wrong
clinic.

## FIXES

**Scheduler — availability saves could delete availability.** Both handlers did
a delete then an insert and checked neither result, so a refused insert wiped
the rows while the grid announced "Availability saved" and closed. Both are
checked now and a failure throws so the grid speaks; the previous rows are
re-inserted. Still two statements, so the restore is best effort, not a
transaction — named in the code, not hidden.

**Client — "No documents yet" to a parent not allowed to see them.**
`client_documents_family_read` is
`auth_guardian_can(client_id,'view_shared_documents')`, so a guardian without it
got an empty set beside an upload box the write policy would refuse. Gated
before the query now, on the child being viewed rather than the family, matching
`statement.tsx`.

**Design — white on a danger button fails AA in dark mode.** `.btn.danger`
hardcoded `#fff`, which measures 2.86:1 on the lightened dark `--danger`. A
`--danger-ink` token carries white in light and a near-black in dark (6.63:1).
The contrast suite missed it because every pair it checked was a token against a
*surface*, never a label against the thing it sits on; that pair is in it now,
132 rather than 124.

**Design — `.nav-icon` composited below 3:1.** 0.65 opacity over the sidebar
measures 2.88:1 in light; 0.72 gives 3.30:1. Dark was already fine at 3.54:1 —
the original claim that both themes failed was wrong.

**Scheduler — the retired third text tone.** Its private token copy still
carried `--color-text-tertiary` at `oklch(63% 0.034 196)`, 3.21:1 on the sidebar
it renders 11px text on. The shared palette collapsed that tone into `--muted`
for failing AA; this copy never got the same collapse.

**Nav — the support suite was not running.** It hunted for esbuild down two
paths relative to the *working directory*, so from the repo root — where
CLAUDE.md's own command list puts you — it printed SKIP and exited 0. Anchored
to the file; 30 passed from anywhere, where before it was a pass it had not
earned. Also dropped `panelRef`, created and bound and never read.

**Employee — issue #190 was stale.** `hub_pd_manage_select` and
`hub_timeoff_manage_select` both exist in production. The issue described a
defect that is not there, and CLAUDE.md pointed at it. Closed.

## SECURITY FIXES

**P1 — the open redirect took a backslash (`apps/web`, fixed).** `safeRedirect`
allowed anything starting with one `/` and rejected only `//`. A browser
normalises `\` to `/`, so `/\evil.example` passed and resolved
protocol-relative — on a response where `verifyOtp` has already set a real
session cookie. Backslashes are normalised before the check now. Moved to
`lib/auth-guards.ts`, where the suite exercises it: 58 passed.

**P2 — a client id in a support email (`packages/nav`, fixed).** The App Router
call sites passed `usePathname()`, the resolved path, so Troubleshoot on a
client's session page prefilled `/clients/4192/sessions/88` into a mailto
addressed to a free-text org setting an admin types. `maskRoute()` replaces
numeric and UUID segments with `:id`, fixed in the shared component so every
caller is covered.

**P1 — revoking a guardian did not revoke them (migration 0092, NOT applied).**
Both family gates carry a legacy `clients.user_id = auth.uid()` branch that
checks no status, no `starts_on`, no `ends_on` — and inside `auth_guardian_can`
ignores the permission argument, returning true for all sixteen. `0047`
backfilled a relationship for every such client and never cleared the column, so
both paths are live and only one can be revoked. Setting a relationship to
REVOKED or SUSPENDED would appear to work and would not. 1 of 119 clients
carries a legacy link today and it is ACTIVE, so nothing is being exploited —
what is broken is the mechanism revocation runs on.

## DEFERRED

- **Migration 0090** — `hub_can_manage()` admits the caller as their own
  subject, so an admin approves their own time off, verifies their own PD and
  signs off their own onboarding. Written, awaiting a run.
- **Migration 0091** — three audit tables accept an insert on the clinic alone,
  so any member can file an event under a colleague's name. Written, awaiting a
  run.
- **Migration 0092** — the revocation gap above. Written, awaiting a run.
- **Edge Function rate limiting fails open** — `isRateLimited()` returns false on
  a query error, disabling the invite and clinic-provisioning limits, and
  `provision-clinic` carries a second copy. Verified, not applied: **Edge
  Functions deploy separately and merging a PR does not ship them.**
- **`apps/data`: WorkforceSection has no role gate**, and **a budget update can
  be re-pointed at another client**. Both verified, neither applied — scope.
- **`apps/web`: no `<title>` on any page but /privacy and /terms.** Verified,
  not applied.
- **`apps/data`: inserts take `client_id` from the URL.** The proposed
  browser-side check was rejected — a caller supplying a foreign id is not
  running your browser code. Real enforcement is a trigger or a server route,
  which is an architecture decision.
- **`packages/settings`: 200 clinic-wide audit rows reach every staff browser.**
  Scoping the query and resolving names change what admins see in change
  history. Needs a decision.

## AUDIT — what remains unfixed

| Sev | Where | Finding | Status |
|---|---|---|---|
| P1 | `supabase/functions/_shared/auth.ts:101` | Rate limiting fails open on a query error; `provision-clinic` has a second copy | VERIFIED |
| P2 | `apps/mobile/src/lib/supabase.ts:41,63` | The AES key is written before the ciphertext; a kill between them forces a re-login. No confidentiality impact | VERIFIED |
| P2 | `apps/mobile/src/lib/supabase.ts:39,50` | AES-CTR with no MAC, so the stored session is malleable. Bounded — the JWT is signature-checked server-side | VERIFIED |
| P2 | `apps/mobile/src/lib/supabase.ts:41` | SecureStore uses the default accessibility, so key and blob ride an encrypted device backup onto another device | VERIFIED |
| P2 | `apps/data` | WorkforceSection ungated; budget update re-pointable | VERIFIED |
| P2 | `apps/data` | Inserts take `client_id` from the URL; no clinic-consistency trigger | VERIFIED |
| P2 | `packages/settings` | Clinic-wide `settings_audit` rows, with actor UUIDs, in every staff browser | VERIFIED |
| P2 | `apps/mobile` | Nothing in CI builds or bundles the app | VERIFIED |

**Verified clean, and worth recording:** a parent cannot reach another family's
child. Every family-facing policy is keyed on `auth_guardian_can` or
`auth_accessible_client_ids()`, never on `clinic_id` alone and never `for all`.
The three helpers are `security definer` with `pg_temp` last and every reference
schema-qualified — not a repeat of the `0009` shadowing bug. `my_family` is an
invoker view. No `console.*`, no service-role key and no secret anywhere in the
mobile source.

**One audit finding was wrong and is not in the table.** It reported
`announcements_family_read` as cross-tenant on the strength of `0083`'s header,
which says NOT APPLIED. Production disagrees — the live policy does scope by
clinic. The header is stale.

## MIGRATIONS

Collision check: 89 existing files, `0000`..`0089`, no duplicates, one
historical gap at `0042`. `0090`–`0092` were free.

- `0090_hub_manage_excludes_self.sql` — `hub_can_manage()` is never true of the
  caller.
- `0091_audit_rows_name_their_own_actor.sql` — three audit tables pin
  `actor = auth.uid()`.
- `0092_revoking_a_guardian_revokes_them.sql` — the legacy client link yields to
  a relationship whenever one exists.

**None applied.** All three are files awaiting a run.

## TEST RESULTS

| Check | Result |
|---|---|
| `pnpm -r --if-present run typecheck` | clean, 22 projects |
| Five web apps (`turbo build`) | 5 successful, 5 total |
| `apps/mobile` `expo export --platform ios` | 3.1 MB Hermes bundle |
| PGlite `apply` | 92/92 migrations |
| `rls` / `behaviour` / `tenancy` | 211 / 69 / 13 |
| `controls` / `app-controls` / `schema_drift` | 11/11 / 9/9 / 6 |
| `apps/employee/qa.mjs` | 27 |
| `onboarding-certificates` / `calendar-utils` | 7 / 62 |
| `apps/web/auth-guards` | 58 |
| `apps/client` family / progress | 29 / 25 |
| `packages/design` generated + contrast | 1 / 132 |
| `packages/family` | 18 |
| `packages/nav` support | 30 |
| `apps/mobile` theme / family-data | 55 / 12 |
| `edit_teammate_authz` / `invite_teammate_guard` | 38 / 9 |

`expo-doctor` and `expo install --check` did not run: they need `api.expo.dev`,
which this sandbox blocks with a 403.

Nothing here tested the app on a device. That is a person with a phone.
