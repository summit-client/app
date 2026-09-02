# Blocked items — apps/web

## Status check on the previous pass's two open notes (2026-09-02 audit)

- **Brand colours still have two sources of truth.** Confirmed still true:
  `pages/index.tsx`'s own JS consts (`navy`/`teal`/`g100`/`g500`/`g700`/`off`)
  still drive the landing page's inline styles, and `globals.css`'s
  `--brand-*` custom properties are still a second, literal-hex copy for the
  auth pages. Unretrofitted, same reasoning as before (one's TS, one's CSS,
  and merging them is a larger change than this pass's scope). Not touched.
- **"`PublicNav` still has no mobile menu" is stale — this was fixed since
  that note was written.** `a9a7707` / PR #134 (merged 2026-08-31, i.e.
  after this file was last updated) added the dropdown menu — confirmed live
  by rendering it: it opens on tap, closes on Escape/outside-click/resize,
  and lists Features/How it works/Reviews. **What the fix missed, found this
  pass by actually opening the menu and tabbing through it:** the panel's
  own comment in `globals.css` claimed the dropdown "already carries... a
  path to sign in" once `.pubnav-login` (the header's "Log in" link) is
  `display:none` below 780px — it didn't. `display:none` isn't just visually
  hidden, it's out of the tab order and accessibility tree too, so a phone
  visitor (or a keyboard user at a narrow width) had no way to reach
  `/login` at all short of typing the URL or going via `/signup`'s "Already
  have an account?" link. **Fixed this pass**: `PublicNav.tsx`'s mobile
  panel now has its own "Log in" link, styled like the other panel links.
  Verified live: visible and clickable in the open panel, reachable by
  Tab (`Features → How it works → Reviews → Log in → Start Free Trial`),
  and a click lands on `/login`. Screenshot taken before/after.

## Fixed this pass

