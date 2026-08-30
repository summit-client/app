# Environments

What the code cannot tell you about where it runs. Current as of 2026-08-27;
the live reference for anything operational is `summitclient-deploy-ssh.md`,
which is revised more often than this file.

## Server

One DigitalOcean droplet, `root@159.203.62.254`, Ubuntu 22.04, hostname
`summit-app`, app directory `/var/www/summit-client`. 1 vCPU. Root-only SSH,
no separate deploy user — this is a known R-01 item, not a design choice.

Five apps run under pm2: `web`, `scheduler`, `data`, `client`, `employee`.
`teacher` is a one-line stub and returns 502. That 502 is expected and is not
a data or auth problem.

`data`, `client` and `employee` currently run as direct
`npx next start -p <port>` invocations. That was a workaround for `package.json`
files whose `start` had no `-p` and so grabbed 3000 and crash-looped against
scheduler. Every app on `main` now pins its port, so they can be normalised
back to `pnpm start` one at a time, checking `curl -sI localhost:<port>` after
each. Not yet done.

nginx server blocks for all six subdomains live inside
`/etc/nginx/sites-available/default`, not separate files. The `employee` block
is missing the `ssl_dhparam` line the others carry.

TLS: one cert covers apex, www and all five subdomains, expiring 2026-10-26.
`summitscheduler.app` is retired; its cert lapsed 2026-08-28 and must not be
renewed. The retirement is decided but was not fully executed on the server —
the nginx block and DNS record may still exist.

## Deploy pipeline

`.github/workflows/deploy.yml`, on push to `main` plus manual dispatch. In
order: pull and install, env-file check, `rm -rf` every `.next`, filtered turbo
build at `--concurrency=1`, BUILD_ID check, then `pm2 restart` and `pm2 save`.

Three properties worth knowing because they were each learned the hard way:

- **BUILD_ID is the real verification.** It is written at the very end of a
  successful `next build`, so its presence distinguishes a complete build from
  a half-populated `.next` that starts fine and then 500s on every request.
- **`NODE_OPTIONS=--max-old-space-size=1536` and `--concurrency=1`** are sized
  for the 1 vCPU droplet. Building one app by hand can use 2048;
  `apps/data` pulls in four workspace packages and is the tightest.
- **`command_timeout: 20m`**, because the SSH action's 10-minute default kills
  the session mid-build.

The workflow before 2026-08-20 was actively breaking deploys: it looped over
app names `clinician` and `family` that do not exist, never cleared `.next`,
and used `--frozen-lockfile` under `set -e` so a modified lockfile aborted the
run. **The tell was runs completing in 12–28 seconds.** That is not long
enough to compile two Next.js apps. If you ever see a suspiciously fast green
run, that is what it means.

Manual fallback, one line from PowerShell so there is no chance of running
server commands locally:

```powershell
ssh root@159.203.62.254 "cd /var/www/summit-client && git checkout -- package-lock.json && git pull origin main && pnpm install && export NODE_OPTIONS='--max-old-space-size=1536' && pnpm turbo build --concurrency=1 --filter=@summit/web --filter=@summit/scheduler --filter=@summit/data --filter=@summit/client --filter=@summit/employee && pm2 restart web scheduler data client employee && pm2 list"
```

Use `pnpm`, never `npm` — turbo invokes `/usr/bin/pnpm run build` per package
and `npm install` rewrites the wrong lockfile. Always `--filter`; a bare
`turbo build` builds all packages and a failure in any one aborts the run and
leaves apps mid-compile.

## Supabase Edge Functions (2026-08-28)

Account provisioning (`invite-teammate`, `edit-teammate`, `provision-clinic`
under `supabase/functions/`) is the first use of Supabase Edge Functions in
this repo, and the first place the service-role key is used anywhere -
`profiles` has no UPDATE policy and its INSERT policy only lets someone
create their own `role='client'` row, so creating a staff account or
changing someone's role/clinic/supervisor has no RLS path at all. This can't
be a Next.js API route: the service-role key must never sit in any app's
`.env.local` (see the Env files section below), so it lives as a Supabase
project secret instead - literally "beside auth," not inside any of the
five apps.

**Deploy is manual, separate from `deploy.yml`:** that workflow only builds
and restarts the five Next.js apps; it has no reason to also own Supabase
deploys. Push a function with the Supabase CLI directly:

```bash
npx supabase login                       # once, interactively
npx supabase link --project-ref <ref>    # once, links this checkout to the real project
npx supabase functions deploy invite-teammate
npx supabase functions deploy edit-teammate
npx supabase functions deploy provision-clinic
```

**Prerequisite outside this repo's control:** Supabase Auth needs an SMTP
provider configured (Dashboard → Authentication → Emails) for
`inviteUserByEmail` to actually deliver mail. Confirm this before relying on
either function - the functions succeed either way (the row gets written)
even if the email silently doesn't arrive.

