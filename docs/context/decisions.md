# Decisions

**This file tracks decisions, not tasks.** Work items — defects, features,
anything with a done state — are GitHub issues. Put a thing in one place and
link from the other; a status tag here that duplicates an issue's state will
go stale, and did: the `invite-teammate` guard sat tagged OPEN in this file
for weeks after it shipped, and a session reading it would have rebuilt a
guard that already existed.

What belongs here is what issues are bad at: *why* something was chosen, what
was rejected and on what grounds, and what is genuinely still undecided.
**Close an entry when the decision is made, not when the code lands** — and if
an entry is OPEN because nobody has built it rather than because nobody has
decided, it is an issue, not a decision.

**Write a decision down the session it is made.** When the account owner
settles something mid-conversation, it is binding from that moment and this
file is the only place it survives. An unrecorded decision gets re-proposed by
the next session, which wastes their time and reads as not having listened.

Status key:

- **DECIDED** — Yanko stated it, or executed it. Binding.
- **PROPOSED** — recommended in a session and reacted to positively, but never
  confirmed as shipped. Do not treat as binding.
- **OPEN** — genuinely undecided. Not "decided but unbuilt" — that is an issue.
- **CLOSED** — was OPEN, now settled; kept with the reasoning intact, since
  the point of this file is not re-litigating it.

Assembled 2026-08-27 from project chat history and the review docs under
`claude/`. Dates are the date of the conversation or the commit, not the date
of this file. **Verification notes added later the same day** are marked
inline — this file was already stale within hours of being written, which is
itself worth remembering about any status claim in it: cross-check against
`git log origin/main` and the PR list before trusting it.

---

## Architecture and platform

**DECIDED (2026-05-19)** — Single Turborepo + pnpm monorepo under a GitHub
org, with CODEOWNERS path-based access, rather than one repo per portal. The
first recommendation was separate repos; that was reversed once the amount of
shared code (design, i18n, observability, AI gateway) became clear. Executed.

**DECIDED (2026-05-25)** — App renames: `apps/clinician` → `apps/data`,
`apps/family` → `apps/client`. The rationale was that roles describe the
person and apps describe the module, so the role name `clinician` and the app
name `data` are deliberately different. Marketing names still use the old
words; see `product.md`.

**DECIDED (2026-05-25)** — Centralized login at `summitclient.io/login` with
one session cookie scoped to `.summitclient.io`, giving cross-subdomain SSO,
rather than a login page per portal.

