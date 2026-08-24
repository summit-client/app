# Mount Etna Global Behaviour Academy (MEGBA) — Platform

An internationally positioned behaviour-science **education, consultation, training, and technology** platform: a polished public marketing website plus the scaffolded architecture for a multilingual learning platform and six role-based portals.

> **Status:** Phase 1 (public website) is built and deployable. Phases 2–4 (auth, live portals, CMS, payments) are scaffolded — schema, routes, and abstractions are in place; wiring is documented below.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 14** (App Router) + **TypeScript** |
| Styling | **Tailwind CSS 3** with CSS-variable design tokens |
| UI | Hand-built accessible component library (no heavy runtime deps) |
| Icons | `lucide-react` |
| Validation | `zod` (shared client + API) |
| Database | **PostgreSQL** via **Prisma** |
| Auth | **Auth.js**-ready (scaffolded — see `AUTH.md`) |
| i18n | Data-driven dictionary + language switcher; upgrade path to `next-intl` |
| Email / storage / analytics | Provider **abstractions** (swap via env vars) |
| Payments | **Stripe**-ready (env + schema; wiring in Phase 4) |
| Tests | **Vitest** + Testing Library |

---

## Quick start

```bash
# 1. Install dependencies (requires Node 18.18+)
npm install

# 2. Configure environment
cp .env.example .env
#   → set DATABASE_URL (a local Postgres or a hosted one)

# 3. (Optional, for portals/CMS data) set up the database
npm run prisma:generate
npm run prisma:migrate      # creates tables
npm run db:seed             # languages, roles, admin, demo content

# 4. Run the site
npm run dev                 # http://localhost:3000
```

The **public website runs without a database**. Prisma/DB steps are only needed for the portal/CMS/data layer (Phase 2+).

### Useful scripts

```bash
npm run build       # production build
npm run start       # run the production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run prisma:studio
```

---

## Project structure

```
megba-platform/
├─ prisma/
│  ├─ schema.prisma          # full data model (all Phase 2–4 entities)
│  └─ seed.ts                # languages, roles, super-admin, demo content
├─ src/
│  ├─ app/                   # App Router
│  │  ├─ (portal)/portal/    # role-based portal scaffolds
│  │  ├─ about/ academies/ services/ technology/ partners/ …
│  │  ├─ courses/ events/ insights/ case-studies/ legal/ …
│  │  ├─ api/leads/          # lead intake (zod-validated)
│  │  ├─ layout.tsx  page.tsx  sitemap.ts  robots.ts  opengraph-image.tsx
│  │  └─ loading / error / not-found
│  ├─ components/
│  │  ├─ ui/                 # Button, Card, Form, Accordion, Toast, …
│  │  ├─ layout/             # Header (mega menu), Footer, a11y panel, cookies
│  │  ├─ marketing/          # Hero, RegionMap, CourseCard, Stat, CTA
│  │  ├─ forms/              # Conversion forms + submit hook
│  │  ├─ portal/             # PortalShell
│  │  └─ brand/              # Logo / mark
│  ├─ content/               # ★ CMS-editable data (the source of truth)
│  ├─ i18n/                  # languages config + dictionaries
│  ├─ lib/                   # utils, seo, email, validation
│  └─ middleware.ts          # route-protection scaffold
```

### The `content/` layer = your editable CMS data

Everything an administrator would edit lives in `src/content/*` as typed data:
`languages`, `site` (nav + org + disclaimers), `academies`, `services`, `courses`,
`credentials`, `team`, `regions`, `misc` (faqs, testimonials, insights, case studies,
events, resources), `legal`, and `portals`. In Phase 3 these map 1:1 onto the CMS-backed
Prisma tables; the site reads from the same shapes, so migration is a data move, not a rewrite.

---

## Design system

Tokens live in `tailwind.config.ts` + `src/app/globals.css` as HSL CSS variables
(so high-contrast mode and white-label theming can override at runtime):

- **Deep forest green** (primary) · **warm ivory** (background) · **charcoal** (text)
- **soft stone** / **muted sage** · **ember-orange** accent
- Display serif (Fraunces) + Inter for body · elevation/topographic motifs

---

## Accessibility (targets WCAG 2.2 AA)

