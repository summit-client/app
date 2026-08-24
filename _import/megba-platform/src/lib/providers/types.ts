/**
 * Modular provider contracts for the multimodal layer.
 *
 * Claude is the orchestration/intelligence layer; specialized services do the
 * heavy lifting (speech-to-text, text-to-speech, video render). Every provider
 * is swappable via env so no service is hard-coded. Providers that are not
 * configured return an explicit `configured: false` result, they never fake
 * success (see PRODUCTION-GRADE + MULTIMODAL guardrails).
 */

export type ProviderResult<T> =
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }
  | { configured: false; error: string };

export type SttResult = { text: string; durationMs?: number };
export type TtsResult = { audioUrl: string; voice: string; durationMs?: number };
export type VideoResult = { videoUrl: string; posterUrl?: string; durationMs: number };

export type Scene = {
  index: number;
  timecode: string; // e.g. "0-3s"
  visual: string;
  prompt: string; // AI video prompt
  camera: string;
  onScreenText: string;
  voiceover: string;
  durationSec: number;
  transition: string;
  music: string;
};

export type Storyboard = {
  concept: string;
  hook: string;
  scenes: Scene[];
  cta: string;
  captions: string[];
};

export interface SttProvider {
  readonly name: string;
  transcribe(audio: Blob | ArrayBuffer): Promise<ProviderResult<SttResult>>;
}

export interface TtsProvider {
  readonly name: string;
  speak(script: string, opts: { voice: string; tone?: string; pace?: number }): Promise<ProviderResult<TtsResult>>;
}

export interface VideoProvider {
  readonly name: string;
  render(storyboard: Storyboard, opts: { format: string; lengthSec: number }): Promise<ProviderResult<VideoResult>>;
}

export interface AiProvider {
  readonly name: string;
  storyboard(brief: string, ctx: { brand?: string; format: string; lengthSec: number }): Promise<ProviderResult<Storyboard>>;
}