**DECIDED (2026-08-14, PR #32)** — Cookie domain is conditional on
`NODE_ENV === 'production'`, and the login redirect is `NEXT_PUBLIC_LOGIN_URL`
rather than a hardcoded production URL. This came out of a real failure: a
`.summitclient.io` cookie is never sent to `localhost`, so local dev logged in
against production and the guard correctly saw nobody. Yanko explicitly
authorized both changes.

**DECIDED (implemented in migrations 0001–0005)** — Shared multi-tenant
database with `clinic_id` and RLS for isolation, not a database per clinic.
The cost analysis behind it showed a 5–7× delta for isolated environments.

**REJECTED in practice** — Clerk for auth. It was recommended in May 2026 for
MFA, SSO and session audit logs, with a caveat to check Canadian data
processing. Supabase Auth was built on instead. No record of an explicit
rejection, so treat "we use Supabase Auth" as the fact and the Clerk
recommendation as superseded.

**DECIDED — was OPEN, resolved 2026-08-27.** Role vocabulary. Two incompatible
sets existed:

- `apps/scheduler/lib/useUser.ts` — `admin | scheduler | staff | client`
- migration `0001` + `auth_role()` + `apps/employee/lib/session.ts` —
  `admin | supervisor | clinician | scheduler | client`

`staff` existed only in the first, `supervisor` and `clinician` only in the
second, and `role-redirects.ts` mixed them: it sent `staff` to the employee
portal (a role the DB does not recognise and the hub rejects) and had no entry
for `supervisor` at all. Branch `fix/role-vocabulary` (`9554f20`) retired
`staff` and pointed `supervisor` and `clinician` at the clinician portal.
**Verified 2026-08-27: merged as PR #48, same day.** The database vocabulary
(`admin | supervisor | clinician | scheduler | client`) is now the only one in
the code. If any live `profiles.role` row still reads `staff`, that still
needs a human decision on which of `supervisor`/`clinician` it becomes — the
merge doesn't touch existing data:
`select role, count(*) from profiles group by role;`

**DECIDED (2026-08-26, agreed with Yanko)** — Work sequence, on the stated
constraint of "correct long-term fix or nothing, no work we roll back a PR
later":

1. `fix/design-pass`
2. `fix/role-vocabulary`
3. Lift `apps/employee/lib/session.ts` into a shared `@summit/session` package
4. Settings persistence, after 3 and not before

The ordering rationale matters: both the clinician-portal role gate and
role-filtering the nav bar need the same missing thing, the viewer's identity
and role available to shared code. Building settings persistence first would
create a third implementation of identity resolution that step 3 then
rewrites. **Verified 2026-08-27: steps 1–3 shipped.** `fix/design-pass` merged
as PR #47, `fix/role-vocabulary` as PR #48. `@summit/session` and a companion
`@summit/portals` registry package now exist and are wired into
`apps/scheduler`, `apps/data`, `apps/client` and `apps/employee` (PR #49) —
the nav bar now filters portals by the viewer's role instead of showing all
four to everyone, and `apps/data` gained the role gate it previously lacked.
**Step 4 shipped 2026-08-28.** `@summit/settings` now backs onto `org_settings`
/ `role_settings` / `user_settings` / `settings_audit` in live mode via
`@summit/session`'s identity, keeping localStorage only for preview. Two
adjacent bugs found and fixed in the same pass: `org_settings`/`role_settings`
/`user_settings`' write policies were `for all` (this schema's own rule says
never — it silently includes DELETE), and `settings_audit_write` never
checked `actor = auth.uid()`, so any staff member could forge an audit row
claiming to be someone else. Both fixed in migration `0012`, verified against
a local Postgres replay (`supabase/tests/settings_rls.sql`). Scoped to
`apps/data` and `apps/employee` — the only two consumers. Settings freshness
is load-time, not real-time push, a deliberate v1 call.

~~**OPEN** — Invitations and account provisioning.~~ **DECIDED and BUILT
2026-08-28.** Settled exactly as the recommendation on the table proposed: a
platform capability beside auth, not the employee portal's admin tab. Three
Supabase Edge Functions (`supabase/functions/invite-teammate`,
`edit-teammate`, `provision-clinic` - the first Edge Functions in this repo,
and the first use of the service-role key anywhere) do every privileged
write; `profiles` still has no UPDATE policy and its INSERT policy still
only permits a self-inserted `role='client'` row, unchanged.

Two capabilities, plus a third decided alongside them:
- **In-clinic invites** — admin invites anyone into their own clinic;
  scheduler invites a client or clinician into their own clinic (matches
  their existing day-to-day: they already create `clients` records for
  scheduling). Supervisor gets zero invite rights in v1.
- **New-clinic onboarding** — a brand-new `platform_operators` table (no
  policy, service-role only) is the only place cross-clinic authority
  exists; deliberately not a `profiles.role` value, since no existing role
  should have it. No UI - it's rare and the highest-consequence action in
  the feature, so it's a runbook step (`docs/context/environments.md`) until
  there's a second real paying clinic to justify building one.
- **Edit/deactivate** an existing teammate (role, supervisor reassignment,
  ban via the auth admin API rather than a new `profiles.active` column -
  see `product.md` for why) - added so a wrong invite or an offboarding
  doesn't fall back to manual SQL either, the same gap this whole feature
  closes.

Nothing new needed at `apps/web/pages/auth/callback.jsx` - it already
handled Supabase's native `type === 'invite'` redirect end to end before
this work started. See `product.md`'s multi-tenant-readiness list for the
authorization-matrix detail and what was verified versus what a live
Deno-less sandbox couldn't execute.

**Confirmed working end-to-end 2026-08-28** by an actual human run, after
two real bugs surfaced by live testing that neither code review nor the
local RLS test could have caught: `profiles.email` is `NOT NULL` and
neither function set it (fixed), and a database trigger creates a default
`profiles` row on every new `auth.users` insert - including via the Admin
API - which a plain `insert` always lost the race against (fixed by
switching to `upsert` on `id`). Also disabled edge-gateway JWT verification
(`verify_jwt`), which rejected this project's asymmetric (ES256) tokens
before either function's own `auth.getUser()` check - the real one - ever
ran. A real clinic, a real admin invite, and a real sign-in with correct
role-based portal access all confirmed live.

**OPEN (since 2026-05-16)** — `session_data` JSONB schema for the 8 ABA data
collection methods (DTT, NET, Frequency, Duration, Interval, ABC, Task
Analysis, Yes/No/Inc). The proposal was a locked shared envelope
(`method`, `version`, `recorded_at`, `staff_id`) with method-specific fields
nested under `data`, plus server-side JSON Schema validation via `ajv`. A
32-question clinical questionnaire went to Sarah for validation. No record in
project history of the schema being locked or the questionnaire being
answered. This was called the most technically consequential open decision and
a blocker for Clinician Portal build.

**OPEN (raised 2026-09-14, scheduler feature batch, PR #170)** — whether to
migrate the scheduler's core tables (`sessions`, `clients`, `staff`,
`calendars`, `locations`, `session_types`, `client_availability`,
`staff_availability`) onto migration `0024`'s `auth_can()` action-based
permission system, replacing their current hardcoded role-name checks
(`auth_role() = 'admin'`, `auth_is_staff()`, `auth_is_scheduling_staff()`).

About 15 migrations since `0024` (payroll, timesheets, family messaging,
forms/consents, supervision, the lesson bank) already gate on `auth_can()` —
new tables have used it from the start, exactly as `0024`'s header says they
should. The scheduler's own tables never have: they predate this repo's
migration history and have their own separate layered history of fixes
already (`0013`, `0014`, `0046`).

The actual gap this would close: today there is no way to express "this
person schedules but does not read clinical notes" — a receptionist role —
without making them a `clinician`, which is wrong. `auth_can()` would let a
clinic (or a specific person, via `user_permission_grants`) differ from a
role's default bundle of actions without touching a single RLS policy.

Not done as a side effect of PR #170's feature work, deliberately: `0024`'s
own header is explicit that this kind of sweep happens table by table, never
in bulk, specifically because a mistake here means a tenant silently loses
access to their own data — real, standalone work with its own PR and its own
verification pass, not something that should ride in on an unrelated batch.
Needs a decision on *when*, not *whether*.

~~**OPEN (raised 2026-09-14)**~~ **DECIDED (2026-09-19, account owner) — a
signed session note is what marks a session complete, and signing alone
releases billing.** In their words: "completed session notes are what mark a
session as complete. Sessions can be cancelled and marked no show, but notes
on a session are the final and true confirmation", and "Signing alone releases
billing. That may change in the future but for now it's the right decision."

So completion is an explicit human act and writing the note *is* that act —
no separate button. Deriving it from the clock was rejected: it would have had
the system assert a session happened on a record that later bills a family,
which is the same shape as the self-verified credential `0086` closed.

Built as migration `0088` — a trigger on `session_notes`, because every
consumer already reads `sessions.status` and a view would break `0031`.
Countersigning is a supervision control over the note's content (`0043`), not
a second opinion on whether the session occurred, and not every note gets one,
so gating on it would leave a senior clinician's sessions never completing.
The 47 past sessions stay `scheduled`; the account owner confirmed they are
dummy entries.

Revisit this when "signing alone releases billing" stops being true — the
countersignature gate is the natural next step and would split completion from
billability.

The original question, kept because the reasoning is what dates:

Automatic is cheap and asserts a session happened that nobody confirmed.
Explicit is truthful and is one more thing to remember, so sessions nobody
marks stay invisible forever. Decide alongside the no-show/cancellation
billing policy below and issue #171, since all three turn on what "this
session occurred" formally means — and per the account owner that may need to
differ per clinic.

The defect this causes — the Dashboard's "No-show rate" reading a degenerate
100%/0% because nothing ever sets `sessions.status = 'completed'` — is **issue
#196**, which is blocked on this. Track the code there; the choice stays
here.

**RESOLVED (verified live 2026-09-16)** — PR #170's body also flagged that
`apps/scheduler/pages/admin.tsx` reads/writes `client.email`, `client.sessions`
and `client.availability`, none of which appear in this repo's tracked
migration history, and asked for a live check. Yanko ran
`select column_name from information_schema.columns where table_name = 'clients'`
against the live project: `email` and `sessions` are both real, live columns
on `clients` — same shape as the `clinic_id`/`'supervisor'`-enum gaps
elsewhere in this doc, undocumented because `clients` predates this repo's
migration history, not a bug. `availability` is not a column on `clients` at
all, and was never expected to be one — `admin.tsx`'s `.availability` is a
plain JS field populated from the separate, already-`clinic_id`-scoped
`client_availability`/`staff_availability` tables (`.insert()`/`.delete()`
against those tables, not a `clients` column read). No action needed on any
of the three.

---

## 2026-08-30 — first clinician dry-run prep

**DECIDED and BUILT** — Client-portal "reports" means signed/countersigned
`session_notes` (SOAP notes) plus `programs` (goals), not the separate
`clinical_reports` table — clarified mid-session after an initial pass
scoped to the wrong table. Migration `0020` adds client-scoped RLS
(`auth_client_row_id()`, hardened per the `0009` pattern from the start —
schema-qualified, `pg_temp` named last); a `session_notes` row is visible to
the family only once `status in ('signed', 'countersigned')`, never
`'draft'`. Shipped as PR #83 alongside a real bug fix: the "view as a
client" picker's buttons had invisible text (unstyled `<button>`/`<select>`
don't reliably inherit `color`, and nothing declared `color-scheme`, so
Safari applied its own dark-aware default against an explicit white
background).

