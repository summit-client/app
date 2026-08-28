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
   as before, cross-clinic reads AND writes both correctly blocked. Two
   unrelated things the same audit surfaced but this migration didn't touch:
   `scorecard_metrics` and `hub_certificate_registry` both have `clinic_id`
   but zero RLS policies at all (default-deny for everyone, a functional gap
   rather than a tenant-isolation one).
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
3. ~~**`packages/settings` does not persist.**~~ **FIXED 2026-08-28.** It backs
   onto `org_settings` / `role_settings` / `user_settings` / `settings_audit`
   for real now in live mode (preview still uses localStorage, unchanged).
   The org-scope-setting-doesn't-reach-other-portals problem this described
   is closed: every portal now loads the same rows from the same clinic.
   Freshness is load-time (each portal fetches on load/session start), not a
   live push to a session already open elsewhere — see `decisions.md`.
4. **Portal URLs are encoded twice.** `packages/nav/src/portals.config.ts`
   hardcodes the four production hosts with no environment override, while
   `apps/web/lib/role-redirects.ts` reads `NEXT_PUBLIC_URL_*`. Set
   `NEXT_PUBLIC_URL_EMPLOYEE` and login honours it while the nav bar keeps
   pointing at the hardcoded host. *Note: `@summit/portals` now exists as the
   single source of truth for portal URLs/access (shipped 2026-08-27, PR #49)
   — re-check whether this specific double-encoding still exists against that
   package before treating it as current.*
5. **The portal list is a static array with fixed labels** and no per-org
   visibility, bypassing the settings system that already has a "navigation"
   section for exactly this.
6. **Brand strings are hardcoded** — "MySummitHR", "Summit Clinician", support
   email subjects — rather than read from `org.name`, which already exists in
   the settings registry.
7. **~4.8 MB of Mount Etna material sits in `apps/employee/public`** — MEGBA
   logos, a scanned signature, a 1.2 MB training HTML file, nine locale files —
   plus five hardcoded Google Drive links in `lib/content.ts`. Fine for phase 1,
   this is the block to unpick for a packaged product.
8. **`--logo-1/2/3` are fixed and never re-tinted.** Right for a single brand,
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
