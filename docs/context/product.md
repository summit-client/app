# Product

Who this is for, what is in scope, and where the story runs ahead of the build.
Assembled 2026-08-27. **Verification notes added later the same day** are
marked inline.

## What it is

A multi-tenant clinic operating system for ABA (Applied Behaviour Analysis)
therapy clinics, consolidating scheduling, clinical session documentation,
staff management and family portals into one platform. It replaces a patchwork
of third-party subscriptions: JaneApp, ABA Desk, BrightHR, Wagepoint, Assembly,
Google Workspace, spreadsheets and ad-hoc email.

Anchor client is **Mount Etna Child & Family Services Inc.**, a Canadian
multidisciplinary ABA practice. Canada MVP first; Europe was discussed as a
fast-follow.

## Portal naming — marketing versus code

These diverge deliberately. Roles describe the person, apps describe the
module. Lock the mapping into anything customer-facing.

| Marketing name | App | Role that lands there |
|---|---|---|
| Scheduler | `apps/scheduler` | admin, scheduler |
| Clinician Portal | `apps/data` | clinician, supervisor |
| Employee Portal / "MySummitHR" | `apps/employee` | staff or supervisor, unsettled |
| Family Portal | `apps/client` | client |
| Practitioner Portal | `apps/teacher` | external care team, not built |

`apps/web` is the marketing site plus the central login.

