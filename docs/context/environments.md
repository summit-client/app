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