**DECIDED and BUILT** — The live `user_role` Postgres enum was missing
`'supervisor'` entirely (members were `admin, scheduler, clinician, client,
staff` only), discovered when seeding client-portal mock data threw
`22P02: invalid input value for enum`. This predates the repo's tracked
migration history, same situation as the `clients` table. Every piece of
code that assumed `'supervisor'` existed (`INVITE_MATRIX`,
`auth_is_staff()`, `profiles.supervisor_id`) was already correct — the enum
itself was the only thing missing. Fixed live via migration `0021`
(`alter type user_role add value if not exists 'supervisor'`, run as its
own standalone statement — Postgres forbids using a new enum value in the
same transaction that adds it). PR #85, merged.

**DECIDED and BUILT** — Edge Function CORS. `invite-teammate`,
`edit-teammate`, `provision-clinic` had no `OPTIONS`/`Access-Control-*`
handling at all, so a browser's CORS preflight got a bare 405 with no CORS
headers and was blocked before the real request ever reached the function —
surfacing client-side as supabase-js's generic `FunctionsFetchError`
("Failed to send a request to the Edge Function"), discovered live when a
real clinician invite attempt through `apps/employee`'s Staff & Teams tab
failed with exactly that message during dry-run prep. Fixed via a shared
`handlePreflight()`/`CORS_HEADERS` in `supabase/functions/_shared/auth.ts`.
PR #86, merged. See `environments.md` for how this was actually deployed
without the Supabase CLI.