**`provision-clinic` has no UI** (deliberate - see `docs/context/decisions.md`
and `product.md`): it creates a brand-new clinic and its first admin, gated
on membership in the `platform_operators` table (add/remove rows by hand,
same as any other one-off admin task on this schema). Invoke it directly,
signed in as an operator:

```bash
curl -i --location --request POST 'https://<project-ref>.supabase.co/functions/v1/provision-clinic' \
  --header "Authorization: Bearer <your own access token>" \
  --header 'Content-Type: application/json' \
  --data '{"clinic_name":"Some Clinic","clinic_slug":"some-clinic","admin_email":"admin@example.com"}'
```

(Get `<your own access token>` from the browser's session while signed in as
an operator - e.g. `localStorage`'s `sb-<ref>-auth-token` entry, or
`supabase.auth.getSession()` in the console on any portal.)

**Local dev:** `npx supabase functions serve` against a linked project (no
Docker-based fully-local stack was set up or verified in this repo - if
`supabase start` doesn't work in your environment, develop against a linked
*dev* Supabase project, never the production one).

**Not verified in this sandbox:** no Deno runtime was reachable here (network
egress to deno.land is blocked), so the three functions were reviewed by hand
but never actually executed - `supabase functions serve` plus a real
end-to-end invite (through `apps/web`'s existing `/auth/callback` →
`/update-password` flow) is the first real test, same as the smoke test this
session already did for the second-clinic seed.

