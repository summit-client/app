import type { AiProvider, TtsProvider, VideoProvider } from "./types";
import { aiProvider, ttsProvider, videoProvider } from "./index";
import { createAnthropicAiProvider } from "./anthropic";

/**
 * Server-only provider selection. API routes import from here (never from a
 * client component) so provider SDKs and API keys stay out of the client bundle.
 */
export function getAiProvider(): AiProvider {
  const p = (process.env.AI_PROVIDER || "none").trim().toLowerCase();
  if (p === "anthropic") return createAnthropicAiProvider();
  return aiProvider; // unconfigured default
}

export function getTtsProvider(): TtsProvider {
  // No paid TTS provider wired yet; returns the honest unconfigured default.
  return ttsProvider;
}

export function getVideoProvider(): VideoProvider {
  // No paid video provider wired yet; returns the honest unconfigured default.
  return videoProvider;
}