Real bugs and dead code found by reading every file plus driving the app
with Playwright against a mocked Supabase layer (no live project reachable
in this sandbox — see the Verification section below for the mock
methodology and what it did and didn't catch on the first pass).

- **Open redirect in `pages/api/auth/confirm.js`.** `redirect_to` came
  straight off the query string and was handed to `res.redirect()`
  unchecked, *after* `verifyOtp()` had already set a real session cookie on
  the response — i.e. a `summitclient.io` link that authenticates the
  clicking browser and then bounces it to an attacker-controlled page,
  which is the exact "trusted domain, then redirected" shape phishing
  relies on. `pages/api/auth/refresh.js`'s `return_to` already guards
  against exactly this (`isKnownOrigin()` from `@summit/portals`, with a
  comment explaining why) — `confirm.js` just never got the same treatment.
  Fixed with the same pattern plus same-origin relative paths (needed since
  `@summit/portals`'s `isKnownOrigin()` only knows the four *other* portals,
  not `apps/web`'s own origin, and the default destination here is the
  relative `/update-password`): a `safeRedirect()` helper allows a single
  leading-slash path (never `//host`, which browsers treat as
  protocol-relative) or a URL matching `isKnownOrigin()`, and falls back to
  `/update-password` otherwise. Unit-tested standalone against 11 cases
  (plain relative, protocol-relative, absolute attacker domain, `javascript:`
  scheme, known-portal origin, a lookalike-query trick, a
  `summitclient.io.evil.com` suffix trick, empty/undefined/whitespace) — all
  pass. The success path itself couldn't be integration-tested end-to-end
  (needs a real Supabase project to reach `verifyOtp`'s success branch), but
  the error path was confirmed live to still redirect safely to `/login`
  regardless of what `redirect_to` was set to.
- **`/login` never read its own `?error=` param.** Both `/api/auth/confirm`
  and `/auth/callback` redirect a failed verification/reset/invite link here
  as `?error=<message>` — always did, on both routes — but `login.tsx` had
  no `useRouter`/query handling at all, so a broken link (expired, already
  used, tampered) silently dropped the user on a blank login form with zero
  indication anything had gone wrong. This is exactly the "missing
  error state that shows a blank screen" failure mode. Fixed: `login.tsx`
  reads `router.query.error` once the router is ready and shows it as the
  page's form error, with a friendlier message for the `missing_token`
  sentinel `confirm.js` sends. Verified live for both a generic message and
  `missing_token`.
- **`/auth/callback` could hang on "Loading..." forever.** The hash-based
  flow (invite/recovery/implicit login links) subscribed to
  `onAuthStateChange` with no timeout and no handling for Supabase's own
  `#error=...&error_description=...` hash response — an expired, already-used,
  or tampered link left the page showing a bare "Loading..." indefinitely,
  no error, no way out. Fixed: a 10s timeout falls back to `/login` with a
  message if no session ever materializes, and a hash-carried
  `error`/`error_description` is now surfaced the same way instead of
  silently falling through to a bare `/login`.
- **Dead code removed**: `pages/api/hello.ts` (the unmodified
  `create-next-app` scaffold route, publicly reachable at `/api/hello`,
  referenced nowhere); the five unused default Next.js SVGs in `public/`
  (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — none
  referenced anywhere in the app); and the ~115-line commented-out "OLD
  SIGNUP FLOW" block at the top of `pages/signup.tsx` (real
  `supabase.auth.signUp()` account creation, superseded by the lead-gen
  flow pre-launch) — collapsed to a short pointer at git history instead of
  carrying dead, unstyled (raw inline `style={{...}}`, not this app's real
  `AuthCard`/`FormField` components — would've needed a rewrite anyway to
  reactivate) code inline indefinitely.
- **`README.md` was 100% untouched `create-next-app` boilerplate** — wrong
  dev port (3000, not 3001), pointed at `pages/api/hello.ts` (now deleted),
  mentioned a `next/font` Geist setup this app doesn't use, and told the
  reader to deploy on Vercel (this app deploys via the pm2/GitHub Actions
  pipeline in root `CLAUDE.md`). Rewritten to describe the actual app.

## Verified correct, not touched

- **Every `.from(` call in this app** (`login.tsx`, `auth/callback.jsx`; the
  third hit, in `signup.tsx`, was inside the now-removed dead code) reads
  `profiles.role` for the signed-in user's own id under the anon key —
  covered by migration `0032`'s `profiles_self_read` policy
  (`select ... where id = auth.uid()`). No PHI table is touched by this app
  at all; `leads` (service-role, `/api/leads/create` only) isn't PHI.
- **Every `NEXT_PUBLIC_*` var** in this app is exactly `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` (`lib/supabase.ts`, `lib/supabase-server.ts`) — nothing
  security-relevant gated on one, and the service-role key
  (`pages/api/leads/create.js`) is never `NEXT_PUBLIC_`-prefixed and never
  reaches the browser.
- **No gitignored-but-tracked files** in `apps/web` (checked against this
  repo's known history of that in `apps/scheduler`'s `dump.txt`/
  `index_dump.txt`) — clean.
- **`pages/api/leads/create.js`** (the one unauthenticated route that
  writes anywhere, using the service-role key): rate-limited (per-IP and a
  global backstop against `X-Forwarded-For` spoofing), honeypot-gated,
  input-sanitized against control-character/length injection into the
  emails it sends, and HTML-escaped where user input lands in an HTML
  email body. Confirmed live: rejects missing fields, an invalid email, and
  a whitespace-only name with 400s; a filled honeypot returns `{success:true}`
  with no DB write or email side effect (verified via a direct POST with a
  fresh `X-Forwarded-For` — the in-process rate limiter's per-IP bucket is
  otherwise shared across everything hitting this endpoint, mock testing
  included, so a same-IP re-test after exercising the rate limiter itself
  will read as 429, not the honeypot's own behavior); and the rate limiter
  itself does correctly return 429 after repeated submissions. Already
  hardened in an earlier pass (PR #52/#53) — this pass re-verified it live
  rather than re-fixing it.
- **`pages/api/auth/refresh.js` and `pages/api/auth/signout.js`** — the two
  other routes that redirect based on caller input or to a fixed
  destination — already validate (`refresh.js`'s `return_to` via
  `isKnownOrigin()`) or don't take one at all (`signout.js` always goes to
  `/login`). No changes needed.
- **Forced-light theme (no dark mode)** is deliberate and still correctly
  applied — confirmed live with `colorScheme: 'dark'` emulation on
  `/login`: body background stays white regardless of OS preference.
- **Double-submit protection on the login form** (`if (loading) return` +
  `disabled={loading}` on the submit button) holds under a real race test:
  a forced click dispatched directly at a disabled button fires no handler,
  and a correctly-shaped mocked sign-in success produces exactly one
  network call before the page navigates away. (An earlier version of this
  same test using an incomplete mock response — missing `token_type`/
  `expires_in` — made `signInWithPassword` throw client-side, which reset
  `loading` and let a genuinely new, separate click through; that's a test
  fixture bug, not an app bug, and is why this is listed here as verified
  rather than filed as a finding.)
- **Mobile compare-table**, hero scroll scene, and section-spacing fixes
  from earlier passes (PR #112, #122, #127, #134) all still hold — rendered
  at 390px and 1400px, no horizontal overflow at either width, and the
  compare section correctly shows the card layout (not the table) below
  640px.

## Not fixed — needs a human decision, not a code fix

- **Dead footer links: `/privacy` and `/terms`** (`pages/index.tsx`'s
  footer). Neither page exists — a visitor clicking either gets a 404. For
  a PHIPA/PIPEDA-bound product this is more than a broken link: it needs
  actual privacy-policy and terms-of-service content, which is a legal
  document, not something to fabricate as a "no-brainer" fix. Logging here
  since the previous pass flagged this only in a PR description, not in
  this file, and it's still open.
- **The hero/final CTA still says "Start Free Trial."** Signup is lead-gen
  only pre-launch (see the comment at the top of `pages/signup.tsx`) — no
  trial actually starts, a lead is captured and the signup page itself says
  "Launching Q4 2026." Whether the CTA copy should change is a marketing
  call, not a bug; not touched.
- **`leads/create.js`'s in-memory rate-limit `Map`** (keyed by IP) never
  evicts old entries — every distinct IP that ever hits this endpoint stays
  in memory for the life of the process. The file's own comment already
  documents the single-process assumption and names the real fix (Supabase
  table or Redis/Upstash) if this app ever runs clustered; the missing
  eviction is a smaller, same-shaped gap worth noting alongside it rather
  than silently patching with a guessed retention policy.

## Verification

`pnpm -r --if-present run typecheck` (clean) and `pnpm turbo build
--filter=@summit/web` (clean, confirmed twice — once before and once after
this pass's changes) per root `CLAUDE.md`. This app has no
esbuild-bundled test suite, so that section's sandbox caveat doesn't apply
here.

No live Supabase project is reachable from this sandbox, so the flows above
were driven with a real `next dev` server plus Playwright, intercepting
`https://mock-project.supabase.co/**` (a placeholder `NEXT_PUBLIC_SUPABASE_URL`)
at the network layer to simulate Auth/REST responses — sign-in
success/failure/timeout, forgot-password, the lead-gen signup form
(including a direct, unmocked POST to `/api/leads/create` for the routes'
own server-side validation/rate-limiting/honeypot logic), the mobile menu,
back-button navigation mid-flow, and dark-mode emulation. `.env.local` and
`.next` used for this were removed before finishing — not committed.
