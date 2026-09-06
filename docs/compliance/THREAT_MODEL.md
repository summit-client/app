# Threat model

Written 2026-09-03. Hand-maintained, so treat it as of that date and re-derive
before relying on it.

The threats below are ordered by expected harm, not by likelihood. In a
children's clinical system the worst realistic outcome is not a mass breach —
it is one family reading another family's record, or a parent without custody
reading a child's clinical file. Those are quiet, they do not trigger alarms,
and they are the ones the architecture is shaped around.

Threats marked **REALISED** have actually happened on this schema. They are
listed first because a threat that has already occurred once is the best
available evidence about what will occur again.

---

## Realised

### Views bypassing row-level security

**What happened.** A Postgres view runs as its *owner* unless declared
`security_invoker = true`. Every view here is created by a migration running as
superuser, and every portal page reads through a view — so this was the live
read path, not a corner case. Readable across tenants: another family's
funding, another child's clinical progress, staff employment records and pay,
and the security posture of all 100 tables.

**Why it was invisible.** Every underlying policy was correct. Nothing was
applying them.

**Control.** `AC-03`, checked on every CI run. Mutation-tested.

### `search_path` not excluding `pg_temp`

**What happened.** `set search_path = public` does not exclude `pg_temp`.
Temp-table shadowing let any authenticated user insert themselves as admin of
any clinic. Fixed in migration `0009`.

**Control.** `AC-02`, checked on every CI run.

### A guardian relationship policy that recursed

**What happened.** `household_members_family_read` queried its own table from
inside its own policy, so every read raised `infinite recursion detected in
policy`. Family contacts was *broken*, not restricted — and invisible, because
the non-invoker view above it never evaluated the policy at all.

**Lesson recorded.** Two defects can mask each other. Fixing one revealed the
other, and neither was findable by reading.

### Preview mode scoped to a browser, not a user

**What happened.** `@summit/session`'s `IS_PREVIEW` checked the flag but not
`NODE_ENV`. A `NEXT_PUBLIC_` variable bakes into the client bundle regardless
of build mode, so a stray value in a production env file kept consumers on
`localStorage` — scoped to the *browser*, not the signed-in user. Confirmed as
the cause of one clinician's onboarding progress appearing to belong to whoever
else had used that browser.

**Control.** The gate now lives on the single shared export every consumer
reads, rather than being re-remembered at each call site.

---

## Not realised, actively defended

### One family reading another family's record

The highest-harm quiet failure. Defended by `clinic_id` on every PHI table
(`TI-01`), per-relationship guardian permissions (`0047`), and per-record
visibility (`0069`). `rls.mjs` reads as a parent with no relationship to the
target child and asserts an empty set — the measure is a **row count**, because
a SELECT blocked by RLS returns nothing rather than raising.

### IDOR / BOLA on an API route

Enumerating `/api/client/123` → `124`. Defended at the database rather than the
route: the policy filters on `auth_clinic_id()` and guardian relationship, so a
manipulated id returns nothing regardless of what the route does. This is
deliberate — route-level checks are easy to forget on the eleventh endpoint.

### A clinician reading a child not on their caseload

Defended by `auth_can()` action checks plus caseload scoping. Weaker than tenant
isolation: a clinician is inside the tenant boundary, so the control is the
policy predicate rather than the boundary itself.

### A supervisor over-sharing a record

Addressed by `0069`: only `clinical.record.share` (admin/supervisor) can change
visibility, the change is stamped with who and when, and `0068` writes it to the
audit trail. **The residual risk is a correct-but-wrong decision** — a
supervisor legitimately sharing something they should not have. That is a
training and review control, not a technical one, and the `/sharing` screen's
wording is the mitigation.

### Prompt injection via clinical content

A session note, uploaded document or family message reaching a model may contain
text addressed to it. `packages/clinical-ai` routes PHI to Azure OpenAI, and no
model output is wired to any privileged action — authorization is deterministic
and outside the model. **The control is architectural: there is no tool the model
can call.** If that changes, this section must be revisited before it ships.

---

## Known-weak or unaddressed

### The service role key

Bypasses RLS entirely. `SE-01` checks it never sits behind a `NEXT_PUBLIC_`
prefix, but nothing here constrains its use server-side. Edge Functions hold it.
**Compromise of the deployment environment is total compromise of every clinic's
PHI, and no control in this repository mitigates that.**

### Incidental PHI in error monitoring

An error thrown inside a request handler can carry record contents in local
scope, and Sentry captures it. No scrubbing configuration is checked in. Listed
in `VENDOR_REGISTER.md` as unverified.

### A compromised administrator

An admin account is inside every boundary. `0068` makes their actions
*attributable* — the audit trail is `security definer`, so it is written even
where the actor could not write it themselves, and there is no UPDATE or DELETE
policy on it (`AU-01`). That is detection after the fact, not prevention.
**MFA is the missing preventive control and is not enforced.**

### The live database versus this repository

Every control here runs against a PGlite rebuild. A policy dropped by hand in
the Supabase dashboard would not be caught. There is no drift detection between
the migrations and the live schema.

### Bulk export

The directive calls exports high-risk and asks for bounded scope, audit logging
and expiring links. `.ics` calendar feed tokens exist (`0044`); a general export
path does not. **When one is built it needs its own review** — this section is
the marker.

---

## Explicitly out of scope for this document

Host and network security, TLS configuration, the deploy pipeline's own
integrity, physical security, and staff vetting. Those are organizational and
infrastructure concerns; naming them here is not the same as covering them.