**DECIDED and BUILT** — `@summit/session`'s `IS_PREVIEW` export gained the
same `NODE_ENV !== "production"` gate every portal's `proxy.ts` already
applied independently to its own `PREVIEW_BYPASS`. It had never had one —
apps/data/lib/data.ts had independently reimplemented the correct
double-gate for its own local `IS_PREVIEW`, which is what exposed that the
shared one, which `hub.ts`/`@summit/settings`/apps/data's preview-data path
all actually read, did not have it. A stray `NEXT_PUBLIC_DEV_PREVIEW=1` in
a production env file — a `NEXT_PUBLIC_` var bakes into the client bundle
regardless of build mode — would silently run those consumers against
`localStorage`/fixtures scoped to the browser, not the signed-in user,
underneath a real authenticated session. Not confirmed as the actual live
cause in this case (the production env files were checked and didn't have
the flag set), but fixed regardless since the gap itself was real and
match the guard every other consumer of the flag already had. PR #87,
merged.

**DECIDED and BUILT** — Cross-portal sign-out. `apps/data` and
`apps/employee`'s shared nav bar (`@summit/nav`'s `AppNav`) had no sign-out
control at all. Added one, but routed through a new
`apps/web/pages/api/auth/signout.js` rather than each portal calling
`supabase.auth.signOut()` on its own client — the same reasoning as the
refresh-token race fix: only `apps/web`'s client writes the shared
`.summitclient.io`-domain cookie, so only its server client can actually
clear it. `apps/scheduler` and `apps/client`'s pre-existing sign-out buttons
had this same latent gap (looked like it worked locally, left the shared
cookie valid) and were repointed at the same endpoint. PR #88, merged.

~~**OPEN, discovered live 2026-08-30**~~ **CLOSED — shipped in `479bbf8`,
tested since 2026-09-19.** `invite-teammate` had no guard against inviting an
email that already had an `auth.users`/`profiles` row. Supabase's
`inviteUserByEmail` resolves an existing email to that same user id rather
than erroring, and the function's `upsert` then overwrote that person's
`profiles` row with the new role/clinic/supervisor. Surfaced when an admin
invited their own email as a test "clinician" and their account was silently
role-flipped in place.

The guard queries `profiles` by email before the invite is sent and returns
409, naming whether the account is in this clinic or another — the second
case is where the one-login-per-clinic decision is enforced. It must stay
ahead of `inviteUserByEmail` in the file, for the reason
`supabase/tests/invite_teammate_guard.mjs` asserts.

**This entry said OPEN until 2026-09-19, months after the fix shipped**, which
is the failure this file exists to prevent: a session reading it would have
rebuilt a guard that was already there. Status tags here are only worth
anything if they are closed when the work closes.

**DECIDED** — Grant Claude Code sessions read-only access to the live
Supabase project via `@supabase/mcp-server-supabase` (`.mcp.json`,
`--read-only`, scoped to this one project via `--project-ref`), so schema/
data questions and migration verification no longer require every query to
be handed over as SQL for Yanko to paste into the dashboard's SQL editor by
hand. `SUPABASE_ACCESS_TOKEN` lives only in each Claude Code environment's
own env var config, never committed. `--read-only` is the actual
enforcement boundary, not the token (which is account-wide — Supabase has
no finer-grained PAT scoping today). No real PHI exists in the system yet
(see `compliance.md`), so this doesn't touch the BAA gate as written today —
revisit this grant's scope explicitly once real client data is ever loaded.

---

## 2026-08-31 — the Admin console starts working for a clinic, not just its caller

**SHIPPED** — Four fixes, PRs #91–#94.

The "Pending sign-offs" queue only ever showed the signed-in person's own
onboarding tasks, never the clinic's, in a console whose whole purpose is
managing everyone else's. RLS already supported the clinic-wide read
(`hub_progress_manage_select`, migration `0006`); nothing queried it. Found
live when a clinician's ready-for-sign-off task never appeared for the admin.
`listPendingSignoffs()` now queries clinic-wide and relies on RLS.
`signOffTask()` had a compounding bug on the write side — it gated on the
caller's own in-memory snapshot, so signing off somebody else's task matched
no local row and silently did nothing.

Also: the platform-default unbranded invite email replaced
(`supabase/templates/invite.html`); `describeFunctionError()` added so an
invite or edit rejection says why instead of "Edge Function returned a non-2xx
status code"; and schedulers given access to `apps/employee`, scoped to the
Admin console only, with migration `0022` widening `hub_can_manage()` so the
queues return data rather than rendering empty.

---

## 2026-09-16 — one invite flow, and a shared availability grid

**SHIPPED** — PR #175, migrations `0075` and `0076`, both applied live.

`apps/employee`'s Admin console is now the only place to invite anyone, staff
or client; the duplicate panel in `apps/scheduler`'s admin page is deleted
outright. `invite-teammate` provisions the full row set for a new account in
one call — `staff` + `staff_availability` + `employment_records` for
staff-shaped roles, `clients` + `client_availability` for an inline-created
client.