*Verified 2026-08-27: the "once role vocab settles" caveat on Clinician
Portal is resolved — `fix/role-vocabulary` (PR #48) shipped the same day this
file was written, so `supervisor` and `clinician` both land there now, not
conditionally.*

## Scope boundaries

**DECIDED (2026-06-25)** — `apps/teacher` (Practitioner Portal) is parked, out
of MVP scope. It is the highest compliance risk in the product: parent-approved
access, shared treatment information and secure communication for external
third parties (teachers, physicians, speech therapists) touching PHI. That
means a consent and authorization model plus RLS gating, and it is the
furthest-from-built piece. It should not be in anyone's queue and should not be
shown to Mount Etna as a Q4 deliverable.

**Flagged, unresolved** — the Employee Portal claims to replace BrightHR and
Assembly (HR management, time off, CEU tracking, performance reviews). That is
a large HR product to build and maintain. If the pitch is "eliminate
subscriptions" then the platform has to actually cover them, or the clinic
keeps paying for BrightHR anyway and the savings claim weakens.

**Flagged** — the four-portal marketing infographic is aspirational, which is
correct for a sales asset, but the gap between it and a shippable MVP is large.
Decide which portals are genuinely v1 and which are roadmap before it goes to
Mount Etna as a deliverable. Pull vendor logos (Jane, ABA Desk, BrightHR)
before anything public-facing.

## Multi-tenant readiness — what is not ready to sell per-clinic

The stated plan is to package and sell this per clinic. Current debt against
that, most awkward first:

0. ~~**Eight core tables had no clinic boundary at the database level at
   all.**~~ **FIXED 2026-08-28, migration 0013.** `clients`, `staff`,
   `sessions`, `calendars`, `locations`, `session_types`,
   `client_availability` and `staff_availability` predate this repo's
   migration history - unlike every table added since (which all carry
   `clinic_id` + a `clinic_id = auth_clinic_id()`-shaped policy from day
   one), these eight had neither. Any admin or scheduler account had
   unconditional, clinic-wide RLS access to all of them - confirmed live via
   `pg_policies`, not assumed. This was the actual cause of a separate bug
   (the admin "view as client" picker showing an empty list with real
   clients populated - `clients.clinic_id` didn't exist yet, so the query
   failed outright). Every one of these tables now has `clinic_id`,
   backfilled to Mount Etna (the only clinic that existed), and its RLS
   rewritten per-command with the boundary actually checked. Verified
   against a local two-clinic fixture: same-clinic access preserved exactly
   as before, cross-clinic reads AND writes both correctly blocked. This
   migration also left one residual gap unaddressed by design: nothing
   stops a row's own `clinic_id` from disagreeing with the `clinic_id` of
   whatever it references (a session tagged clinic A pointing its
   `client_id` at a clinic B client) - flagged then as "worth doing before a
   second clinic goes live for real," which is now happening; see the
   migration `0016` entry below.
   Two other things the same audit surfaced, re-checked 2026-08-28 rather
   than left as originally recorded: `scorecard_metrics` genuinely had
   `clinic_id` and zero RLS policies (default-deny for everyone, a
   functional gap, not a tenant-isolation one) - **FIXED, migration 0015**,
   see below. `hub_certificate_registry` was a false alarm on re-check: its
   lack of policy is deliberate and correct (migration 0008's own comment:
   "No policy: reached only through the security definer functions below")
   - it's an internal counter table never queried directly, only through
   `hub_next_cert_number()`/`hub_issue_certificate()`, which run as
   `security definer` and don't need RLS to have already let the caller in.
   No fix needed there.
1. ~~**Clinician/supervisor logins had zero database access to `clients` and
   `sessions`, so the clinician portal's caseload list was always empty.**~~
   **FIXED 2026-08-28, migration 0014.** Migration 0013 gave those two
   tables clinic scoping but deliberately preserved their prior access
   exactly (admin/scheduler only, via `auth_is_scheduling_staff()`) since its
   scope was the tenant-boundary retrofit, not a permissions redesign. That
   preservation carried the gap forward: `apps/data`'s `getClients()` /
   `getTodaySessions()` (and `apps/data/lib/server/retriever.ts`'s
   single-client lookup) run under the signed-in user's own RLS context with
   no elevation, and no policy on either table ever named `clinician` or
   `supervisor` - confirmed via `pg_policies`, not assumed. A real clinician
   login got a plain, RLS-filtered empty array back, indistinguishable in the
   UI from "no clients." 0014 adds a clinic-scoped, read-only select policy
   for both tables gated on `auth_is_staff()` (the same admin/supervisor/
   clinician set every other clinical table already grants), matching this
   schema's existing grain rather than inventing a narrower per-clinician
   caseload/assignment concept that doesn't exist anywhere else in the data
   model. If "a clinician sees only their assigned clients" (not their whole
   clinic's) becomes an actual product requirement, it needs its own
   assignment table - a bigger change than this RLS add, and still open.
   Verified against a local two-clinic fixture: clinician/supervisor now read
   their own clinic's `clients`/`sessions` rows, still cannot write to
   either (no insert/update/delete policy was added), and still see nothing
   from a second clinic.
2. ~~**`scorecard_metrics` had RLS enabled and zero policies - default-deny
   for everyone, including the admin meant to define these metrics.**~~
   **FIXED 2026-08-28, migration 0015.** Not an active bug: `apps/employee`
   never queries this table today (metric labels come from a hardcoded list;
   the tables the app does use - `scorecard_cycles`, `scorecard_responses` -
   already had correct policies from `0007`). Closed anyway before it became
   the next "empty caseload"-shaped bug report: a clinic-scoped read policy
   (plus `clinic_id is null` for shared/system-default metrics, matching
   `credential_rule_versions`'s existing pattern in the same file) and an
   admin-only write policy, no delete - the same shape every sibling table in
   `0007`'s "Ecosystem Tracker" section already got except this one. Verified
   against a local fixture: a clinician now reads both a global and their own
   clinic's metric, cannot write one, and a second clinic's admin can read
   the global metric but not Etna's clinic-specific one.
3. ~~**No cross-table `clinic_id` consistency check on the eight legacy
   scheduler tables.**~~ **FIXED 2026-08-28, migration 0016.** Flagged but
   deliberately left out of `0013` to keep that migration reviewable. The
   actual hole: `0013`'s insert policies only check that a row's *own*
   `clinic_id` matches the writer's clinic - they say nothing about what a
   `client_id`/`employee_id`/`calendar_id` on that row actually points at,
   and those are plain guessable bigints. Confirmed exploitable locally
   before this fix: a second clinic's admin could insert a `sessions` row
   correctly tagged with their own `clinic_id` that referenced clinic one's
   `client_id` or `employee_id` by guessed id, and RLS alone allowed it.
   `0016` adds a `before insert or update` trigger on `sessions`,
   `client_availability` and `staff_availability` that looks up each
   reference's real `clinic_id` and refuses the write on any mismatch
   (including when the caller can't even see the referenced row under RLS -
   that fails closed too, correctly). Verified against a local two-clinic
   fixture: all four cross-clinic reference attempts blocked, legitimate
   same-clinic writes unaffected.
4. ~~**No way to create a staff/admin account or a new clinic without manual
   dashboard + SQL.**~~ **FIXED 2026-08-28** - three Supabase Edge Functions
   (`supabase/functions/`, the first in this repo, and the first use of the
   service-role key anywhere): `invite-teammate` (admin invites any role,
   scheduler invites `client`/`clinician`, into their own clinic only, no
   invite rights for supervisor), `edit-teammate` (role/supervisor change,
   deactivate via the auth admin API - banning, not a new `profiles.active`
   column, so every existing `auth_role()`/`auth_is_staff()` call site stays
   correct with zero changes elsewhere), and `provision-clinic` (a brand-new
   clinic + its first admin, gated on a new `platform_operators` table since
   no `profiles.role` value has, or should have, cross-clinic authority - no
   UI, a runbook step, see `environments.md`). `profiles`' RLS is untouched -
   still no UPDATE policy, still self-insert-as-client-only on INSERT; every
   privileged write goes through a service-role client instead, exactly
   matching `hub_certificate_registry`'s established "no policy, reached only
   through the service-role/security-definer path" shape. Whoever's invited
   completes their account through `apps/web`'s existing `/auth/callback`
   `type === 'invite'` handling, untouched - that path already worked, only
   the send side was missing. Verified: local RLS test
   (`supabase/tests/provisioning_rls.sql`) confirms the two new tables grant
   nothing via RLS; `apps/employee`/`apps/scheduler` typecheck and build
   clean with the new UI wired in. The Edge Functions themselves couldn't be
   executed in that sandbox (no Deno runtime reachable), so they shipped
   reviewed-by-hand only - and live testing against the real project (same
   day) found two real bugs neither review nor the local RLS test could have
   caught:
   - `profiles.email` is `NOT NULL` (the column predates this repo's
     migration history, like several other tables this session) and neither
     function set it - fixed, both now pull it from the invite response.
     While in there, also set `full_name` (nullable, so this wasn't a crash,
     but every invite would have shown up "Unnamed" in the directory) and
     wired a name field through both invite UIs.
   - This project signs access tokens asymmetrically (ES256). The edge
     gateway's own `verify_jwt` check doesn't handle that and rejected every
     call with `UNAUTHORIZED_ASYMMETRIC_JWT` before the function code ever
     ran. Fixed by setting `verify_jwt = false` on all three functions -
     not a lost security check: `getUser()` inside each function already
     verifies the caller against the auth server directly (same pattern
     every `proxy.ts` uses), which works regardless of signing algorithm
     and was always the real check; `verify_jwt = true` was only ever a
     redundant gateway-level one, and it happened to be the one incompatible
     with this project's JWT mode.
   Continued live testing after that fix surfaced one more real, previously
   undocumented finding: a database trigger creates a default `profiles`
   row (`role='client', clinic_id=null`) the instant a new `auth.users` row
   is created - including via the Admin API (`inviteUserByEmail`), not just
   self-service signup. Confirmed by timestamp: the colliding row's
   `created_at` matched the failing request to the second. Neither function
   knew this trigger existed (it isn't in any migration - like `profiles`
   itself, it predates this repo's migration history), so their plain
   `insert` into `profiles` always lost that race and hit `profiles_pkey`.
   Both now `upsert` on `id` instead, overwriting the trigger's default row
   with the real role/clinic/supervisor. `invite-teammate`'s `client` branch
   needed no such fix - the trigger's default shape (`role='client',
   clinic_id=null`) already matches a self-signed-up client's profile
   exactly, so nothing further was ever needed there beyond linking the
   `clients` record.
   **Confirmed working end-to-end 2026-08-28**, by a human, not just a `200`
   response: `provision-clinic` created a real clinic and admin profile, the
   invite email arrived, `/auth/callback`'s `type === 'invite'` handling and
   `/update-password` worked unmodified, and the new admin landed in the
   scheduler with correct role-based access to all four portals (including
   the client-selector view apps/client shows an admin). This is the one
   piece of the whole provisioning feature that genuinely could not be
   verified any other way than a live run.
5. ~~**`packages/settings` does not persist.**~~ **FIXED 2026-08-28.** It backs
   onto `org_settings` / `role_settings` / `user_settings` / `settings_audit`
   for real now in live mode (preview still uses localStorage, unchanged).
   The org-scope-setting-doesn't-reach-other-portals problem this described
   is closed: every portal now loads the same rows from the same clinic.
   Freshness is load-time (each portal fetches on load/session start), not a
   live push to a session already open elsewhere — see `decisions.md`.
6. ~~**Portal URLs are encoded twice.**~~ **CONFIRMED FIXED 2026-08-28** (was
   flagged here as needing a re-check against `@summit/portals`, done now).
   `packages/nav/src/portals.config.ts` is a two-line re-export of
   `@summit/portals`'s `PORTALS`/`portalsFor`, and `apps/web/lib/role-redirects.ts`
   builds `ROLE_REDIRECTS` from that same package's `APP_ROLES`/`homeUrlFor` -
   both read one registry, no independent copy of a URL or a role map left in
   either file. Confirmed by reading both files directly, not inferred from
   the PR #49 changelog note.
   ~~One related but distinct duplication remained, out of this item's
   original scope: every portal's `proxy.ts` hardcoded its own
   `PUBLIC_ORIGIN`/`LOGIN_URL`/`REFRESH_URL`.~~ **FIXED 2026-08-28.**
   `@summit/portals` gained `webUrl()`/`loginUrl()`/`refreshUrl()` (apps/web
   isn't a `PortalKey` - it's the sign-in hub every portal bounces to, not
   one of the four a signed-in user moves between - so these needed their
   own export, `NEXT_PUBLIC_URL_WEB`-overridable same as the four portal
   URLs). All four `proxy.ts` files now read `urlFor()`/`loginUrl()`/
   `refreshUrl()` instead of a fifth hardcoded copy of each value.
   `apps/client`'s pre-existing `NEXT_PUBLIC_LOGIN_URL` override (decided in
   PR #32, a full `/login` URL, not an origin) was kept as its own outermost
   override rather than folded into `NEXT_PUBLIC_URL_WEB` - the two have
   never meant the same thing and no other portal has ever set it.
   `apps/employee` was missing `@summit/portals` as a declared dependency
   (it only reached it transitively through `@summit/nav`'s re-export,
   which resolved for React imports but not for `tsc`) - added directly,
   matching the other three portals. Verified: `apps/data` and
   `apps/employee` build clean end-to-end including the `Proxy (Middleware)`
   bundle; `apps/scheduler`/`apps/client`/`apps/web` compile and typecheck
   clean but fail later at page-data collection on missing Supabase env
   vars in this environment - confirmed pre-existing and unrelated by
   reproducing the identical failure with the change stashed out.
7. **The portal list is a static array with fixed labels** and no per-org
   visibility, bypassing the settings system that already has a "navigation"
   section for exactly this.
8. **Brand strings are hardcoded** — "MySummitHR", "Summit Clinician", support
   email subjects — rather than read from `org.name`, which already exists in
   the settings registry.
9. **~4.8 MB of Mount Etna material sits in `apps/employee/public`** — MEGBA
   logos, a scanned signature, a 1.2 MB training HTML file, nine locale files —
   plus five hardcoded Google Drive links in `lib/content.ts`. Fine for phase 1,
   this is the block to unpick for a packaged product.
10. **`--logo-1/2/3` are fixed and never re-tinted.** Right for a single brand,
   but a tenant cannot have their own logo colours while everything around the
   logo re-tints.

## Commercial model — OPEN, two versions in circulation

**Version A, the capstone portfolio site** (`final-capstone-nu.vercel.app`,
separate Vercel infrastructure, University of Denver team: Derek, Karen,
Collin). Build CA$1,875,880 across five phases, maintenance CA$337,658/yr at an
18% placeholder, confirmed retired subscriptions CA$16,603/yr, net annual
position −CA$321,055. Cost avoidance can never pay for the platform, so the
business case rests on commercialization at ~105 tenants at CA$299/practice/
month, breakeven around Dec 2032.

**Version B, the later model** reviewed 2026-08-19. Tiered at CA$499 / 899 /
1399 with a blended ARPU of 774, breakeven at 43 tenants on one card and 48 on
another. The CA$199 tier from the older model was argued to be dead.

These are not reconciled. Both are live artifacts. Which one Mount Etna sees is
a decision that has not been recorded.

**PROPOSED, not confirmed shipped** — model two parallel columns, market
replacement value versus founder-led actual cost. The reasoning Yanko accepted:
CA$1.47M of dev labour assumes 5 FTE for 15.5 months, which is not his cost
structure given how much he has built solo with AI assistance. Keep the
CA$1.88M as replacement value for the Mount Etna deck and for any future
acquirer conversation, but stop treating it as a forward budget. Compliance,
legal, security attestation and insurance do not compress — see
`compliance.md`. If build labour collapses and compliance holds, breakeven
likely falls to something like 15–25 tenants rather than 43–48, which is a
materially better conversation.

## Model assumptions that are soft and load-bearing

Flagged repeatedly and worth not forgetting:

- **The 18% maintenance placeholder** is the largest single lever in the model,
  about CA$225,000 of swing, roughly 23× the next lever, and nobody has
  confirmed it. The validator tool that "validates" it defaults to a validated
  state because it compares placeholders to themselves.
- **The admin labour figure** closes the cost-avoidance gap from 20× to 3.5×
  and is the least verified number on the site.
- **Churn is absent entirely** from a multi-year payback chart.
- **Run-rate cost is modelled as fixed** at any tenant count, which is not
  realistic for PHI-bearing multi-tenant software.
- **Only 2 of 8 subscription line items are confirmed** against the accounting
  export (JaneApp CA$541/mo, ABA Desk CA$292/mo). The other six are estimates.
- Separate hard dollars from estimated dollars everywhere they appear together.

## The four decisions requested from Mount Etna

From the capstone work, still outstanding as far as project history shows:

1. Validate the 18% maintenance assumption (HIGH).
2. Set a pricing tier or tenant target (HIGH) — commercialization *is* the
   business case.
3. Name owners for systems, policies and risks (HIGH). All seven systems name
   roles, not people; SYS-007 has no technical owner at all.
4. Itemize the five unconfirmed subscriptions (LOW).

## Product defects currently visible to users

- ~~**The client status pill is hardcoded to "confirmed."**~~ **FIXED
  2026-08-27, PR #50.** Every session on the family-facing portal used to
  render in the green confirmed pill regardless of actual status. It now
  maps `cancelled`/`completed`/`confirmed` (`sessions.status`, lowercased) to
  distinct colours using the existing design tokens.
- ~~**A wrong-role user reaches the full clinician portal and sees blank
  screens**~~ **FIXED 2026-08-27, PR #49.** `apps/data` previously gated only
  on "a user exists"; it now runs `gate(identity, "clinician")` and shows
  `explainProblem()`'s message instead of an RLS-emptied shell, matching how
  `apps/employee` already handled the identical case.
- ~~**The nav bar shows all four portals to everyone**~~ **FIXED 2026-08-27,
  PR #49.** `AppNav` now takes the viewer's role and renders from
  `@summit/portals`' registry, so the family portal no longer advertises the
  clinician/employee portals to parents.

## Scheduler calendar v2 — feedback backlog (2026-08-29)

Yanko's feedback on PR #74 (the real-dates calendar rebuild), triaged into four
buckets so it doesn't get lost or re-litigated piecemeal. Read this before
touching the scheduler calendar tab again.

**Bugs — fix outright, no design question involved:**

1. View-mode pill order: "Full week" should sit before "Month".
2. Settings: selecting Saturday as a work day doesn't make it appear in the
   "Work week" view — that button currently hardcodes Mon–Fri instead of
   reading `calendar.workDays`.
3. The filter dropdown only closes by clicking the Filter button again — it
   needs to close on any outside click.
4. The calendar has a double vertical scrollbar (the page scrolls, and the
   grid inside it also scrolls). It should fit the viewport with no scroll of
   its own, scaled per breakpoint — check the breakpoint scheme already
   established for the mobile nav drawer (see `CLAUDE.md`'s "Mobile nav
   pattern") before inventing a new one; there were reportedly four device
   tiers from that work, not the two (desktop/mobile) this pass assumed.
5. Drag-to-reschedule cannot cross day columns. Root cause found: `TimeGrid`'s
   `DayColumn` keeps the dragged session in a component-local `ref`, so a drop
   on a *different* day column's own instance never sees it. Needs a shared
   source of truth (the HTML5 `dataTransfer` payload, or lifting drag state up
   to `CalendarView`) instead of a per-column ref.
6. A cell showing 2+ stacked sessions (the density collapse) can't be dragged
   at all today — only the single-session, unstacked case is reschedulable by
   drag.
7. Click-to-create shipped differently from what was agreed: the approved plan
   called for hooking into the existing Create wizard, pre-filled. What
   actually shipped is a separate, self-contained quick-create modal — a scope
   substitution made silently mid-build instead of being flagged as a
   decision point. Needs to be redone as the originally-agreed pre-filled hop
   into `CreateView`.

**Feature work — clear spec, no open design question:**

8. Filter panel redesign: Locations and Session Types become hover-opening
   pill submenus (not the current always-expanded multi-select block);
   Clinicians and Clients become individual dropdowns with an
   alphabetical-by-last-name list, a search field, and an "All" item at the
   top. "Clear all" needs to stay reachable from every menu.
9. Recurrence (repeat, plus end-by-date or end-by-occurrence-count) needs to
   be selectable everywhere a session is created or rescheduled — the
   calendar's quick-create, drag-to-reschedule, and the future
   reschedule-with-mini-calendar flow — not just the original Create wizard.
10. The drag-to-reschedule snap increment should come from a setting ("every
    N minutes"), not the current fixed 15-minute snap — and that same setting
    should govern how finely session blocks can be resized/positioned. (See
    item 19 below — this may need to be per-session-type, not one global
    number.)
11. A visual drop indicator while dragging: highlight the hour marker and
    activate minute ticks at the controlling increment, so the scheduler sees
    exactly where a drop will land instead of guessing. Likely a **personal**
    (per-user) setting rather than org-level — to be confirmed alongside item
    19.
12. Clicking an existing session needs a "Reschedule" action opening a
    mini-calendar showing the client's and clinician's availability, plus
    dropdowns to change clinician/location/session type on that booking.
13. Both the mini-calendar and the main calendar need a visual availability
    indicator while rescheduling/dragging, bounded by the org's working hours
    from Settings.
14. Session Types tab: add "gap before" / "gap after" fields per type.
15. The gap from item 14 should produce a warning (never a hard block), and
    only when the encroaching session shares the same clinician *or* the same
    client as the gap's owner — concurrent sessions across different
    clinicians/clients are fine and should never warn.
16. Add Break, Lunch, and Meeting as session types.

**Needs a design conversation before any implementation — do not build ahead
of this:**

17. **Bringing back "Calendars" as draft vs. active**, replacing the
    term/quarter-pill concept dropped in PR #74: a draft calendar that gets
    confirmed into an active one, rather than the old always-live quarter
    blocks. Yanko explicitly asked to discuss this before any implementation.
18. **Conflict-resolution suggestions, and how "fancy" they need to be.** When
    a drag or create hits a conflict, offer: (a) another slot for the same
    clinician later that week, (b) another slot the same day with a different
    clinician, or (c) crediting the session against another one. Hard
    constraints already stated: never suggest a different location (a
    clinician doesn't move across locations mid-suggestion); if the clinician
    has to change, the client's day cannot also change — e.g. never offer
    "Wed with Billy" as a substitute for "Mon with Sarah," only a
    same-day/different-clinician substitution is valid. "Credit toward
    another session" is not a defined mechanic anywhere in this schema yet
    and needs scoping before it can be designed against.
19. **Time-grid granularity as a system, not one setting.** Increments (drag
    snap, block resizing, gap enforcement, on both the main grid and the
    future mini-calendar) may need to key off each session type's own
    duration rather than a single global number — e.g. a 63-minute type would
    presumably force per-minute granularity. Yanko wants this designed with
    multi-tenancy in mind (different clinics will want different defaults —
    15 minutes proposed as the fallback, some may want 30, 10, or per-minute)
    before items 10/11/13 above are built against a single assumed number.

**Filed for the roadmap, not for action now:**

20. Each session type will eventually carry an internal invoice rate
    alongside the existing client-facing cost, feeding a future payroll
    module: billable vs. invoiced hours, net revenue, and an exportable file
    for payroll processing (no fintech integration — just producing the
    data). Flagged now so the session/session-type data model is built with
    this in mind, not because it's being built yet.

## Known operational quirks that affect real users

- **Microsoft SafeLinks consumes Supabase one-time tokens.** Institutional
  email (Mohawk College and similar) breaks auth invites. Use personal
  addresses or implement a two-step redirect.
- **The `handle_new_user` trigger is unreliable.** A missing `profiles` row
  looks exactly like a broken auth guard. Backfill manually and confirm role
  and `location_id` before inviting anyone.
- **A blank portal is almost never an auth bug.** It is a null `clinic_id` or a
  role outside `auth_is_staff()`.

## Related but separate

The capstone portfolio site at `final-capstone-nu.vercel.app` is separate
infrastructure and unrelated to this repo. Its content — the financial model,
the ERM framework with 10 strategic risks, and the 17-register compliance
database — is context for the commercial conversation, not for the codebase.
Karen's Gap Analysis is a raster PDF that could not be cleanly extracted and is
offered as a download rather than rebuilt.
