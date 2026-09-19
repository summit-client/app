/**
 * Security response headers, shared by all five portals.
 *
 * None of the five sent any of these. On a system whose URLs carry client ids
 * and whose pages render clinical content, four of them matter concretely:
 *
 *   frame-ancestors    a PHI portal that can be framed can be clickjacked -
 *                      an invisible overlay over "Withdraw consent" or
 *                      "Share with family" is a real attack on this app, not
 *                      a theoretical one.
 *   Referrer-Policy    without it a full URL - including /clients/4192 - is
 *                      sent to any third-party origin the page reaches. That
 *                      is a client identifier leaving the system in a header
 *                      nobody audits.
 *   HSTS               a first request over http:// carries the session cookie
 *                      before any redirect can protect it.
 *   X-Content-Type-Options  stops a text/plain response holding clinical notes
 *                      being sniffed and executed as script.
 *
 * WHY THIS LIVES IN ONE FILE
 *
 * Five copies of a header list drift, and the drift is silent - a portal
 * missing frame-ancestors looks identical to one that has it. Every app
 * imports this and a control test asserts all five do.
 *
 * WHY THE CSP IS NOT STRICTER
 *
 * These apps render extensively with React inline `style` objects, which
 * require style-src 'unsafe-inline'. Removing it would break every screen, and
 * a CSP that breaks the product gets reverted rather than tightened. Next.js
 * additionally needs 'unsafe-eval' in development for its dev overlay and fast
 * refresh, so that is included only when NODE_ENV is not production.
 *
 * script-src therefore carries 'unsafe-inline' too, which means this CSP does
 * NOT stop XSS. What it does stop is exfiltration: connect-src, img-src and
 * form-action are restricted to self plus the Supabase project, so injected
 * script cannot POST a stolen record to an attacker's host. That is the
 * property worth having here, and it is achievable without a nonce
 * infrastructure this codebase does not have.
 *
 * Tightening script-src to a nonce is the right next step and needs a
 * middleware that can generate one per request. Logged as such rather than
 * pretended.
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * The Supabase origin must be reachable by the browser for auth and PostgREST.
 * Read from the same variable the apps use, so a project change cannot leave
 * the CSP pointing at the wrong host and silently break every query.
 */
function supabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try { return new URL(url).origin; } catch { return ""; }
}

export function securityHeaders() {
  const supabase = supabaseOrigin();
  const wsSupabase = supabase ? supabase.replace(/^https:/, "wss:") : "";

  const csp = [
    `default-src 'self'`,
    // 'unsafe-inline' is required by React inline styles; see the header note.
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // The exfiltration boundary: injected script cannot reach an attacker host.
    `connect-src 'self' ${supabase} ${wsSupabase}`.trim(),
    `form-action 'self'`,
    // Clickjacking. frame-ancestors is the modern replacement for
    // X-Frame-Options and is not overridden by it.
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // strict-origin-when-cross-origin still sends the origin cross-site.
    // same-origin sends nothing at all off-site, which is what a URL carrying
    // a client id requires.
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];

  // HSTS only in production. Sent from localhost it pins http://localhost to
  // https for the max-age, which breaks every other local project on that
  // origin and is remembered by the browser long after this one is forgotten.
  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

/** Drop-in for a Next.js config's `headers()`. */
export async function securityHeadersConfig() {
  return [{ source: "/:path*", headers: securityHeaders() }];
}