`0075` added `staff.user_id`, which had never existed despite `0013`'s comment
assuming it did. `0076` added the `staff` contact and emergency-contact
columns with a guard trigger restricting self-edit to those fields only, plus
own-row write RLS on both availability tables.

`@summit/availability` replaced three independent copies of the drag-to-select
grid, wired to the org's real `calendar.gridIncrementMinutes` instead of a
hardcoded 30. `apps/web/pages/profile.tsx` deleted — two identity-only stubs
nothing linked to once `profileUrl()` pointed every role at its real profile.

---

## 2026-09-18 — the clinician/client privacy boundary moves into the database

**SHIPPED** — PR #178, migrations `0077`–`0080`, applied live in that order.

Admin and supervisor keep a clinic-wide read of `sessions`; a clinician's
direct read is their own rows; colleague occupancy comes from
`public.sessions_visible()`, a security-definer function that NULLs
`client_id`/`home_address` and sets `client_masked` on rows the caller may not
associate. **Apps read `sessions_visible()`, write `sessions`.**

`0078` made clientless Break/Lunch/Meeting blocks insertable (`0016`'s trigger
had no null guard on `client_id`). `0079` added the scoreboard tables. `0080`
restored `0014`'s `clients` grant and backfilled `staff.user_id` from
`employment_records` — 14 of 17 rows linked, the 3 skipped being test accounts
with no employment record.

**Three premises taken from this repo's migration history were false against
the deployed schema**, all caught by introspecting before applying, and this
is why the standing rule is to read `pg_policies` first:

1. Migration `0014` was never applied, so the clinic-wide clinician read that
   `0077` was written to *narrow* never existed — on this database `0077` is a
   grant. Applying `0014` now would silently undo it.
2. `staff.user_id` was null for every pre-existing staff member, so everything
   keyed on it was dead: `staff_self_select`, `0076`'s availability writes and
   contact self-edit, and the pre-history "Staff can read own sessions". A
   clinician and a supervisor each read zero sessions and zero clients, while
   `0046` let a clinician *write* their own.
3. `sessions.created_at` does not exist, though `0000` declares it. `0077`
   listed it on that authority and would have failed outright.

---

## 2026-09-18/19 — ids over names, credentials somebody else confirms, and tenancy in the database

**SHIPPED** — PRs #183–#188, migrations `0085`–`0087`, all applied live.

**#183** — Admin console role access, guardian permissions, and a deactivation
that doesn't orphan a team.

**#184, migration `0085`** — A session points at its session type instead of
copying its name. `sessions.session_type_id` added and backfilled (2085 of
2085 rows resolved), with `type` kept in agreement both ways: a trigger
derives it from the pointer on every session write, and a second carries a
`session_types` rename out to the sessions holding the old label. Deliberately
not finished: `sessions.type` still exists, and `0029`/`0031` still join on
the name — correct only while that rename trigger lives.

**#185, migration `0086`** — A credential's standing is something somebody
else asserts, and it reaches a bill. `credentials_own_update` let a person set
their own `status`, and `0034`'s receipt view puts a `GOOD_STANDING`
credential number on a client's receipt under that clinician's name — so a
self-entered, self-approved number was the clinic's assertion of who delivered
the service, checked by nothing. The self-write stays; a trigger forces
`PENDING` on entry or amendment and refuses the move to `GOOD_STANDING` when
the actor is the holder, for every role including admin. Gated on a new
`hr.credential.verify` action, seeded to admin, supervisor and `hr_admin` —
not `hr.record.write`, which `0024` grants to admin and `hr_admin` only and
would have given a supervisor a screen that refuses them.

Same migration retired `staff.role` — a clinical credential held as free text,
typed into the scheduler's admin page, verified by nothing, and a fourth copy
of a vocabulary that already existed three times over. Two consumers moved
with it: `isClinicalStaff()` became `carriesSessions()` and tests capacity
alone, and `my_care_team()` — which had been publishing `staff.role` to
FAMILIES as a job title — reads `hub_employee_profiles.job_title` now. Also
added `session_types.is_intake`, replacing three places that matched a session
type's name against the literal "Assessment", and `clients.session_type_id`.

**#186** — The explanation style in CLAUDE.md, asked for directly.

**#187** — The landing-page menu rebuilt without JavaScript. It was React
state, so the dropdown did not exist in the DOM until a click handler ran —
dead until hydration, dead for good if hydration failed. On a phone the
header's own "Log in" link is `display:none` below 780px, so that dropdown was
the *only* route to signing in. Also: the Admin directory was tagging four
distinct roles as "employee", a word this system does not issue, because the
pill rendered `accessLevel` (a three-value display ladder) rather than the raw
`appRole` that PR #183 had already added.

