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
