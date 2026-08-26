# My HR / My Documents: Summit audit matrix

Audit of the existing platform before building the module, per the master prompt.
Verdicts: KEEP, IMPROVE, MERGE, REFACTOR, REPLACE, BUILD, REMOVE.

## Existing Summit systems

| Area | Where it lives | Verdict | Action |
| --- | --- | --- | --- |
| Authentication | @supabase/ssr + proxy.ts per app, DEV_PREVIEW seam | KEEP | Module rides the same gate |
| Tenancy | clinic_id + RLS helpers (migrations 0001+) | KEEP | Every new table carries clinic_id + RLS |
| Roles | profiles.role (admin/supervisor/clinician) + supervisor_id links | KEEP | Maps to Employee / Supervisor / Manager-Admin views |
| Design system | @summit/design tokens + app.css component classes | KEEP | All new pages use it; no new styling system |
| Central settings | @summit/settings org -> role -> user inheritance | IMPROVE | Add Ecosystem, Recognition, Bonus, Career keys so all tenant config lives in settings, never code |
| Terminology | term() service | KEEP | Module copy resolves through it |
| Employee hub (onboarding/training/certs/time off/PD/docs/admin) | apps/employee | IMPROVE | Becomes the My HR / My Documents shell; navigation restructured to the module map |
| Certificates + registry numbers | lib/hub.ts issueCertificate | KEEP | Ecosystem and PD reuse it |
| Certificate PDF reading | lib/pd-cert.ts | MERGE | Extended into the universal activity intake with review-before-save |
| PDF export on letterhead | components/pdf-export.tsx | KEEP | Reports render through it |
| Audit events | hub audit store + hub_audit_events | IMPROVE | Extended to score changes, credit allocations, acknowledgements, overrides |
| Documents page | apps/employee documents | MERGE | Folded into My Documents with expiry + verification status |
| Clinician portal | apps/data | KEEP | Untouched; objective measures can feed scorecards later |
| Contracts | nowhere | REMOVE (by design) | Excluded from the module per instruction |

## New capability

| Capability | Verdict | Notes |
| --- | --- | --- |
| Credential rule engine (BACB, CPBAO, IBAO), versioned + date-aware | BUILD | Rules stored as data, never in components; 2027 BACB version included; sources flagged REQUIRES ADMINISTRATOR VERIFICATION until the official PDFs are attached |
| Universal PD activity + cross-credential allocation | BUILD | One activity, many allocations; unique hours never inflate |
| Maximize My Credits | BUILD | Careful language, no guaranteed credit |
| Ecosystem Tracker (scorecard, score, trends) | BUILD | Tenant-default domains taken from the organization's live monthly feedback form; anchored 1 to 5 scale |
| Monthly bonus eligibility | BUILD | Configurable thresholds, no monetary amounts, reasons always shown |
| Recognition points + anti-gaming | BUILD | Allowance, per-person cap, no self-recognition, audit trail |
| Peer feedback with confidentiality tiers | BUILD | Themes to employees, detail to managers by permission |
| Team portal, forum, messages | BUILD | Lightweight; confidentiality reminder on general chat |
| Policies & Handbook + acknowledgement | BUILD | Versioned, re-acknowledgement supported; no contracts |
| Career progress + development goals | BUILD | Development pathway language, no promised promotion |
| Manager dashboard + reports + portfolio | BUILD | On the existing admin surface and PDF export |

## Source audits

- Monthly feedback process: read from the organization's live form. Anchored 1 to 5 scale,
  monthly cadence, domains, self-reflection, open support question, "2 Stars and a Wish",
  anonymity commitment. Real staff names appear in the form and are excluded from code.
- Credential PDFs: the shared Drive folder requires sign-in. Rules are seeded from the
  build specification as versioned data and marked REQUIRES ADMINISTRATOR VERIFICATION;
  the Regulatory PDF Auditor workflow is the path to verified versions.

Principle applied throughout: preserve logic, refactor presentation, extend functionality.