**#188, migration `0087`** — Every policy on a clinic-scoped table now names
the clinic. Six decided "is this row yours?" by reaching through `staff` or
`clients` on `user_id` with no clinic predicate. They were correct only
because one person held one staff row — a fact about an index on another
table, and for the two client ones not even that, since `clients` had no
unique index on `user_id` at all. A tenant boundary that lives in an index
somewhere else is not a boundary. `0087` names the clinic in all six, adds
`clients_user_id_unique`, pins `search_path` on the two `security definer`
functions that did not name `pg_temp` (one of them `handle_new_user`, which
writes to `profiles` and had no `search_path` at all), and makes `clinic_id`
NOT NULL on 37 tables — 45 nullable before, 8 after, the exclusions being the
platform-default tables where null means "every clinic", plus `profiles`.

**DECIDED (2026-09-18, account owner)** — **One login per clinic, for every
role.** A person working at two clinics gets an error on invite rather than a
second membership. The alternative was rewriting the clinic predicate in 435
policies for a case nobody has hit. `invite-teammate` enforces it.

**DECIDED (2026-09-18, account owner)** — Claude may **apply additive
migrations to production directly**, and must do a full sweep and get express
alignment on the consequences before anything destructive. `0087` was applied
under this.

**DECIDED (2026-09-19, account owner)** — CI reads production through a
**scoped read-only Postgres role** (`tenancy_audit`), not the account-wide
`SUPABASE_ACCESS_TOKEN`, which can write and would be printable by anyone
editing a workflow file in a PR. The role holds a grant on no table: 0 of 156
readable, 0 writable. `supabase/tests/README.md` has the SQL and the pooler
string; the password is the owner's and appears nowhere.

---

## 2026-09-19 — a mobile app, and the two house rules it deliberately breaks

**DECIDED** — `apps/mobile`, scaffolded on branch `yanko/mobile-scaffold`.
Sixth workspace app, first one that is not Next.js.

It must run in **Expo Go**, because there is no Apple Developer account. That
is the constraint everything else follows from: no custom native modules, no
dev build, no EAS Build. Expo SDK 57, expo-router, and React Native's own
React (19.2.3) rather than the web apps' 19.2.4 — pnpm keeps the two trees
apart, and forcing them to match would mean overriding what the SDK was
tested against. The five live apps' resolved versions are unchanged; all five
still build.

**Two rules in CLAUDE.md have a deliberate mobile exception.** Both look like
defects to a session that knows the rule and not the reason:

1. **Mobile calls `supabase.auth.signOut()` directly.** The rule — never call
   it, navigate to `signOutUrl()` — exists because four browser portals share
   one `.summitclient.io` cookie that only `apps/web` can clear. This app
   shares no cookie with anything; its session is an encrypted blob in its own
   storage, so the central endpoint has nothing to end here.
2. **`EXPO_PUBLIC_*` is the `NEXT_PUBLIC_*` rule, same force.** Both are
   inlined into the shipped bundle and readable by anyone holding it. The anon
   key belongs there; a service-role key never does; no security decision may
   be gated on one.

**The production droplet does not install it.** `deploy.yml`'s `pnpm install`
became `pnpm install --filter '!@summit/mobile'`, because that box is 1 vCPU
and 1.9 GiB and would otherwise pull the whole React Native toolchain on every
deploy for an app that never runs there. Nothing else about the deploy
changes: the build step already names the five apps explicitly, and every
shared package stays in the install set, so a mobile PR that deliberately
changes `packages/*` still ships to production normally.

**Rejected: a root `.npmrc` with `node-linker=hoisted`.** It is the usual
advice for Metro in a pnpm monorepo and it would change the installed tree for
all five live apps and the droplet to fix a sixth that does not deploy there.
Metro resolves through pnpm's symlinks unaided here, so the only thing
`apps/mobile/metro.config.js` does is force `@supabase/supabase-js` to its
CommonJS build — its ESM build carries a dynamic `import()` that Hermes
refuses to compile.

Still open, deliberately: no `@summit/design` tokens, no shared session
package, no clinic scoping to review yet — the app reads nothing but the
signed-in user's own `profiles` row.

## Contractor work and merges

**DECIDED (2026-08-26)** — PR #40 (`release/v1`, Adina) merged to `main` as
`0db9025` and deployed, as a merge commit to keep the 16 commits attributable.
Three blockers were fixed first in `65c1a4d`: the `NEXT_PUBLIC_DEV_PREVIEW`
auth bypass, a wrong port pin in `apps/data`, and a copy-paste `proxy.ts` in
`apps/employee`.

**DECIDED (2026-08-26)** — Phoebe's clinician portal was rejected and never
merged. `Clinician-Portal-Phoebe` is the only copy: keep it as an archive, do
not prune it with the `fahr/*` batch. It contains `apps/data/RLS-REVIEW.md`,
which should be read before the `apps/client` RLS review. Her five scratch
tables were dropped from Supabase the same day.

**DECIDED (2026-08-26)** — PR #43 (employee hub) merged as `8edbee9` after
eight remediation commits, and `apps/employee` went live on 3004 via PR #46
(`d398150`). Migrations `0006`–`0009` are believed applied, inferred from the
app being up rather than from a migration log.

