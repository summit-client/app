# Compliance

Why the constraints in `CLAUDE.md` exist, what actually gates revenue, and
what is still unanswered. Assembled 2026-08-27. **Verification notes added
later the same day** are marked inline.

## Which regimes are binding

The binding regimes are **PHIPA** (Ontario) and **PIPEDA** (federal Canada).
HIPAA is not binding here — Mount Etna is Canadian and Yanko operates out of
Ontario — but HIPAA-shaped artifacts are still the right thing to obtain,
because a BAA is the contractual instrument vendors offer and buyers ask for.
Documents that say "HIPAA-compliant" are using it as shorthand.

Europe is a **separate regime**, not a region flag. GDPR brings EU data
residency, an Article 9 lawful basis for special-category health data, DPAs,
72-hour breach notification, and likely an EU representative. This was flagged
as the single most important thing to scope honestly before any European
launch.

## The three revenue gates

These gate first external revenue, not phase completion. That distinction was
made explicitly and belongs next to any go-on-sale date shown to Mount Etna.

1. **Supabase BAA — unsigned.** Requires the Team plan or higher plus a HIPAA
   add-on (around US$350/month as of mid-2026, verify current pricing), then
   marking the specific projects High Compliance, plus org-wide MFA,
   Point-in-Time Recovery, SSL enforcement, network restrictions, no PHI in
   public Storage buckets, and the RLS policies. **No real PHI enters the
   system before this is signed.** This is also the gate that governs the
   read-only Supabase MCP access granted to Claude Code sessions 2026-08-30
   (`.mcp.json`, see `environments.md`) — fine today since no real PHI exists
   yet, but revisit that grant's scope explicitly once it does, rather than
   leaving it running unchanged.
2. **`clinic_id` coverage on all PHI tables.** Migrations `0001`–`0005` put
   `clinic_id` on every clinical table they create. Whether coverage is
   complete across the original 10 scheduler tables and the 23 employee-hub
   tables has not been confirmed in one place.
3. **RLS completeness, verified.** See below.

## RLS is the highest-risk area, and the reason is not technical

There is no second reviewer. Yanko is the sole human verifying RLS correctness
on clinical records for autistic children. AI will review policies and catch a
lot, but it has no accountability and will confidently approve a policy that is
subtly wrong. This was identified as the single highest-value external spend to
retain, and it is the one line of work that does not compress with AI
assistance. Budget RLS work as read-every-policy-line time, not as a testing
checkbox.

Two hard-won lessons from the test harness:

- **A policy-blocked UPDATE or DELETE does not raise.** It matches zero rows
  and reports success. An earlier harness that caught only exceptions reported
  four failures as passing, including "employee deletes their own certificate."
  Test suites must report row counts.
- **Two bugs surfaced only from running suites back to back against one
  database** rather than each against a fresh one.

Verification approach that worked: install PostgreSQL locally, replay
`0001`–`0005` to reproduce the live schema, apply the new migrations on top,
and exercise them as a real employee role and a real supervisor role.

## Confirmed live vulnerabilities and their fixes

Recorded here because they are the pattern to watch for, not just history.

- **Temp-schema shadowing (`0009`, fixed).** `set search_path = public` does
  **not** exclude `pg_temp`. Any authenticated user could
  `create temp table profiles(...)`, insert themselves as admin of any clinic,
  and every RLS policy in the schema — all of which resolve through three
  `security definer` helpers reading `profiles` unqualified — would honour it
  for the rest of the session. Reproduced twice, including against a rebuild of
  production's actual `profiles` configuration. The fix names `pg_temp` last
  and schema-qualifies every reference inside definer bodies, so `search_path`
  stops being load-bearing.
- **Signed clinical reports were not immutable (`0009`, fixed).** The guard
  exempted the whole statement if `status='superseded'` was set, so content,
  signer and signature timestamp were all rewritable in one statement on a
  billing-relevant record.
- **`/api/match` forwarded any caller's body to Anthropic with the org key** —
  no auth, no model pin, no token cap. Fixed in PR #40. It still has no rate
  limit, so one staff account can spend the key without bound.
- **`NEXT_PUBLIC_DEV_PREVIEW` bypassed auth on line 1 of `proxy()`** in two
  apps, with `.env.example` shipping `1`. Now requires the flag and
  `NODE_ENV !== "production"`. The flag name was deliberately kept because it
  is read in nine places including a client-side "Preview data" pill; renaming
  breaks fixture mode.

## PHI handling rules

- De-identify before any AI call. Stable IDs replace names and DOBs.
- Never call a model directly with PHI.
- All PHI access audit-logged with user, timestamp, IP, action. 10-year
  retention under PHIPA. Clinical records: 10 years post-last-service (CPBAO).
- Session notes are append-only once signed. Edits become amendment records.
- Consent revocation is immediate, no grace period, no cached access.
- Peer feedback must be architecturally anonymous — built into the schema, not
  the application layer.
- Data residency intent is Canadian regions only: Supabase ca-central-1, Azure
  Canada Central. **This is stated intent, not verified.** Nobody has confirmed
  which region the live Supabase project actually sits in, and Supabase's HIPAA
  controls do not automatically put data in a Canadian region.

## AI vendor policy — OPEN

`packages/clinical-ai` routes PHI to Azure OpenAI by default and refuses to
send identifiable data to Anthropic unless `AI_ANTHROPIC_PHI_APPROVED=true`, on
the assumption that the flag means a BAA and zero retention are in place. The
engineering is sound. **Whether to run a second AI vendor at all is a business
and compliance decision that has not been made.**

