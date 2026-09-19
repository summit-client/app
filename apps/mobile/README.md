# @summit/mobile

The Summit iOS app. Expo SDK 57 + expo-router. **It must stay runnable in
Expo Go** — there is no Apple Developer account, so no custom native modules,
no dev build, no EAS Build. Add dependencies with `npx expo install`, and
check they work in Expo Go before relying on them.

Right now it does one thing: sign in with an existing Summit account and show
that account's email, `profiles.role` and `profiles.clinic_id`.

## Running it

```bash
cp apps/mobile/.env.example apps/mobile/.env   # then fill both values in
pnpm install                                   # from the repo root
pnpm --filter @summit/mobile start              # scan the QR code in Expo Go
```

The URL and **anon** key are the same pair the web apps use
(`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`), renamed. If
the phone can't reach the dev server, add `-- --tunnel`.

`EXPO_PUBLIC_*` is inlined into the shipped JavaScript bundle and is readable
by anyone holding the app, exactly as `NEXT_PUBLIC_*` is readable in a
browser. The anon key belongs there. A service-role key never does, and no
security decision may be gated on one.

## Two house rules this app deliberately breaks

**It calls `supabase.auth.signOut()` directly.** CLAUDE.md says never to —
navigate to `signOutUrl()` instead — because the four browser portals share
one `.summitclient.io` cookie that only `apps/web` can clear. This app shares
no cookie with anything: its session is an encrypted blob in its own storage.
The central endpoint has nothing to end here.

**Its session is stored under Supabase's LargeSecureStore pattern**
(`src/lib/supabase.ts`), not in SecureStore directly. The iOS keychain refuses
values much over 2 KB and a session carrying a JWT is larger than that, so the
ciphertext lives in AsyncStorage and only its AES key lives in the keychain.

## Gotchas

`metro.config.js` forces `@supabase/supabase-js` to its CommonJS build. The
ESM build reaches for OpenTelemetry through a dynamic `import()` with a
variable specifier, which Metro cannot resolve statically and Hermes then
refuses to compile — `expo export` fails outright with "Invalid expression
encountered". If a Supabase upgrade ever removes that, the override can go.

`npx expo-doctor` reports "Multiple lock files detected". That is the repo's
pre-existing root `package-lock.json`, not this app's.

## Not done yet

No `@summit/design` tokens, no `@summit/session`, no shared navigation, and
nothing clinic-scoped — the only read is the signed-in user's own `profiles`
row. It is a scaffold: the app icon is a plain blue square and the splash
screen is a background colour, both waiting on real branding.
