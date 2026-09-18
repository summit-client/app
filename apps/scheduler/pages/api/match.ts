import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "@supabase/ssr";
import { sessionFreshness } from "@summit/proxy-auth";

/**
 * AI match proxy — hardened. Previously this forwarded any caller's body to the
 * Anthropic API with the server's key (no auth, no allowlist, no cap): anyone who
 * found the route could spend against the key with any model and token budget.
 * Now: the caller must be a signed-in staff user; the model and max_tokens are
 * pinned server-side; only the prompt text is accepted, size-capped.
 *
 * proxy.ts's matcher excludes /api routes, so this route never went through
 * the sessionFreshness() check every page navigation gets - it called
 * getUser() directly on a cookie that could be within 90s of expiry, which is
 * exactly the cross-portal refresh-token race CLAUDE.md documents (this
 * request racing another portal's proxy.ts for the same refresh token, and
 * losing with a hard refresh_token_already_used error masquerading as
 * "not signed in"). Checked first, same as every proxy.ts.
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 4096;
const MAX_PROMPT_CHARS = 60_000;
// `profiles.role` values allowed to call this route: auth_is_staff()'s three,
// plus scheduler, which needs matching without clinical read. "staff" was in
// this set and is not a role the database issues.
const STAFF_ROLES = new Set(["admin", "scheduler", "supervisor", "clinician"]);

// Auth pins this to a known staff account, but nothing capped how often one
// account could call it - unbounded means unbounded spend against the org's
// Anthropic key from a single compromised or careless account. Keyed on
// user.id (verified, not client-suppliable) rather than IP, since the caller
// is always an authenticated identity here. In-memory, per-process - fine for
// the current single fork-mode PM2 process; move to a shared store if this
// ever runs clustered.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 20;                  // 20 match calls per user per window
const hits = new Map<string, number[]>();

/**
 * Direct identifiers that have no business in a staff-matching prompt, checked
 * here rather than trusted to the caller.
 *
 * The caller is the browser and the prompt is whatever it sends, so "we don't
 * put names in it" is a property of one call site in pages/index.jsx and holds
 * only until someone edits that line. It did not hold: the prompt carried
 * `CLIENT: <real client name>` on every match, sending an identifiable client
 * to a third-party model. The name is gone from the template, and this makes
 * putting one back a 422 instead of a silent leak.
 *
 * Worth being precise about what this is NOT: @summit/clinical-ai's
 * `containsPhi` is a boolean the CALLER declares on RouteRequest, not a
 * detector - resolveProvider() never inspects the payload. Routing this route
 * through it would not have caught this and would still have chosen Anthropic,
 * which is the correct provider for genuinely non-PHI scheduler matching
 * (CLAUDE.md). So the check has to live where the text is.
 *
 * Deliberately narrow, to stay exact rather than heuristic: an identity field
 * label, an email, or a long digit run (phone, health card). Staff names are
 * load-bearing here - the model must name one back - and they appear under
 * ELIGIBLE STAFF, so nothing below can trip on them.
 */
const FORBIDDEN_IN_PROMPT: { pattern: RegExp; what: string }[] = [
  { pattern: /^\s*(CLIENT|PATIENT|CHILD|GUARDIAN|PARENT|FAMILY)\s*:/im, what: "a client identity field" },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.]+/, what: "an email address" },
  // Nine or more digits, tolerating up to two separators between them: a
  // phone or health-card number, not a duration or a capacity. Two, not one,
  // because "(416) 555 0134" puts a bracket and a space between the 6 and
  // the 5 - a test caught that.
  { pattern: /\d(?:[\s().-]{0,2}\d){8,}/, what: "a phone or health-card number" },
];

// Calendar ranges are ISO dates and every real prompt carries two of them.
// "2026-09-01" is ten digit-and-separator characters, so the number rule above
// matches it outright - dropped before the scan rather than loosened, which
// would have let a real phone number through alongside it.
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/** The first forbidden identifier in `prompt`, or null. */
function forbiddenIdentifier(prompt: string): string | null {
  const scanned = prompt.replace(ISO_DATE, " ");
  for (const { pattern, what } of FORBIDDEN_IN_PROMPT) {
    if (pattern.test(scanned)) return what;
  }
  return null;
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 0. Same freshness check every proxy.ts does before ever calling
  // getUser() - this route needs its own copy since middleware never runs
  // for /api. "stale" is reported distinctly (not folded into the generic
  // 401 below) so the caller can send the browser through the central
  // refresh endpoint instead of just retrying the same doomed getUser() call.
  const freshness = await sessionFreshness(
    Object.entries(req.cookies).map(([name, value]) => ({ name, value: value as string })),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  );
  if (freshness === "stale") {
    return res.status(401).json({ error: "Your session needs to refresh.", code: "SESSION_STALE" });
  }

  // 1. Verified session (getUser validates the JWT against the auth server).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () =>
          Object.entries(req.cookies).map(([name, value]) => ({ name, value: value as string })),
        setAll: () => { /* read-only for this route */ },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in to use AI match." });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return res.status(403).json({ error: "AI match is available to staff accounts." });
  }

  if (isRateLimited(user.id)) {
    return res.status(429).json({ error: "Too many match requests. Try again in a few minutes." });
  }

  // 2. Accept only the prompt; everything else is pinned server-side.
  const body = req.body as { messages?: { role?: string; content?: unknown }[]; max_tokens?: number };
  const prompt = body?.messages?.[0]?.content;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(422).json({ error: "A prompt is required." });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: "Prompt too large." });
  }
  const identifier = forbiddenIdentifier(prompt);
  if (identifier) {
    // Not logged with the prompt attached: the whole point is that it may
    // carry an identifier, and putting that in the server log just moves it.
    console.warn(`[match] refused a prompt carrying ${identifier} (user ${user.id})`);
    return res.status(422).json({
      error: "That request carried identifying details, which AI match does not send. Nothing was sent.",
    });
  }
  const maxTokens = Math.min(
    Number.isFinite(body?.max_tokens) ? Math.max(1, Number(body.max_tokens)) : MAX_TOKENS_CAP,
    MAX_TOKENS_CAP,
  );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