- Skip link, semantic landmarks/headings, visible focus, keyboard-navigable mega menu
- Accessible forms with error summaries + `aria-describedby` wiring
- **Accessibility panel** (bottom-left): text size, contrast, motion, reading width, letter spacing (persisted)
- `prefers-reduced-motion` respected globally; animations gated
- Region map has a text/list mirror; tables have captions/scope
- RTL-ready architecture (no RTL locale enabled yet)

---

## Internationalization

- Enabled languages are **data-driven** (`src/content/languages.ts` → `Language` table), editable in the CMS — **not hard-coded**.
- Ships English UI dictionary + partial FR/ES to demonstrate the fallback mechanism.
- Language switcher persists a preference (cookie + `localStorage`).
- **Localization policy:** machine translation is a draft; content is only represented as "localized" after professional review (`reviewed` flag per language).
- **Upgrade path:** Phase 2 swaps in `next-intl` with `[locale]` routing + hreflang; the dictionary shape is designed to port directly. See code comments in `src/i18n/`.

---

## Compliance & accuracy safeguards (built in)

- Only **verified** credentials/CEUs/certificates are surfaced (`verifiedStatus` / `verifiedOn` gates in `content` + `CourseCard`).
- No "BACB accredited" language unless eligible; RBT-aligned wording is conservative and editable.
- Legal pages are **templates requiring legal review**; the site does **not** claim automatic PIPEDA/GDPR/FERPA/COPPA compliance.
- Region map labels are honest (Current / Available Remotely / Partner Outreach / Future Expansion).
- All placeholder people, quotes, prices, and outcomes are marked **Demo content**.

See **`COMPLIANCE.md`** for the full list of items needing formal verification before launch.

---

## Deployment

You have three paths depending on how much of the platform you want live:

| Goal | Use | Notes |
|---|---|---|
| Full platform (all pages, portals, API, CMS-ready) | **Vercel** or **Netlify** | Runs the Next.js app with SSR. See below + `netlify.toml`. |
| A quick brochure site you can drop anywhere | **`standalone/megba-standalone.html`** | One self-contained file — drag onto Netlify or open directly. See `standalone/README.md`. |
| Embed in **Wix** | **`standalone/megba-standalone.html`** | Wix can't run Next.js; embed the single HTML file. Steps in `standalone/README.md`. |

### Netlify (full app)
`netlify.toml` is included. In Netlify: **Add new site → Import from Git**, pick this
repo, and Netlify auto-detects Next.js and installs `@netlify/plugin-nextjs`. Set
env vars (from `.env.example`) in **Site settings → Environment variables**.

### Vercel (full app)
Recommended for first-class Next.js support.

1. Push this folder to a Git repository.
2. Import into Vercel; set env vars from `.env.example`.
3. Provision Postgres (Neon / Supabase / RDS) and set `DATABASE_URL` (+ `DIRECT_URL` for pooling).
4. Add a build step / CI hook for `prisma migrate deploy` and (optionally) `db:seed`.
5. Set `NEXT_PUBLIC_SITE_URL` to your production domain (drives canonical/OG/sitemap).

Any Node host works (`npm run build` → `npm run start`). Security headers are set in `next.config.mjs`.

---

## What's built vs. scaffolded

**Built (Phase 1):** brand system, mega-menu nav, home + ~40 pages (About cluster, 5 academies, 9 service pages, technology + multilingual, partners + 3 regions, filterable course catalogue + 16 course pages, events, resources, insights, case studies, FAQ, careers, 6 legal pages), 4 conversion funnels with validated API intake, SEO (metadata, sitemap, robots, JSON-LD, OG image), accessibility panel, cookie consent.

**Scaffolded (Phases 2–4):** 6 role-based portal shells, full Prisma schema + seed, auth/middleware structure, email/storage/analytics/payment abstractions, CMS data model. See `AUTH.md`, `COMPLIANCE.md`, and inline `TODO(phase-2)` markers.

---

## Testing

`npm run test` runs Vitest (utils, zod schemas, Button component). For end-to-end,
add Playwright in Phase 2 (`@playwright/test`) covering the funnels and portal auth.

---

© 2026 Mount Etna Global Behaviour Academy. Demonstration build — review before public launch.
