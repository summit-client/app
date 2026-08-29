# Blocked items — claude/web-employee-hardening

## apps/employee/public: ~4.8 MB of Mount-Etna-specific assets shipped to every tenant

**Status: investigated, not fixed this session — needs a product/architecture
decision, not a same-session code change.**

### What's actually in there (full manifest, `du -h`)

Clinic-specific (Mount Etna / MEGBA), ~4.5 MB total:

| Path | Size | Confirmed clinic-specific by |
|---|---|---|
| `public/clinical-training.html` | 1.2 MB | 31 literal "MEGBA"/"Mount Etna" references |
| `public/clinical/visual-task-list.html` | 500 KB | 112 literal "MEGBA"/"Mount Etna" references |
| `public/clinical/i18n/*.json` (9 locales: bg, ar, he, hu, it, pt, pl, cs, sr) | 1.3 MB | Loaded only by the two HTML files above (grepped) |
| `public/clinical/megba-logo-light.svg` + `-dark.svg` | 920 KB | Filename |
| `public/clinical/assets/signature.png` | 164 KB | A scanned individual signature — see note below |
| `public/clinical/assets/megba-logo-card.png` + `-light.png` + `-dark.png` | 172 KB | Filename |
| `public/clinical/training-graphics.html` | 260 KB | 58 literal "MEGBA"/"Mount Etna" references |
| `public/clinical/deck-stage.js` | 136 KB | Shared support script for the two HTML decks above (not itself branded, but dead weight without them) |

**Not clinic-specific — confirmed generic Summit platform assets, correctly
left alone:**
- `public/summit-badge.png` (148 KB) — the platform's own certificate badge,
  rendered on every clinic's certificates (`app/certificates/[id]/page.tsx`),
  not Mount Etna's.
- `public/hub-docs/onboarding-checklist-2026.pdf` (88 KB) — filename and its
  one reference (`lib/content.ts`: "the source document for the onboarding
  board") don't indicate Mount-Etna-specific branding, but the PDF's actual
  content wasn't opened/read this session to confirm. Worth a quick manual
  check before assuming it's generic.

**Plus, structurally deeper than a static-asset problem:** `lib/content.ts`
hardcodes **15+** `drive.google.com` URLs (not "five" — product.md undercounts
this) directly into the Week 1/Week 2 onboarding task definitions, the
clinical-module list, and the resource binder (`BINDER_URL`). These aren't
just media links; they're structural fields on task/module objects that this
one tenant's real curriculum populates. Moving assets off `public/` doesn't
touch this at all — it's the same "clinic-specific values live in code"
problem in a different shape, and probably needs to be solved by the same
mechanism, whatever that turns out to be.

### Why this isn't a same-session fix

Every path to "clinic-configurable instead of shipped in the bundle" requires
a decision this session can't make on its own:

1. **Where does per-tenant content live?** Options with real tradeoffs:
   Supabase Storage (a bucket per clinic, signed URLs, RLS-gated); a plain
   `org_settings`-style row per clinic holding external URLs (cheapest, but
   doesn't solve self-hosting the HTML/i18n files themselves, only the Drive
   links); or a lightweight CMS/admin upload flow. `packages/settings`
   already exists and is the natural home for org-scoped config, but nobody
   has decided whether "clinic training curriculum" belongs there or needs
   its own table.
2. **Migration path for the live Mount Etna tenant.** Whatever the mechanism,
   Mount Etna's *own* current content (the actual PHIPA/compliance training
   already in production) has to keep working through the change with zero
   gap - this isn't a green-field feature, it's an in-place swap under a real
   tenant's live onboarding flow.
3. **Admin authoring flow.** A second clinic signing up needs *some* way to
   supply their own training content once this isn't hardcoded - that's new
   UI and new access-control surface (who can upload/edit a clinic's
   curriculum), not a refactor of existing code.
4. **The scanned signature specifically** (`clinical/assets/signature.png`,
   164 KB) deserves its own flag regardless of the multi-tenancy question: an
   individual's actual signature image sitting in a public, unauthenticated,
   statically-served path (anyone who knows or guesses the URL can fetch it)
   is worth a second look independent of packaging concerns - possibly move
   behind auth even before/instead of solving multi-tenancy.

None of these are guessable without a business decision on which model this
product commits to, matching product.md's own framing ("fine for phase 1,
this is the block to unpick for a packaged product") and CLAUDE.md's standing
instruction to treat items marked OPEN in `docs/context/` as genuinely
undecided rather than a backlog to pick up autonomously.

### What would need to happen next
- A decision (from the user) on the storage/config mechanism above.
- A migration plan for Mount Etna's existing content that doesn't interrupt
  their live onboarding flow.
- Then: move the 8 files/dirs in the clinic-specific table above out of
  `public/`, replace `lib/content.ts`'s hardcoded `externalUrl`/`trainingUrl`
  Drive links with a lookup against whatever per-clinic config lands, and
  gate `clinical/assets/signature.png` behind auth.
