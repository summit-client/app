# Decisions

Status key:

- **DECIDED** — Yanko stated it, or executed it. Binding.
- **PROPOSED** — recommended in a session and reacted to positively, but never
  confirmed as shipped. Do not treat as binding.
- **OPEN** — genuinely undecided, or decided in principle with execution
  unverified.

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
Step 4 (settings persistence) has not been started.

**OPEN** — Invitations and account provisioning. Recognition, peer feedback and
the forum all need real accounts. The recommendation on the table is to build
it as a platform capability beside auth rather than in the employee portal's
admin tab, because it needs a server route (the service role key cannot sit in
an app env), the same account signs into every portal, and it wants its own
security review. Recorded as "Yanko was leaning toward building it properly;
not yet settled."

**OPEN (since 2026-05-16)** — `session_data` JSONB schema for the 8 ABA data
collection methods (DTT, NET, Frequency, Duration, Interval, ABC, Task
Analysis, Yes/No/Inc). The proposal was a locked shared envelope
(`method`, `version`, `recorded_at`, `staff_id`) with method-specific fields
nested under `data`, plus server-side JSON Schema validation via `ajv`. A
32-question clinical questionnaire went to Sarah for validation. No record in
project history of the schema being locked or the questionnaire being
answered. This was called the most technically consequential open decision and
a blocker for Clinician Portal build.

---

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