The current split as built: Anthropic for scheduler matching, which is
non-PHI (availability slots, session-type compatibility) — confirm no client
names or identifiers ever enter the match prompt. Azure OpenAI for anything
clinical. Azure was chosen because OpenAI's public API offers no BAA and Azure
supports Canada Central.

A BAA or DPA is needed from **every** vendor in the PHI path, not just
Supabase. That includes the email host if PHI ever lands in mail.

## Non-compressible costs

AI assistance compresses engineering. It does not compress liability and
attestation. Roughly CA$50–100K/year that stays put regardless of model
capability: PHIPA/PIPEDA counsel, BAAs, DPAs and tenant contracts
(CA$10–30K to set up), an annual penetration test (CA$15–30K, and every tenant
with procurement will ask for the report), cyber liability and E&O insurance
covering PHI, and SOC 2 if selling above single-clinic buyers (CA$30–60K year
one). The capstone financial model carries CA$54,000 total for
compliance/security/legal across the whole build, which is low for what this
platform is.

## Open compliance questions

- ~~The `profiles` INSERT policy's `with_check`. If it is `true` rather than
  `auth.uid() = id`, a user in `auth.users` with no `profiles` row can insert
  their own as admin of any clinic.~~ **CHECKED 2026-08-27, not a problem.**
  The live policy ("Users can insert own profile") reads
  `(id = auth.uid()) AND (role = 'client'::user_role) AND (clinic_id IS NULL)`
  — stricter than the safe baseline, not looser than it. It only permits
  self-inserting as `client` with no clinic attached, so there's no path to
  self-escalate to `admin` (or any staff role) through this policy. No fix
  needed. (Side note: `profiles.role` is a Postgres enum `user_role`, not
  plain `text`.)
- No UPDATE policy on `profiles` — this is what closes the self-escalation
  route today. Do not add one casually.
- ~~`goal_bank_relations` policies are gated on `auth_is_staff()` with no
  clinic scoping, on read and write, unlike `goal_bank_entries` beside it. Ask
  whether that is deliberate for a shared library.~~ **FIXED 2026-08-28,
  migration `0010`.** Not deliberate — reproduced against a local replay
  (`supabase/tests/goal_bank_relations_rls.sql`) that a second clinic's
  account could insert, then read back, a relation touching a private entry
  it has no other access to, leaking that entry's UUID and note. Fixed by
  requiring both endpoints of a relation to be entries the caller can already
  see under `goal_bank_entries`' own read policy (own clinic or shared);
  legitimate shared-library use (linking your own clinic's entry to a shared
  one) still works, confirmed in the same test file.
- Six of seven accounts are `admin`. No least-privilege separation. Fine while
  it is one operator and an empty schema; not fine with real client data in the
  28 clinical tables.
- `apps/client` is the live family-facing portal and its RLS has never been
  reviewed. Read `apps/data/RLS-REVIEW.md` on the Phoebe archive branch first.
- ~~`apps/client` has no `proxy.ts` or `middleware.ts`; it gates per page in
  `getServerSideProps`, so a page added without the guard is public by
  default. It is the only portal where that is true.~~ **FIXED 2026-08-27, PR
  #50** — `apps/client/proxy.ts` now gates every route with `getUser()`,
  mirroring `apps/data`/`apps/employee`. The per-page `getServerSideProps`
  checks were left in place too, since they also supply `user.id` for the
  actual queries, not just gating.
- ~~No FK from any `client_id` to `clients` on eleven tables. Deleting a
  client silently orphans every program, note, trial event and report for
  that child.~~ **FIXED 2026-08-28, migration `0011`.** A fresh count found
  twelve, not eleven (`ai_requests` was missed). Added as `NOT VALID`
  constraints (default `RESTRICT` on delete, since PHIPA's 10-year retention
  rules out cascading the delete) so any orphans a past unchecked delete
  already created don't block the migration itself; new ones are rejected
  immediately. `apps/scheduler/pages/admin.tsx`'s client-delete handler
  never checked the delete call's error, so a blocked delete would have
  silently reported "deleted" while the row stayed put — fixed alongside
  this so the constraint's rejection actually surfaces to the person
  clicking delete. Verified against a local replay (three tables lacked a
  `client_id` index too, needed to check the constraint efficiently; added
  in the same migration): a pre-existing orphan doesn't block the migration
  from applying, a new orphan insert is rejected, deleting a client with
  clinical history is now blocked, and deleting one with none still works.
  Before validating the constraint against production, check for existing
  orphans first — the migration's own comment has the query.
- Session cookie is non-`HttpOnly` and scoped `.summitclient.io`, so one XSS on
  any subdomain yields auth for every portal. Probably intentional for SSO;
  make it a decision rather than an accident. No CSP anywhere.
- The leads endpoint (`apps/web/pages/api/leads/create.js`) rate-limits on a
  spoofable `x-forwarded-for` and sends mail from the verified domain with
  attacker-controlled subject and body. An unauthenticated phishing relay on
  your own DKIM, using the service-role key.
- `apps/employee/lib/content.ts` embeds a BrightHR tenant token in eight
  compliance-course URLs shipped to every employee's browser.
- Google Workspace spans Ontario and US, a cross-border residency exposure
  flagged in the capstone risk work and not yet in the risk register.
