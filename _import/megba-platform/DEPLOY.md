# Deploying the MEGBA Next.js app

The full app (marketing site + portal previews) deploys **without a database** —
nothing in the site imports Prisma, so a plain `npm install && npm run build`
is all a host needs. Postgres is only required later for live portals (Phase 2).

> Want something live in 2 minutes instead? The single-file `standalone/` site
> (Wix / Netlify-drop) is ready now — see `standalone/README.md`.

---

## 0. Prerequisites

- **Node 18.18+ (20 recommended).** `.node-version` and `netlify.toml` pin Node 20.
- Install `nvm` if you don't have Node: <https://github.com/nvm-sh/nvm>, then `nvm install 20`.

## 1. Run locally first (recommended sanity check)

```bash
cd megba-platform
npm install
npm run build      # production build — surfaces any issue before you deploy
npm run dev        # http://localhost:3000
```

If `npm run build` succeeds locally, the hosted build will too. If it reports a
TypeScript error, paste it back and it's a quick fix (this repo was authored in
an environment without Node, so the first local build is the real compile check).

---

## 2. Deploy to Vercel (recommended for Next.js)

1. Push `megba-platform/` to a GitHub/GitLab repo.
2. Go to <https://vercel.com/new> → **Import** the repo.
3. Framework preset: **Next.js** (auto-detected). Build command / output: defaults.
4. Add environment variables (see §4). At minimum set `NEXT_PUBLIC_SITE_URL`.
5. **Deploy.** Every push auto-deploys; PRs get preview URLs (ideal for feedback).

## 3. Deploy to Netlify

`netlify.toml` is included (installs `@netlify/plugin-nextjs`).

1. Push the repo.
2. <https://app.netlify.com> → **Add new site → Import an existing project**.
3. Pick the repo. Build command `npm run build`, Node 20 (from `netlify.toml`).
4. Add environment variables (§4) under **Site settings → Environment variables**.
5. **Deploy.**

---

## 4. Environment variables

Only `NEXT_PUBLIC_SITE_URL` matters for the marketing deploy; everything else has
safe defaults. Copy from `.env.example`.

| Variable | Needed? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **Yes** | Your live URL, e.g. `https://megba.org`. Drives canonical tags, OG image, sitemap, robots. |
| `EMAIL_PROVIDER` | Optional | `console` (default) logs leads to server output. Set `resend` (etc.) + `RESEND_API_KEY` to actually send. |
| `EMAIL_LEADS_INBOX` | Optional | Where lead forms notify. Defaults to `megba@mountetnachildservices.com`. |
| `EMAIL_FROM` | Optional | From-address for outgoing mail. |
| `DATABASE_URL` / `DIRECT_URL` | Phase 2 | Only when you enable portals/CMS. Not needed to launch the site. |
| `AUTH_SECRET` / `STRIPE_*` | Phase 2–4 | Auth and payments. |

---

## 5. First-launch checklist

- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real domain (re-deploy after).
- [ ] Point your domain at Vercel/Netlify (their dashboard → Domains).
- [ ] Configure a real `EMAIL_PROVIDER` + `EMAIL_LEADS_INBOX` so contact/proposal forms deliver.
- [ ] Confirm the header language toggle translates (needs the live origin; Italian & Bulgarian carry reviewed key copy — get a native check on Bulgarian).
- [ ] Skim `COMPLIANCE.md` — credential wording, legal templates, and remaining content to verify.

## 6. Later: enable the database & portals (Phase 2)

```bash
# after setting DATABASE_URL in .env
npm run db:setup     # prisma generate + migrate deploy + seed
```

Then wire auth per `AUTH.md` and flip the portal previews to real sign-in.

---

## Employee Hub — GitHub + Netlify + Postgres

The marketing site + role-portal previews deploy with **no database**. The
**Employee Hub (`/hub`)** additionally needs a **Postgres database** and env
vars; without them the marketing site still works but `/hub` returns errors.

The repo is already Netlify-ready: `netlify.toml` uses `@netlify/plugin-nextjs`
(SSR, API routes), `.node-version` pins Node 20, and `postinstall` runs
`prisma generate` (no DB needed at build time).

### 1. Push to GitHub

This session can't create the remote (no `gh`/OAuth here). From your machine:

```bash
# create an empty repo on github.com first (private), then:
git remote add origin git@github.com:<you>/megba-platform.git
git push -u origin main
```

### 2. Provision Postgres

Create a free database (Neon or Supabase). Copy the pooled and direct
connection strings.

### 3. Connect Netlify

Netlify → Add new site → Import from GitHub → pick the repo. It auto-detects
Next.js via `netlify.toml`. Then set **Site settings → Environment variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres pooled connection string |
| `DIRECT_URL` | Postgres direct connection string |
| `HUB_BETA_PASSWORD` | the shared beta password (never in git) |
| `HUB_SESSION_SECRET` | `openssl rand -base64 32` |
| `HUB_ALLOWED_EMAIL_DOMAIN` | `mountetnachildservices.com` |
| `NEXT_PUBLIC_SITE_URL` | your Netlify URL |

(Optional: `HUB_SESSION_TTL_HOURS`, `HUB_LOGIN_MAX_ATTEMPTS`,
`HUB_LOGIN_WINDOW_MINUTES`, and — for the AI Studio — `AI_PROVIDER` /
`ANTHROPIC_API_KEY`.)

### 4. Run migrations + seed against the production DB (one-off)

Netlify's build does not migrate the DB. From your machine, pointed at the
prod database:

```bash
DATABASE_URL="<prod>" DIRECT_URL="<prod-direct>" npx prisma migrate deploy
DATABASE_URL="<prod>" DIRECT_URL="<prod-direct>" npm run db:seed:hub
```

Then trigger a redeploy in Netlify. Visit `/hub/login` to sign in.

> The first employee to sign in with a valid Mount Etna email + the beta
> password is created automatically; `office@mountetnachildservices.com` is
> seeded as an admin.
