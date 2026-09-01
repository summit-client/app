/**
 * @summit/proxy-auth/client — the client-safe counterpart to sessionFreshness()
 * in ./index.ts. That file is explicitly documented as server/edge-only; this
 * one is the opposite: it must only ever run in the browser, reading
 * `document.cookie` directly (never a Supabase client, never an auth call),
 * for exactly the same reason sessionFreshness() never constructs a Supabase
 * client — see index.ts's file header for the full race this is defending
 * against (four portals, one shared `.summitclient.io` session cookie,
 * getUser()/getSession() redeeming the refresh token the moment the session
 * is within 90s of expiry).
 *
 * index.ts's own header says "never import this from a React component or
 * anything client-rendered." That warning is about sessionFreshness() as
 * written, which takes a `RequestCookie[]` most naturally sourced from a
 * server request object — not a statement that reading this same cookie from
 * the browser is inherently unsafe. This file reads it from the browser
 * instead, deliberately, after CONFIRMING (not assuming) that's possible by
 * reading @supabase/ssr's own source (v0.10.3, the version pinned here):
 *
 *   - Every one of this app's own Supabase calls already goes through
 *     `createBrowserClient()` (@supabase/ssr) with no `cookies` override
 *     (apps/data/lib/data.ts's `sb()` and its siblings). That default IS a
 *     `document.cookie`-backed storage adapter
 *     (createStorageFromOptions -> documentCookieGetAll/documentCookieSetAll
 *     in @supabase/ssr's src/cookies.ts) — the SDK could not read or write
 *     its own session cookie from the browser otherwise.
 *   - @supabase/ssr's DEFAULT_COOKIE_OPTIONS (src/utils/constants.ts) sets
 *     `httpOnly: false` explicitly, and neither apps/web/lib/supabase-server.ts
 *     nor apps/data/proxy.ts (the two places that ever write this cookie
 *     server-side) override it. A cookie JS itself sets via `document.cookie`
 *     cannot be httpOnly in the first place — the browser silently drops
 *     that attribute on a script-set cookie — so the fact every portal's
 *     browser client already writes this cookie from JS is independent
 *     confirmation it was never httpOnly to begin with.
 *
 * So: this cookie is exactly as readable from `document.cookie` as it is
 * from a server's request headers. `combineChunks`/`stringFromBase64URL`
 * below are the SAME functions index.ts imports from `@supabase/ssr` (not
 * reimplementations — a hand-rolled copy of chunk-reassembly/base64url
 * decoding is exactly the kind of thing that silently drifts and is not
 * worth the risk here) — already part of every portal's browser bundle
 * regardless, since `createBrowserClient()` uses them internally for this
 * exact cookie. Importing them again here adds no new code to the bundle.
 *
 * This does not weaken or reuse sessionFreshness() itself, which stays
 * server/edge-only and untouched — this is a new, parallel implementation
 * of the same read, not a call into that one.
 *
 * What this file does NOT do: decide what to do about a "stale"/"missing"
 * result. Same division of labour as the server side, where sessionFreshness()
 * only reports a status and proxy.ts decides how to react to it — the call
 * sites in apps/data/lib/data.ts own that decision here too (redirect
 * through @summit/portals' refreshUrl()/loginUrl(), the same central refresh
 * flow proxy.ts already uses), so this package stays a pure, additive
 * freshness read on both sides rather than growing a second copy of the
 * redirect logic.
 */

import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

// Deliberately NOT imported from ./index.ts, even as a type-only import -
// this file's whole point is to have zero import-graph coupling to the
// server/edge-only module, so nothing about how it's bundled or reviewed
// depends on remembering that a type import is erased at compile time.
export type SessionFreshness = "missing" | "fresh" | "stale";

// Mirrors index.ts's EXPIRY_MARGIN_MS - see that file's own comment for
// where the number comes from (@supabase/auth-js's own refresh-on-getUser
// margin). Duplicated rather than shared so the two files can be reviewed
// and changed independently; both must still agree with auth-js's real
// constant, not with each other directly.
const EXPIRY_MARGIN_MS = 90_000;

const BASE64_PREFIX = "base64-";

interface StoredSession {
  access_token?: string;
  expires_at?: number;
}

/**
 * Mirrors index.ts's private storageKeyFor() - the default cookie key
 * @supabase/supabase-js derives when no `cookieOptions.name` override is
 * configured (`sb-<project-ref>-auth-token`). Duplicated rather than
 * exported from index.ts for the same reason as the type above: this
 * module's import graph is deliberately independent of the server-only file.
 */
function storageKeyFor(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

// Mirrors index.ts's decodeCookieValue() exactly.
function decodeCookieValue(raw: string): unknown {
  const encoded = raw.startsWith(BASE64_PREFIX) ? raw.slice(BASE64_PREFIX.length) : null;
  try {
    const decoded = encoded !== null ? stringFromBase64URL(encoded) : raw;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Parses a `document.cookie`-shaped string into a name -> value map (values
 * URI-decoded, matching how the `cookie` package @supabase/ssr uses
 * internally serializes/parses this cookie - see
 * createStorageFromOptions/documentCookieSetAll in @supabase/ssr's
 * src/cookies.ts). A plain split-on-`;` parser rather than pulling in the
 * `cookie` package directly: it's a transitive dependency of @supabase/ssr,
 * not a direct one here, and this shape (name=value pairs joined by "; ",
 * as `document.cookie` always reports them) is simple enough not to need it.
 */
function parseCookieString(cookieString: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!cookieString) return out;
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const rawValue = part.slice(eq + 1).trim();
    try {
      out.set(name, decodeURIComponent(rawValue));
    } catch {
      out.set(name, rawValue);
    }
  }
  return out;
}

/**
 * Client-safe freshness check. Reads `document.cookie` directly (or, for
 * testing outside a browser, an explicitly passed cookie string) - never
 * constructs a Supabase client, never calls an auth method, so it cannot
 * itself trigger the refresh it exists to guard against. Same three
 * outcomes, same 90-second margin, same cookie-key derivation, same
 * chunk-reassembly and base64url decoding as sessionFreshness() in
 * ./index.ts; see that file's header for what each outcome means for the
 * caller.
 *
 * @param supabaseUrl `process.env.NEXT_PUBLIC_SUPABASE_URL` - used only to
 *   derive the cookie key, same as the server side.
 * @param cookieString Defaults to `document.cookie`. Overridable so this
 *   function is unit-testable under plain Node with no DOM.
 */
export async function clientSessionFreshness(
  supabaseUrl: string,
  cookieString: string = typeof document !== "undefined" ? document.cookie : "",
): Promise<SessionFreshness> {
  const key = storageKeyFor(supabaseUrl);
  const byName = parseCookieString(cookieString);

  const raw = await combineChunks(key, async (name: string) => byName.get(name) ?? null);
  if (!raw) return "missing";

  const session = decodeCookieValue(raw) as StoredSession | null;
  if (!session?.access_token || !session.expires_at) return "missing";

  const hasExpired = session.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS;
  return hasExpired ? "stale" : "fresh";
}
