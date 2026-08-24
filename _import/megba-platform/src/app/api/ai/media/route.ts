import { NextResponse } from "next/server";
import { z } from "zod";
import { capabilities } from "@/lib/providers";
import { getTtsProvider, getVideoProvider } from "@/lib/providers/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Media endpoint for text-to-speech and video render. Same guardrails as
 * /api/ai/generate. Media is expensive, so the limit is tighter. Returns 501
 * when the relevant provider is not configured. Never publishes anywhere.
 */
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tts"),
    script: z.string().min(1).max(5000),
    voice: z.string().max(40),
    tone: z.string().max(40).optional(),
    pace: z.number().min(0.5).max(2).optional(),
  }),
  z.object({
    kind: z.literal("video"),
    storyboard: z.unknown(),
    format: z.string().max(40),
    lengthSec: z.number().int().min(3).max(90),
  }),
]);

export async function POST(request: Request) {
  const rl = rateLimit(`ai:media:${clientKey(request)}`, 5, 60_000);
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
    return NextResponse.json({ ok: false, error: "Validation failed." }, { status: 422 });
  }

  const caps = capabilities();
  const data = parsed.data;

  if (data.kind === "tts") {
    if (!caps.tts) {
      return NextResponse.json(
        { ok: false, configured: false, error: "TTS provider not configured (set TTS_PROVIDER)." },
        { status: 501 },
      );
    }
    const r = await getTtsProvider().speak(data.script, { voice: data.voice, tone: data.tone, pace: data.pace });
    return r.configured && r.ok
      ? NextResponse.json({ ok: true, audio: r.data })
      : NextResponse.json({ ok: false, ...r }, { status: r.configured ? 502 : 501 });
  }

  if (!caps.video) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Video provider not configured (set VIDEO_PROVIDER)." },
      { status: 501 },
    );
  }
  const r = await getVideoProvider().render(data.storyboard as never, { format: data.format, lengthSec: data.lengthSec });
  return r.configured && r.ok
    ? NextResponse.json({ ok: true, video: r.data })
    : NextResponse.json({ ok: false, ...r }, { status: r.configured ? 502 : 501 });
}
