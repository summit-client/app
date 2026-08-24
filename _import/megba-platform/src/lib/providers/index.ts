import type {
  SttProvider,
  TtsProvider,
  VideoProvider,
  AiProvider,
  Storyboard,
  Scene,
} from "./types";

/** True when a provider env var names something other than "none"/empty. */
const set = (v?: string) => !!v && v.trim() !== "" && v.trim().toLowerCase() !== "none";

export function capabilities() {
  const aiProviderName = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  // For a provider that needs a key, the capability is only "on" when the key is present.
  const aiReady =
    set(process.env.AI_PROVIDER) &&
    (aiProviderName !== "anthropic" || !!process.env.ANTHROPIC_API_KEY);
  return {
    stt: set(process.env.STT_PROVIDER),
    tts: set(process.env.TTS_PROVIDER),
    video: set(process.env.VIDEO_PROVIDER),
    ai: aiReady,
  };
}

const unconfigured = (kind: string) =>
  ({ configured: false as const, error: `${kind} provider not configured. Set the provider + API key in env (see MULTIMODAL.md).` });

/** Unconfigured defaults, honest: they never fake success. */
export const sttProvider: SttProvider = {
  name: "unconfigured",
  async transcribe() {
    return unconfigured("Speech-to-text");
  },
};
export const ttsProvider: TtsProvider = {
  name: "unconfigured",
  async speak() {
    return unconfigured("Text-to-speech");
  },
};
export const videoProvider: VideoProvider = {
  name: "unconfigured",
  async render() {
    return unconfigured("Video");
  },
};
export const aiProvider: AiProvider = {
  name: "unconfigured",
  async storyboard() {
    return unconfigured("AI");
  },
};

const TITLE = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Transparent, deterministic storyboard scaffold from a brief. This is NOT an
 * AI generation, it is a clearly-labelled template (Concept -> Hook -> Scenes
 * -> CTA) so the Studio is usable before an AI provider is wired. The UI labels
 * it as a draft template.
 */
export function buildTemplateStoryboard(
  brief: string,
  opts: { lengthSec: number; brand?: string },
): Storyboard {
  const b = brief.trim() || "your campaign";
  const beats: Array<Omit<Scene, "index" | "timecode" | "durationSec">> = [
    {
      visual: "Pattern-interrupt opening frame that stops the scroll",
      prompt: `Cinematic opening shot introducing: ${b}`,
      camera: "Punch-in, handheld energy",
      onScreenText: TITLE(b).slice(0, 40),
      voiceover: `Here's the thing about ${b}.`,
      transition: "Hard cut",
      music: "Rising, confident",
    },
    {
      visual: "Emotional context, the problem or the why",
      prompt: `Relatable moment showing the need behind: ${b}`,
      camera: "Slow push-in",
      onScreenText: "Why it matters",
      voiceover: "This is the moment that matters.",
      transition: "Cross dissolve",
      music: "Warm, human",
    },
    {
      visual: "The organization, program, or solution in action",
      prompt: `Authentic footage of the solution for: ${b}`,
      camera: "Steady, observational",
      onScreenText: opts.brand ? opts.brand : "What we do",
      voiceover: "Here's how we help.",
      transition: "Match cut",
      music: "Building",
    },
    {
      visual: "Impact, proof, or emotional payoff",
      prompt: `Uplifting payoff / impact for: ${b}`,
      camera: "Wide reveal",
      onScreenText: "Real impact",
      voiceover: "And this is what changes.",
      transition: "Whip pan",
      music: "Peak",
    },
    {
      visual: "Clear call to action end card",
      prompt: `Brand end card with CTA for: ${b}`,
      camera: "Locked-off, logo reveal",
      onScreenText: "Learn more",
      voiceover: "Join us.",
      transition: "Fade to brand",
      music: "Resolve",
    },
  ];

  const per = Math.max(2, Math.round(opts.lengthSec / beats.length));
  let t = 0;
  const scenes: Scene[] = beats.map((beat, i) => {
    const start = t;
    const dur = i === beats.length - 1 ? Math.max(2, opts.lengthSec - t) : per;
    t += dur;
    return {
      ...beat,
      index: i + 1,
      timecode: `${start}-${start + dur}s`,
      durationSec: dur,
    };
  });

  return {
    concept: `A ${opts.lengthSec}s short about ${b}${opts.brand ? `, in ${opts.brand}'s voice` : ""}.`,
    hook: `Here's the thing about ${b}…`,
    scenes,
    cta: "Learn more",
    captions: scenes.map((s) => s.voiceover),
  };
}
