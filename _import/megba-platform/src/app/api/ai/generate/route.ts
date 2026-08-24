import { NextResponse } from "next/server";
import { z } from "zod";
import { capabilities } from "@/lib/providers";
import { getAiProvider } from "@/lib/providers/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Storyboard generation endpoint (orchestration layer).
 *
 * Guardrails: input validation + size caps + rate limiting. Returns 501 when no
 * AI provider is configured, it never fabricates a "live" generation.
 *
 * Phase 2: require an authenticated session here (see AUTH.md) and key the rate
 * limit / spend cap on the user id, not the IP.
 */
const schema = z.object({
  brief: z.string().min(1).max(2000),
  format: z.string().max(40).default("Instagram Reel"),
  lengthSec: z.number().int().min(6).max(90).default(15),
  brand: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`ai:generate:${clientKey(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  if (!capabilities().ai) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          "AI provider not configured. Set AI_PROVIDER + key in env (see MULTIMODAL.md). The Studio still drafts a template client-side.",
      },
      { status: 501 },
    );
  }

  const { brief, format, lengthSec, brand } = parsed.data;
  const result = await getAiProvider().storyboard(brief, { brand, format, lengthSec });
  if (!result.configured) return NextResponse.json({ ok: false, ...result }, { status: 501 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, storyboard: result.data });
}