**Real end-to-end test happened 2026-08-30, during dry-run prep, and found a
real bug the sandbox couldn't have caught: no CORS/`OPTIONS` handling.** A
real invite attempt through `apps/employee`'s Staff & Teams tab failed with
supabase-js's generic `FunctionsFetchError` ("Failed to send a request to
the Edge Function") - a fetch-level failure, not an HTTP error response, so
it gave no hint whether the function was even deployed, whether the gateway
rejected the JWT, or something else entirely. Root cause: the browser's CORS
preflight `OPTIONS` request got a bare 405 with no `Access-Control-*`
headers and was blocked before the real `POST` ever went out. Fixed via
`handlePreflight()`/`CORS_HEADERS` in `_shared/auth.ts` (PR #86). See
`CLAUDE.md`'s "Traps that have already bitten" for the full mechanism - any
new Edge Function needs the same call.

**No Supabase CLI was available on Yanko's machine when this needed
deploying**, which the "Deploy is manual" section above assumes. The actual
path that worked: self-contained (relative imports inlined) versions of each
function's `index.ts` pasted directly into the Supabase Dashboard's
browser-based Edge Function editor (Edge Functions → the function → Edit
code → Deploy) - this sidesteps needing `supabase link`/`supabase functions
deploy` entirely. Confirmed this actually works and is a legitimate
alternative deploy path, not just a stopgap; keep it in mind if the CLI is
ever unavailable again. The JWT-verification toggle mentioned in
`_shared/auth.ts`'s comments was checked for at this time and was **not
visible anywhere in the Dashboard** for this project - `verify_jwt = false`
in `supabase/config.toml` may not be reflected for a project that has never
been deployed via the CLI's declarative config path. Unconfirmed either way;
flagged for whoever gets CLI access working, since it changes the CORS fix's
priority (`verify_jwt` defaulting to true would reject a request with a 401
before it ever reached `handlePreflight()` regardless - not what was
observed here, but worth ruling out explicitly rather than assuming).

## Supabase access for Claude Code sessions (2026-08-30)

`.mcp.json` at the repo root configures `@supabase/mcp-server-supabase` with
`--read-only` and `--project-ref=xbkokyxegrxutppolgtz`, so a Claude Code
session can query the live schema and data directly (`list_tables`,
`execute_sql`, etc.) instead of every migration/mock-data script being
handed over as SQL for Yanko to paste into the dashboard's SQL editor by
hand - which is how every session before this one had to work, including
most of this file's own verification notes.

Requires `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token, from
Dashboard → Account → Access Tokens) set as an environment variable on the
**Claude Code environment** itself - not in `.env.local`, not committed
anywhere. This is a genuinely different scope than the per-app env vars
elsewhere in this file: it's set once per Claude Code environment (there can
be more than one, e.g. Yanko's account had two both named "Default" with
different `environment_id`s), and only sessions running against that
specific environment see it. A session started against a different
environment needs the var set there too - if a session's `ToolSearch` for
"supabase" comes back empty, check which environment it's actually running
on before assuming `.mcp.json` is broken.

`--read-only` is the actual safety boundary, not the token - Supabase has no
per-project token scoping today, so the token itself could reach the whole
account. Never use this connection to run migrations or writes; hand those
over as SQL for a human to run, exactly as before. New MCP servers require a
one-time trust prompt on session start, and env var changes don't reach an
already-running session's container - both need a fresh session to take
effect.

## Env files

Per-app `apps/<app>/.env.local`, git-ignored, must exist before that app can
build. `deploy.yml` fails the whole run if one is missing. Anon key only. The
service role key must never appear in an app env or behind `NEXT_PUBLIC_`.

To copy values down:
`ssh root@159.203.62.254 "cat /var/www/summit-client/apps/<app>/.env.local"`.

**Never set `NEXT_PUBLIC_DEV_PREVIEW=1` on the server.** Since PR #40 it can no
longer bypass auth in production, but `packages/clinical-ai/provider.ts` still
switches to `MockProvider` off that flag with no production guard, which would
serve invented clinical content on a real clinician domain.

Fixture mode needs `next dev`, not `next start`. The preview bypass is gated on
the flag **and** `NODE_ENV !== "production"`, and `next start` sets production,
so a built app ignores the flag and redirects to login. That double gate is
deliberate.

`turbo.json` sets `cache: false`, so its `env` list is inert today. That list
omits six `NEXT_PUBLIC_*` variables the apps actually read, including
`NEXT_PUBLIC_DEV_PREVIEW`. Dormant until someone enables caching, then it
poisons builds.

## Failure modes and their diagnostic tells

| Symptom | Cause | Tell |
|---|---|---|
| `@supabase/ssr: Your project's URL and API key are required` | that app's `.env.local` is missing | healthy apps print `- Environments: .env.local` after the Next banner; the broken one prints no such line |
| `EADDRINUSE :::3000` | a `start` script with no `-p` | check `package.json` before reaching for the `npx` workaround |
| Site up, every page 500s, `Invariant: failed to load static page` | build killed mid-run, half-populated `.next` | distinct from empty `.next`, which fails at startup with "Could not find a production build" |
| `Tasks: 1 successful, 6 total` | turbo killed siblings when one package failed | live apps left with stale or partial `.next` |
| Portal loads but every screen is blank | **not auth.** Either `profiles.clinic_id` is null or the user's role is outside `auth_is_staff()` | RLS filters silently rather than erroring, and the clinician portal shows no message at all |
| Two sources both say "up to date" at different commits | `git status -sb` compares against a cached `origin/main` | always `git fetch` locally before concluding the server missed a push |
| A change never appears live no matter how often you deploy | it is not on `main` | `git log --oneline main..origin/<branch>` |
| A review concludes something about production that is wrong | it was read off a feature branch whose merge-base predates the change | run `git log --oneline <branch>..origin/main` too. This has happened twice |

## Windows-specific traps

- Bare `ssh` opens an app picker: a zero-byte stray file at
  `C:\Windows\System32\ssh` shadows the real OpenSSH binary. Fix in `$PROFILE`
  with a function pointing at the full path, or delete the stray file from an
  elevated shell. `$PROFILE` differs between PowerShell 5.1, 7 and the VS Code
  terminal, so fixing it once does not fix it everywhere.
- `curl.exe -d "{\"...\"}"` sends malformed JSON. A hardened API route returned
  400 instead of the expected 401 and it looked like the old code was still
  deployed. Use `--data-raw` or a file with `-d "@body.json"`.
- Hundreds of files "modified" with no real changes is CRLF churn. The tell is
  symmetric counts (160 files, 34,069 insertions and 34,069 deletions). Confirm
  with `git diff --ignore-all-space --stat` returning empty. **Never
  `git add -A` while it is present.** `core.autocrlf` is unset and there is no
  `.gitattributes`, so this recurs. The fix is a `.gitattributes` with
  `* text=auto eol=lf`, which rewrites line endings repo-wide and wants its own
  PR. Not done.
- Stale `.git\index.lock` blocks every git write until removed.
- `cd : Cannot find path 'C:\var\www\summit-client'` means a server command ran
  on the Windows box.

## Machines

Desktop `C:\Users\Yanko\Projects\summit-client-mono`, laptop
`C:\Users\y_yan\Projects\summit-client-mono`. Same remote, different paths.
Committing on an already-merged feature branch because the second machine was
not pulled first has bitten before.

## Known operational debt

- `*** System restart required ***`, 27 pending updates, 1 ESM security update.
- 3 high severity npm vulnerabilities, not triaged.
- Version drift: local turbo 2.10.8 / pnpm 11.1.3 versus server turbo 2.9.14.
- 18 stale remote branches (`fahr/*`, `dario/*`) to prune. Keep
  `Clinician-Portal-Phoebe`. `yanko/portal-ports` is already gone — see the
  correction in `decisions.md`.
- `apps/scheduler/dump.txt` and `index_dump.txt` are tracked in git despite
  being gitignored and contain the pre-PR40 vulnerable `match.ts`.
- `auth.log` retention is roughly four weeks; anything older is gone.
