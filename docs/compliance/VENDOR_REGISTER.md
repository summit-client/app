# Vendor and subprocessor register

Every third party that can receive data from this system, what it receives, and
what agreement covers it.

**This register is maintained by hand and is the weakest artefact in
`docs/compliance/`.** The control register and data inventory are generated
from the schema and cannot drift; this one can. It was assembled by reading the
code on 2026-09-03 — the method is recorded at the bottom so it can be redone
rather than trusted.

A vendor absent from this register is not thereby approved. Adding an SDK,
API, analytics product, model provider or storage backend that can receive
personal data requires a row here **before** the dependency is merged.

---

## Receives PHI

### Supabase — database, auth, storage, Edge Functions

| | |
|---|---|
| **Purpose** | Primary datastore, authentication, file storage, serverless functions |
| **Data** | All classes in `DATA_INVENTORY.md` — clinical records, family identity, HR, financial, audit |
| **Region** | **VERIFY BEFORE PHI IS LOADED.** Project region is a Supabase setting, not visible to this repository. PHIPA and PIPEDA do not mandate Canadian residency, but the anchor client may contract for it. |
| **Agreement** | **OPEN — BAA/DPA not signed.** `docs/context/compliance.md` records this as gating revenue. |
| **Status** | **BLOCKER. No real PHI may enter the system until this is signed.** |

### Azure OpenAI — clinical AI features

| | |
|---|---|
| **Purpose** | Report drafting, session planning, clinical query, decision support |
| **Data** | Clinical content, potentially identifiable. `packages/clinical-ai/provider.ts` routes anything that may contain PHI here by default. |
| **Region** | Deployment-dependent — must be confirmed against the residency commitment |
| **Agreement** | Microsoft offers a HIPAA BAA and contractual no-training terms for Azure OpenAI. **Confirm executed.** |
| **Retention** | Azure OpenAI abuse-monitoring retains prompts up to 30 days unless the customer is approved for the zero-retention exemption. **Confirm which applies** — this is the single most commonly missed term. |
| **Status** | Provider selection is enforced in code; the agreement is not verified here |

---

## Explicitly refused PHI

### Anthropic — non-PHI scheduler matching

| | |
|---|---|
| **Purpose** | Scheduler match suggestions; synthetic and development work |
| **Data** | Non-PHI only |
| **Enforcement** | `packages/clinical-ai/provider.ts` refuses Anthropic for PHI unless `AI_ANTHROPIC_PHI_APPROVED=true` is deliberately set. The refusal is in code, not in policy. |
| **Agreement** | Not required at current scope. **Required before that flag is ever set.** |

---

## Receives personal data, not clinical

### BrightHR — HR system of record

| | |
|---|---|
| **Purpose** | Employment records, time off, HR documents |
| **Data** | Staff personal and employment data. **No client PHI.** |
| **Note** | Tenant ID moved server-side in PR #54 — it was previously in a client bundle |
| **Agreement** | Existing commercial contract; **DPA status not verified here** |

### Resend — transactional email

| | |
|---|---|
| **Purpose** | Invitations, password resets, notifications |
| **Data** | Email addresses, names. **Message bodies must not contain PHI** — §35 of the directive, and the reason notification content stays generic. |
| **Risk** | Email is the easiest place to leak clinical detail into an unencrypted channel. Any new template needs review. |
| **Agreement** | DPA available from Resend; **confirm executed** |

### Sentry — error monitoring

| | |
|---|---|
| **Purpose** | Application error reporting |
| **Data** | Stack traces, request context. **Can capture PHI incidentally** — an error thrown inside a request handler may carry record contents in local scope. |
| **Required** | Scrubbing configuration, `sendDefaultPii: false`, and no clinical content in error messages. **Not verified in this repository.** |
| **Agreement** | Sentry offers a DPA and a HIPAA BAA on some plans; **confirm** |

### Twilio — messaging

| | |
|---|---|
| **Purpose** | SMS |
| **Data** | Phone numbers, message content |
| **Risk** | SMS is unencrypted at rest on the handset and on carrier infrastructure. Content must stay at "you have a new secure message". |
| **Agreement** | Twilio offers a BAA for qualifying products; **confirm before clinical use** |

---

## Present in the tree but not integrated

**Stripe** — one incidental reference, no integration. Payment processing would
introduce PCI-DSS scope and needs its own review before any card data is
handled.

---

## How this register was built

```bash
# Names referenced anywhere in source, excluding node_modules and lockfiles
grep -rhoiE "azure|openai|anthropic|brighthr|resend|twilio|sentry|stripe" \
  apps packages supabase | sort | uniq -c | sort -rn
```

Counts were then checked against real source files rather than build output —
`apps/employee/.next/` matched several vendors purely because bundled chunks
contain them, which is why a raw count overstates the integration surface.

**This method finds vendors named in code. It cannot find one reached through a
generic HTTP client, an env-configured endpoint, or a transitive dependency
that phones home.** Those need a dependency review and egress monitoring, which
this repository does not currently have.
