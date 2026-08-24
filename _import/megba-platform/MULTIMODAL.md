# Multimodal layer — Voice, Audio & AI Video (spec + plan)

Captured requirement. This is a large app-side module. It will be built to the
production standard: modular providers, **no faked functionality**, spend
controls, consent for voice data, and human approval before anything publishes.

## Architecture (Claude as orchestration only)

```
Mic / audio upload → Speech-to-Text → Claude (intent + brand context + content)
→ Storyboard / script / production instructions → Video-generation API
→ Text-to-Speech → Captioning / composition → Preview → Human approval → Export
```

Every third-party service is a **swappable provider** behind a TypeScript
interface, so no service is hard-coded:

- `src/lib/providers/stt.ts` — Speech-to-Text (`transcribe(audio) → text`)
- `src/lib/providers/video.ts` — Video generation (`render(storyboard) → asset`)
- `src/lib/providers/tts.ts` — Text-to-Speech (`speak(script, voice) → audio`)
- `src/lib/providers/ai.ts` — Claude orchestration (intent, storyboard, copy)

Provider is selected by env (e.g. `STT_PROVIDER`, `VIDEO_PROVIDER`, `TTS_PROVIDER`).

## Status (built)

- **AI Studio** live at `/portal/studio` (linked from the portal chooser): voice-
  enabled composer, format/length/type + brand-context selectors, storyboard,
  voiceover controls, editable captions with **real .srt export**, variations,
  and the Draft→…→Export approval flow.
- **Voice-to-text works today** (browser Web Speech API, `voice-input.tsx`) —
  record / pause / resume / stop, review + edit before submit, no key needed.
- **Modular providers** in `src/lib/providers/` (STT/TTS/video/AI) with honest
  unconfigured defaults. Provider selection is server-only
  (`src/lib/providers/server.ts`) so SDKs/keys never reach the client bundle.
- **Anthropic wired for storyboards** (`src/lib/providers/anthropic.ts`, uses
  `@anthropic-ai/sdk`, forced tool use → validated JSON). Set `AI_PROVIDER=anthropic`
  + `ANTHROPIC_API_KEY` and the Studio's "Generate storyboard" calls Claude
  (model `ANTHROPIC_MODEL`, default `claude-opus-4-8`); it falls back to the
  transparent template on any error. TTS/video remain unconfigured stubs.
- **Guarded API routes**: `/api/ai/generate`, `/api/ai/media` — input validation,
  size caps, rate limiting, honest **501 when no provider** is configured.
- Provider env vars in `.env.example`.

**To turn storyboards live:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`
in the deploy environment (a monthly cap is still worth setting in the Anthropic
console). ⚠️ **Netlify note:** an Opus storyboard call can exceed the default
serverless function timeout — if `/api/ai/generate` times out, raise the function
timeout or set `ANTHROPIC_MODEL=claude-sonnet-5`. TTS/video still need provider
choices + keys + spend caps before they leave preview.

## Build phases

1. **Voice-to-text input (no external key needed first)**
   - Mic control on every prompt field. Record / pause / resume / stop.
   - Uses the browser Web Speech API first (works, free), with the `stt.ts`
     provider as the upgrade path to a server STT (Whisper/Deepgram/etc.).
   - Review + edit transcription before submit; attach files/images/context.
2. **Voice command mode** — same actions as the UI, driven by speech.
3. **Content → video pipeline** — "Create Video" turns ads/posts/scripts into:
   concept → hook → script → scenes → visual prompts → voiceover → captions → CTA.
4. **AI Video Studio** — format (Reel/TikTok/Short/Story/square/landscape),
   length (6–60s/custom), type (cinematic / motion graphics / photo-to-video /
   avatar / slideshow / remix).
5. **Automatic storyboarding** — per-scene visual, prompt, camera, on-screen text,
   voiceover, duration, transition, music/mood.
6. **Text-to-speech voiceover** — voice/tone/pace/emotion/accent, preview,
   regenerate, synced to scenes + captions.
7. **Automatic captions** — match audio, highlight keywords, platform-safe areas,
   accessibility-first, brand type, editable before export.
8. **Brand-aware generation** — pull brand guidelines/logo/fonts/colours/mission/
   voice/approved media/campaign folders before generating; no generic output.
9. **Conversational editing** — natural-language edits target only the affected
   scenes/components.
10. **Variations** — one master → emotional / urgency / storytelling / stats /
    testimonial / sponsor / 6s / 15s / 30s / Story, consistent brand.
11. **Human approval** — Draft → Review → Edit → Approve → Generate → Export.
    Never auto-publishes externally unless explicitly authorized.

## Guardrails (production standard)

- **Cost protection (required):** authenticated + per-user rate limits + token/
  output caps + usage monitoring + provider spend caps. A public endpoint must
  never be able to silently run up an unlimited bill.
- **Sensitive data:** voice recordings are personal data. Require consent,
  transient storage, clear retention, and never send children's voice data to a
  provider without explicit authorization.
- **No faked functionality:** any step whose provider is not configured is shown
  as a clearly-labelled preview, never a fake "it worked".
- **Accessibility:** captions and transcripts are core, not optional.

## Decisions needed before wiring paid providers

1. Which providers: STT (Whisper/Deepgram/AssemblyAI), video (Runway/Pika/Luma/
   HeyGen for avatars), TTS (ElevenLabs/PlayHT/Azure).
2. API keys + a monthly spend cap per provider.
3. Voice-data consent + retention policy (esp. any minors).

## Clinical Competency training (DONE)

`MEGBA_Training_Platform_3.html` is hosted at **`public/clinical-training.html`**
→ stable absolute URL **`/clinical-training.html`** (resolves reliably from
YouTube descriptions/cards; loads cold with no prior app state). Rebranded to
clean-white MEGBA (logo inlined, sans headings, forest/maple, em-dashes removed),
keyvisual placeholders now show royalty-free Unsplash photos with graceful
fallback. Surfaced as a **free module in the Digital Academy**
(`/academies/digital`) with a `target="_blank" rel="noopener"` option.

Note: deep module anchors (e.g. `#module-3`) are not yet wired (the SPA doesn't
read `location.hash`); the stable page URL works today. Wire hash→module later
if per-module YouTube links are needed.
