# Mount Etna Employee Hub — Beta 1 (build notes)

**Learn · Grow · Connect.** An internal employee portal: onboarding → training →
professional development → certificates → progress → reporting. Warm, clinical,
modern, human, and extremely easy to navigate. This is a beta/MVP with an
architecture designed to grow into the Mount Etna Employee Learning &
Development Record.

## Where it lives

- In this repo, under a new route group `src/app/(hub)/hub/*` (reuses the Mount
  Etna brand tokens). Marketing site and role portals are untouched.
- Data model: Prisma models prefixed `Hub*` and mapped to `hub_*` tables (see
  `prisma/schema.prisma`), isolated from the marketing schema so they never
  collide.

## Runtime reality (read first)

This is a **database-backed, server-authenticated** app. It needs a **Node
runtime + Postgres** to function (server sessions, DB persistence, server-side
PDF generation). Unlike the static marketing site, it will not run as a static
export.

- **First boot happens on your infra** (this build environment has no Node or
  database, so migrations/tests run on your side):
  ```bash
  npm install
  # set DATABASE_URL, HUB_BETA_PASSWORD, HUB_SESSION_SECRET (see .env.example)
  npx prisma migrate deploy      # or: npx prisma migrate dev
  npx tsx prisma/seed.ts         # seeds locations, courses, onboarding template
  npm run build && npm start
  ```
- Host on a Node platform (Vercel, Netlify Functions, Fly, Railway) with a
  managed Postgres (Neon / Supabase). Set the env vars in the platform, never in
  git.

## Security model (Beta 1)

- **Shared beta password** in `HUB_BETA_PASSWORD` (env, server-side only, never
  in client JS/HTML/git — the actual value is set only in the deploy
  environment, never in this repo). Login validates **both**: the normalized
  email ends
  exactly in `@mountetnachildservices.com` (no `…com.attacker.com` tricks) **and**
  the beta password. Reject other domains with the required message.
- Each employee is an **individual `HubUser`** even though the beta uses a shared
  password. `passwordHash` is reserved for future per-user credentials; no
  password is stored in the DB for the beta.
- **DB-backed sessions** (`hub_auth_sessions`): opaque token in an httpOnly,
  Secure, SameSite=Lax cookie; only its SHA-256 is stored. Revocable, resumable
  across devices.
- **Rate limiting** via `hub_login_attempts` (survives serverless).
- **Roles** `employee` / `admin` enforced **server-side** on every hub API/route.
- Structured for later: Google SSO, per-user passwords, magic links, MFA, RBAC.

## Privacy-by-design

- No banking info, government IDs, passwords in plaintext, or VSC report
  contents. VSC is tracked as **status only** (`NOT_SUBMITTED → APPLIED →
  PENDING → CLEARED → REQUIRES_FOLLOWUP`).
- **Not a clinical EMR** — no identifiable client information. JaneApp / ABADesk
  remain the clinical systems.
- Business rule: an employee is not "ready" for unsupervised in-person client
  work until VSC is **Cleared**; until then, observation runs via approved video
  case studies. Surfaced clearly, without alarming the UI.

## Content sources (authoritative)

- `src/content/hub/onboarding.ts` — the onboarding template, tasks, sections,
  categories, required/optional, sign-off flags, **deadline buckets**, and the
  **real external training URLs** from the 2026 checklist (BrightHR/BrightSafe
  compliance, 7 Autism Internet Modules, observation sample-video playlist). Deadlines
  and hours are taken from the document or left configurable — never guessed.
- `src/content/hub/documents.ts` — "My Documents" + external launch cards. Links
  to the shared **Team Drive** folder; each document can point at a specific
  Drive file once known. The two onboarding checklists are hosted natively at
  `public/hub/docs/*.pdf`.

## Progress calculation

Onboarding % uses **required + applicable** tasks only (optional and
Not-Applicable items excluded): `completed_required / applicable_required`.
"Onboarding complete" is never shown until all required items are satisfied or
waived by an admin.

## Autosave contract (critical)

Every change (check an item, complete training, add notes, log hours, upload
evidence, change status) persists to the DB. UI shows `Saving…` then `Saved ✓`,
debounced; on failure shows "We couldn't save your latest changes. Try again."
and never a false "Saved". Offline shows the offline notice and never falsely
confirms server persistence.

## Phased build plan

- [x] **Phase 1** — inspect stack & sources.
- [x] **Phase 2** — data model (`Hub*` Prisma models) + authoritative onboarding
  content + documents + env config.
- [x] **Phase 3** — auth (strict email-domain + beta password, DB-backed
  sessions, rate limiting, first-login profile) + hub navigation shell / design
  system + section scaffolding. ← current
- [x] **Phase 4** — employee dashboard (onboarding ring, training due, PD hours,
  certificates, continue-where-you-left-off, upcoming) + **time off &
  anniversary**: 10 vacation days (Ontario ESA 2 weeks, → 15 at 5 yrs service) and
  5 sick / mental-health days, reset on the hire-date anniversary; a request flow
  that emails `office@mountetnachildservices.com` (via the email abstraction).
- [x] **Phase 5** — onboarding engine: Week 1/2 tasks grouped by section, five
  statuses, supervisor-sign-off gating (employee marks "Ready for sign-off", not
  self-complete), the VSC gate (self-report to Pending; Cleared is admin-only),
  open-training links, per-task notes, and **autosave** (Saving… / Saved ✓ /
  "we couldn't save" — never a false Saved). Progress uses required+applicable.
- [x] **Phase 6** — training & PD tracking: Training & Development page (open
  external course, mark complete with **attestation** + optional time/cert;
  completing syncs the matching onboarding task); Professional Development
  permanent record (add/list/delete, filters by source/year/verified, total
  hours). Time is manual + labelled honestly (no false "active time").
- [x] **Phase 7** — MEGBA certificates: records + branded printable certificate + My Certificates library + admin issue.
- [x] **Phase 8** — Printable reports (onboarding report + training/PD transcript), Print / Save as PDF.
- [x] **Phase 9** — Admin dashboard: pending-approval queues, team directory, task sign-offs, time-off decisions, PD verification, audit feed.
- [x] **Phase 10** — security / accessibility / responsive / QA audit: verified no IDOR (routes scope to session user; admin role-gated; print/report pages owner-or-admin), fixed WCAG contrast (ember-600 for text on white), added live regions + aria-labels + table scope/captions, http(s)-only URL validation, touch-target and responsive-table fixes. (Follow-up: consider a CSP.)
  before declaring the beta complete.

Each phase is committed separately. Nothing is faked: unconfigured/preview states
are labelled, and the first real run (install/migrate/seed) is on your infra.