**PROPOSED, not followed** — Splitting contractor deliveries into four
sequential merges (schema/RLS → auth → API routes → UI/deploy) so review stays
meaningful. The stated reasoning was that AI can produce 4,700 lines faster
than a human can meaningfully review them, so a single PR gets rubber-stamped.
Both PR #40 and PR #43 in fact landed as single merges after remediation.
Worth deciding explicitly whether the four-merge rule is policy or was a
one-off suggestion.

**DECIDED (2026-08-26)** — Do not merge `yanko/portal-ports`; delete the
branch. `git diff origin/main origin/yanko/portal-ports` is 171 files,
+245/−25,154. It predates both new portals and would delete `apps/data`,
`apps/employee`, every migration, the RLS test suites, and four packages. It
does not even touch `apps/client/package.json`, the thing it was for.
Everything it was meant to deliver is already on `main`.

**Correction, 2026-08-27.** There is no `yanko/portal-ports` branch on the
remote — `git branch -r` after a fresh `fetch --prune` shows nothing by that
name. The only GitHub record of the name is PR #34, "Pin client portal to
port 3003 to match nginx," merged 2026-08-21 as a **1-line change**
(`+1/−1`), nothing like the 171-file destructive diff described above. That
diff most likely describes a different, never-pushed local branch that
happened to reuse the same name before PR #34's small, safe version was
pushed and merged. There is nothing live to accidentally merge today — treat
"never merge yanko/portal-ports" as moot rather than as an active landmine,
but don't reuse that branch name again without diffing it against `main`
first, in case the confusion runs the other way.

**OPEN** — Ownership of the contractor-written code. Adina was scoped to the
employee module and delivered a clinician portal across six apps. The
recommendation was to settle in writing who owns the code before access to it
is sold. Also note the conflict flagged at the bottom of this file about how
Adina is described across sessions.

**OPEN** — Whether real employee records exist behind the shared-password
Netlify instance of Adina's original build. This must be confirmed before any
migration decision, because the original auth used a single shared
`HUB_BETA_PASSWORD` with email-domain allowlisting and auto-upsert on login.

**DECIDED (2026-08-20 / 2026-08-26)** — All developer access revoked. Denver
team handed back 2026-08-19; all developer access revoked 2026-08-20; Phoebe's
access removed 2026-08-26. No developers retain repo access. Two SSH keys with
no login history were reviewed and accepted as-is; rotation deferred.

---

## Security and process

**DECIDED (2026-08-27)** — GitHub Actions pinned to full commit SHAs, with the
repo setting enforcing it, plus workflow permissions set to read-only and
"allow Actions to create and approve PRs" unchecked. The reason is specific:
`appleboy/ssh-action` receives the droplet's SSH key, so an upstream tag
compromise would reach the server. Order matters — merge the pinning commit
before flipping the repo setting, or the next deploy fails immediately.

**DECIDED (2026-08-27)** — Branch protection requires 1 approving review,
dismisses stale approvals on new commits, and requires Code Owner review.
CODEOWNERS covers `*` plus an explicit `/.github/` line, because anyone who can
edit a workflow file can print a repo secret into a log.

**DECIDED** — Developers own their own debugging. Yanko drafts guidance emails
rather than walking a developer through every step.

**DECIDED** — Task status lives in a local HTM tracker that Yanko updates
himself. Do not mark an item complete because a branch merged.

**DECIDED (2026-08-28)** — Multi-tenant, RLS-enforced clinic isolation on
*every* record is the actual objective, not a phase-2 someday: "the current
scope of 'mount etna only' is not the objective with this app: it's
commercialization with multi tenant usage." Prompted by discovering, live via
`pg_policies`, that eight core tables (`clients`, `staff`, `sessions`,
`calendars`, `locations`, `session_types`, `client_availability`,
`staff_availability` — the original scheduler schema, predating this repo's
migration history) had no `clinic_id` column and no clinic check in RLS at
all: any admin or scheduler account had unconditional, clinic-wide access.
Fixed in migration `0013` — see `product.md`'s multi-tenant-readiness list
for the technical detail and what it does not yet cover (two tables found in
the same audit with `clinic_id` but zero RLS policies at all, a different,
unrelated gap; and no cross-table clinic_id consistency check across
client_id/employee_id/calendar_id references, left as a residual hardening
item). Treat "single clinic today" as a fact about current data only, never
as license to skip clinic scoping on anything new — see the `clinic_id` hard
constraint in root `CLAUDE.md`.

