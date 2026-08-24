# Compliance & verification checklist

Items that **must be formally reviewed / verified** before public launch. Most map
to editable fields in the `content/` layer (and, later, the CMS).

## Credentials & accreditation
- [ ] Verify each team member's credentials (BCBA, RBA Ontario, IBA, IBT) and set `verifiedOn` (`src/content/credentials.ts`, `src/content/team.ts`).
- [ ] Confirm no "BACB accredited" wording is used unless a program is formally eligible.
- [ ] Review RBT-aligned language for current eligibility + jurisdictional accuracy (`src/content/services.ts` → `rbt-aligned`, `/legal/credential-disclaimer`).
- [ ] Confirm CEU availability per course; only enable `verifiedStatus: true` where approved (`src/content/courses.ts`). Courses left unverified do **not** display certificate/CEU claims.
- [ ] Review the editable compliance disclaimer (`complianceDisclaimer` in `src/content/site.ts`).

## Legal & privacy (require qualified legal counsel)
- [ ] Privacy Policy, Terms, Cookie Policy, Accessibility Statement, Credential Disclaimer, Safeguarding — all are **templates** (`src/content/legal.ts`).
- [ ] Do not represent automatic compliance with PIPEDA, GDPR, FERPA, COPPA, or provincial health-privacy law.
- [ ] Confirm guardian-consent workflow requirements for minors per jurisdiction.
- [ ] Confirm data-retention periods, data-export, and deletion-request handling.

## Content accuracy
- [ ] Replace all **Demo content** (team bios, testimonials, case-study outcomes, partner logos, events, resources, prices).
- [ ] Confirm region statuses are accurate (Current / Remote / Outreach / Future) (`src/content/regions.ts`).
- [ ] Replace phone number and any placeholder contact details (`src/content/site.ts`).

## Localization
- [ ] Italian & Bulgarian are the reviewed priority languages: reviewed key copy lives in the standalone (`REVIEWED` map) and `src/i18n/dictionaries.ts`. **Bulgarian copy needs a final native-speaker sign-off** before public launch.
- [ ] Other languages (fr, es, de, ro, pl, cs, pt) are served via automatic (Google) translation — keep them marked `reviewed: false` until professionally reviewed.
- [ ] Ensure machine-translated content is never published as "localized" without review.

## Technical / security (pre-launch)
- [ ] Set all secrets via env; rotate the seeded super-admin password immediately.
- [ ] Enable auth + middleware route protection (`AUTH.md`).
- [ ] Configure a real email provider and lead inbox (`EMAIL_*`).
- [ ] Add spam protection appropriate to volume (the API already rejects a honeypot).
- [ ] Legal review of cookie categories + consent behaviour.
- [ ] Accessibility audit (automated + manual keyboard/screen-reader pass).
