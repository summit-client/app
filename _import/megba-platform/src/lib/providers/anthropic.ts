import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, Storyboard } from "./types";

/**
 * Anthropic-backed storyboard generation. Server-only: this module reads
 * ANTHROPIC_API_KEY and must never be imported into a client component (import
 * it via providers/server.ts from API routes only).
 *
 * Uses forced tool use for structured output, the most version-stable way to
 * get a validated JSON object back from the Messages API. Model defaults to
 * claude-opus-4-8; override with ANTHROPIC_MODEL (e.g. claude-sonnet-5 for a
 * cheaper/faster option).
 */
const sceneSchema = {
  type: "object",
  properties: {
    index: { type: "integer", description: "1-based scene number" },
    timecode: { type: "string", description: "e.g. 0-3s" },
    visual: { type: "string", description: "What is on screen" },
    prompt: { type: "string", description: "AI video generation prompt for this shot" },
    camera: { type: "string" },
    onScreenText: { type: "string" },
    voiceover: { type: "string" },
    durationSec: { type: "integer" },
    transition: { type: "string" },
    music: { type: "string" },
  },
  required: [
    "index",
    "timecode",
    "visual",
    "prompt",
    "camera",
    "onScreenText",
    "voiceover",
    "durationSec",
    "transition",
    "music",
  ],
  additionalProperties: false,
} as const;

const storyboardSchema = {
  type: "object",
  properties: {
    concept: { type: "string" },
    hook: { type: "string", description: "The opening line that stops the scroll" },
    scenes: { type: "array", items: sceneSchema },
    cta: { type: "string" },
    captions: { type: "array", items: { type: "string" }, description: "One caption line per scene" },
  },
  required: ["concept", "hook", "scenes", "cta", "captions"],
  additionalProperties: false,
} as const;

export function createAnthropicAiProvider(): AiProvider {
  return {
    name: "anthropic",
    async storyboard(brief, ctx) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return { configured: false, error: "ANTHROPIC_API_KEY is not set." };
      }
      const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
      const scenes = Math.max(3, Math.min(8, Math.round(ctx.lengthSec / 4)));
      const system =
        "You are an award-winning short-form creative director for a mission-driven " +
        "organization. You write tight, emotionally resonant storyboards for social video. " +
        "Return only the storyboard via the tool. Keep on-screen text short, voiceover natural " +
        "and human, and make the scene durations sum to the requested length. Avoid clichés and " +
        "generic stock-ad language.";
      const user =
        `Brief: ${brief}\n` +
        `Format: ${ctx.format}\n` +
        `Total length: ${ctx.lengthSec} seconds\n` +
        (ctx.brand ? `Brand voice: ${ctx.brand}\n` : "") +
        `Produce about ${scenes} scenes whose durations sum to ${ctx.lengthSec} seconds.`;

      try {
        const client = new Anthropic({ apiKey });
        const res = await client.messages.create({
          model,
          max_tokens: 4000,
          system,
          messages: [{ role: "user", content: user }],
          tools: [
            {
              name: "storyboard",
              description: "Return the finished storyboard for the requested video.",
              input_schema: storyboardSchema as unknown as Anthropic.Tool["input_schema"],
            },
          ],
          tool_choice: { type: "tool", name: "storyboard" },
        });
        const block = res.content.find((b) => b.type === "tool_use");
        if (!block || block.type !== "tool_use") {
          return { configured: true, ok: false, error: "Model did not return a storyboard." };
        }
        return { configured: true, ok: true, data: block.input as Storyboard };
      } catch (e) {
        return {
          configured: true,
          ok: false,
          error: e instanceof Error ? e.message : "AI request failed.",
        };
      }
    },
  };
}