**DECIDED (2026-08-28)** — Extend `auth_is_staff()`'s existing clinic-wide
grain to `clients`/`sessions` for clinician/supervisor, rather than build a
per-clinician assignment/caseload table. Prompted by a live bug report (the
clinician portal's caseload page showing nothing for a real clinician login)
and confirmed via `pg_policies` that neither table had ever named
`clinician`/`supervisor` in a policy — migration `0013` clinic-scoped both
tables but deliberately preserved their prior access exactly (admin/scheduler
only), so the gap predates that migration and predates this repo's migration
history entirely. Fixed in migration `0014`: a clinic-scoped, read-only select
policy on both tables for `auth_is_staff()` roles, matching how every other
clinical table (`programs`, `session_records`, etc.) already grants access —
clinic-wide, not per-assignment, because no clinician-to-client assignment
concept exists anywhere in this schema to scope to instead. See `product.md`'s
multi-tenant-readiness list for verification detail. If "a clinician sees only
their assigned clients" becomes a real requirement, that is new schema work,
not a policy tweak — left OPEN.

**DECIDED (2026-08-28)** — Close the two remaining items `0013`'s audit
flagged but didn't fix, now that a second clinic is actually being seeded:
cross-table `clinic_id` consistency on the eight legacy scheduler tables, and
`scorecard_metrics`'s missing RLS policy. On re-check, `hub_certificate_registry`
(the other table `0013` flagged alongside `scorecard_metrics`) turned out to
be a false alarm — its lack of a policy is deliberate (migration `0008`: "No
policy: reached only through the security definer functions below") and needs
no fix. Migration `0015` gives `scorecard_metrics` a clinic-scoped read policy
(plus a `clinic_id is null` shared-metric case, matching `credential_rule_versions`)
and an admin-only write policy — not an active bug (nothing in `apps/employee`
queries this table yet), but the same silent-empty-result trap as the
caseload bug, closed before it became one. Migration `0016` adds a trigger on
`sessions`/`client_availability`/`staff_availability` verifying that whatever
a row's `client_id`/`employee_id`/`calendar_id` points at actually belongs to
that row's own `clinic_id` — confirmed, before this fix, that a second
clinic's admin could otherwise insert an own-clinic-tagged `sessions` row
referencing another clinic's client or staff by guessed numeric id, since
`0013`'s insert policies only ever checked the row's own `clinic_id` column.
See `product.md`'s multi-tenant-readiness list for verification detail.

**CONFLICTED, needs verification** — "Schema changes ship as SQL migration
files in the PR, never made in the Supabase dashboard, because dashboard edits
leave no diff to review." That is the stated rule. In practice migrations
`0001`–`0005` were applied by hand via the Supabase SQL Editor on 2026-08-26.
Both are true. Decide whether the rule means "authored as files, applied by
hand" or "applied by a migration runner", and write the answer down.

---

## Rejected or superseded approaches worth not re-litigating

- **Per-clinic isolated databases** — rejected on a 5–7× cost delta versus
  shared multi-tenant with RLS.
- **Self-hosted open-weight models for clinical AI** — rejected in May 2026 on
  operational overhead (GPU instances, model updates, inference latency).
- **AI-based multi-client matching** — replaced with a deterministic JavaScript
  function after it returned only one result for large batches; single-match
  calls moved to a cheaper model with trimmed response shapes.
- **PIN-wall auth stub (`se1`)** — explicitly declined by Yanko. He does not
  want to build a thing he will replace with Supabase Auth.
- **`middleware.ts`** — Next 16 renamed the convention. Use `proxy.ts`
  exporting `proxy`. Where both existed, only `middleware.ts` ran and the
  `proxy.ts` cookie logic was dead code.
- **`tsup` build step for `packages/nav`** — removed. Every consumer already
  had `transpilePackages: ["@summit/nav"]`, so nothing read `dist/`, yet the
  build step could and did break every deploy in the monorepo.
- **`summitscheduler.app`** — retired 2026-08-26, do not renew the cert. It was
  already half-broken: the auth cookie is scoped `.summitclient.io`, so nobody
  could stay logged in through it.

---

## Conflicts between sessions — resolve before relying on either side

1. **`deploy.yml` coverage.** A CLAUDE.md draft written in the Adina-import
   session says the workflow builds only `web` and `scheduler`.
   `summitclient-deploy-ssh.md` says it covers all five live apps as of PR #46.
   The chat is the older statement and is very likely stale, but the same
   mistake has already been made twice in review docs by reading `deploy.yml`
   off a feature branch. Verify against `main`.
2. **Which apps are deployed.** Same session lists `data` and `employee` as not
   deployed. The deploy doc says both went live 2026-08-26. Same cause.
3. **pm2 process names.** One source says `web`, `scheduler`, `client`; the
   deploy doc says five processes. Check `pm2 list`.
4. **RLS status over time.** June 2026: "RLS is currently disabled" and "RLS on
   PHI tables isn't done." 2026-08-14: Yanko corrected a previous instruction
   to Dario, confirming policies do exist on `sessions`, `clients` and
   `profiles`. 2026-08-26 audit: RLS enabled on all five core tables. Treat
   anything before mid-August as stale on this point.
5. **Migration application method.** See the CONFLICTED entry above.
6. **Contractor delivery policy.** Four-merge split recommended, single merges
   actually shipped.
7. **Adina's relationship to the project.** Described as Yanko's wife and
   business partner in one session (2026-08-22) and as an external contractor
   in another (2026-08-27) and in stored memory. This matters for the
   code-ownership question, so settle it rather than inheriting either version.
8. **Pricing.** See `product.md` — two live models with different tiers and
   different breakeven counts.
9. **`yanko/portal-ports`.** Stored memory called it a port-fix branch to
   merge; review docs called merging it a 25k-line-deletion hazard. Neither
   matches what GitHub actually shows — see the correction under "Contractor
   work and merges" above. Resolved: there's nothing to merge, the branch is
   gone, and the described diff doesn't match the PR that branch name
   actually produced.
