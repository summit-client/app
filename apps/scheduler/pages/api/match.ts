import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "@supabase/ssr";

/**
 * AI match proxy — hardened. Previously this forwarded any caller's body to the
 * Anthropic API with the server's key (no auth, no allowlist, no cap): anyone who
 * found the route could spend against the key with any model and token budget.
 * Now: the caller must be a signed-in staff user; the model and max_tokens are
 * pinned server-side; only the prompt text is accepted, size-capped.
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 4096;
const MAX_PROMPT_CHARS = 60_000;
const STAFF_ROLES = new Set(["admin", "scheduler", "supervisor", "clinician", "staff"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

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
