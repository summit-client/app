"use client";

import * as React from "react";
import {
  Sparkles,
  Wand2,
  Download,
  Check,
  Settings,
  LifeBuoy,
  ShieldCheck,
  Play,
} from "lucide-react";
import { AppShell } from "@/components/portal/app-shell";
import { VoiceInput } from "@/components/studio/voice-input";
import { useToast } from "@/components/ui/toast";
import { buildTemplateStoryboard } from "@/lib/providers";
import type { Storyboard } from "@/lib/providers/types";
import {
  studioNav,
  formats,
  lengths,
  videoTypes,
  voices,
  tones,
  brandContext,
  variationTypes,
  approvalSteps,
} from "@/content/studio";
import type { NavEntry } from "@/content/portal-admin";
import { cn } from "@/lib/utils";

type Caps = { stt: boolean; tts: boolean; video: boolean; ai: boolean };

const nav: NavEntry[] = studioNav.map((n) => ({ label: n.label, href: `#${n.id}`, icon: n.icon }));
const secondaryNav: NavEntry[] = [
  { label: "Settings", href: "#settings", icon: Settings },
  { label: "Help", href: "#help", icon: LifeBuoy },
];

export function StudioApp({ caps }: { caps: Caps }) {
  const { toast } = useToast();
  const [active, setActive] = React.useState("Composer");
  const [brief, setBrief] = React.useState("");
  const [brand, setBrand] = React.useState("Embers for Access");
  const [ctx, setCtx] = React.useState<string[]>(["Brand guidelines", "Mission & voice"]);
  const [format, setFormat] = React.useState(formats[0]);
  const [length, setLength] = React.useState(15);
  const [vtype, setVtype] = React.useState(videoTypes[0]);
  const [board, setBoard] = React.useState<Storyboard | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [voice, setVoice] = React.useState(voices[0].id);
  const [tone, setTone] = React.useState(tones[0]);
  const [pace, setPace] = React.useState(1);
  const [step, setStep] = React.useState(0);
  const [variations, setVariations] = React.useState<string[]>([]);

  const goTo = (label: string) => {
    setActive(label);
    const id = studioNav.find((n) => n.label === label)?.id;
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const providerNote = (kind: string) =>
    toast({
      tone: "error",
      title: `${kind} provider not configured`,
      description: "Add a provider + API key in Settings (see MULTIMODAL.md).",
    });

  const useTemplate = (note?: string) => {
    setBoard(buildTemplateStoryboard(brief, { lengthSec: length, brand }));
    setStep(1);
    goTo("Storyboard");
    if (note) toast({ tone: "error", title: "Using a draft template", description: note });
  };

  const generate = async () => {
    if (!brief.trim()) {
      toast({ tone: "error", title: "Add a brief first", description: "Type or speak what you want to create." });
      return;
    }
    setBusy(true);
    try {
      if (caps.ai) {
        // Live generation via the guarded API route (Claude, server-side).
        const res = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief, format, lengthSec: length, brand }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok && json.storyboard) {
          setBoard(json.storyboard as Storyboard);
          setStep(1);
          goTo("Storyboard");
          toast({ tone: "success", title: "Storyboard generated", description: "Tailored by Claude." });
        } else {
          useTemplate(json.error || "Live generation was unavailable.");
        }
      } else {
        // No AI provider configured: transparent template scaffold (not a fake AI call).
        useTemplate();
      }
    } catch {
      useTemplate("Could not reach the generator.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCtx = (c: string) =>
    setCtx((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const downloadSrt = () => {
    if (!board) return;
    const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
    const ts = (sec: number) => `00:${pad(sec / 60)}:${pad(sec % 60)},000`;
    let t = 0;
    const srt = board.scenes
      .map((s, i) => {
        const start = t;
        t += s.durationSec;
        return `${i + 1}\n${ts(start)} --> ${ts(t)}\n${s.voiceover}\n`;
      })
      .join("\n");
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.srt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: "Captions downloaded", description: "captions.srt" });
  };

  return (
    <AppShell
      roleLabel="AI Studio"
      nav={nav}
      secondaryNav={secondaryNav}
      title="Content & Video Studio"
      active={active}
      onSelect={goTo}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ember/30 bg-ember/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-ember" aria-hidden />
          <span>
            Preview. Voice-to-text runs in your browser. Storyboards are drafted from a template.
            Video, voiceover, and live AI generation activate when you connect providers, nothing is
            published without your approval.
          </span>
          <span className="ml-auto flex gap-1">
            {(["ai", "video", "tts", "stt"] as const).map((k) => (
              <span
                key={k}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase",
                  caps[k] ? "bg-forest text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {k}
              </span>
            ))}
          </span>
        </div>

        {/* Composer */}
        <section id="composer" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Composer" hint="Type or speak your instruction" />
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. Create a 15s Instagram Reel for Embers for Access promoting Ballerz for Access, emotional and hopeful."
            className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <VoiceInput onCommit={(t) => setBrief((b) => (b ? b + " " + t : t))} />
            <span className="text-xs text-muted-foreground">Transcript is editable before you generate.</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Format">
              <Select value={format} onChange={setFormat} options={formats} />
            </Field>
            <Field label="Length">
              <Select
                value={String(length)}
                onChange={(v) => setLength(Number(v))}
                options={lengths.map((l) => String(l))}
                suffix="s"
              />
            </Field>
            <Field label="Video type">
              <Select value={vtype} onChange={setVtype} options={videoTypes} />
            </Field>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Brand context to use ({brand})
            </p>
            <div className="flex flex-wrap gap-2">
              {brandContext.map((c) => {
                const on = ctx.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCtx(c)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      on ? "border-forest bg-forest text-primary-foreground" : "border-border hover:border-forest",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-forest-700 disabled:opacity-60"
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            {busy ? "Drafting…" : "Generate storyboard"}
          </button>
        </section>

        {/* Storyboard */}
        <section id="storyboard" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Storyboard" hint={board ? "Draft (template)" : undefined} />
          {!board ? (
            <EmptyState
              title="No storyboard yet"
              body="Write a brief in the Composer and generate a draft. You'll get a scene-by-scene board you can refine, voice, and export."
            />
          ) : (
            <div className="space-y-5">
              <Approval step={step} onApprove={() => setStep((s) => Math.min(s + 1, approvalSteps.length - 1))} />
              <div className="rounded-lg bg-muted/60 p-4 text-sm">
                <p><span className="font-semibold">Concept.</span> {board.concept}</p>
                <p className="mt-1"><span className="font-semibold">Hook.</span> {board.hook}</p>
              </div>
              <ol className="space-y-3">
                {board.scenes.map((s) => (
                  <li key={s.index} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Scene {s.index} <span className="text-muted-foreground">· {s.timecode}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => providerNote("AI")}
                        className="text-xs font-medium text-forest hover:underline"
                      >
                        Regenerate
                      </button>
                    </div>
                    <p className="mt-1 text-sm">{s.visual}</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <Row k="AI prompt" v={s.prompt} />
                      <Row k="Camera" v={s.camera} />
                      <Row k="On-screen" v={s.onScreenText} />
                      <Row k="Voiceover" v={s.voiceover} />
                      <Row k="Transition" v={s.transition} />
                      <Row k="Music" v={s.music} />
                    </dl>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => (caps.video ? providerNote("Video") : providerNote("Video"))}
                  className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-forest-700"
                >
                  <Play className="h-4 w-4" aria-hidden /> Render video
                </button>
                <span className="self-center text-xs text-muted-foreground">
                  Rendering needs a video provider. Nothing publishes automatically.
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Voiceover */}
        <section id="voiceover" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Voiceover" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Voice">
              <Select value={voice} onChange={setVoice} options={voices.map((v) => v.id)} labels={voices.map((v) => `${v.label} · ${v.style}`)} />
            </Field>
            <Field label="Tone">
              <Select value={tone} onChange={setTone} options={tones} />
            </Field>
            <Field label={`Pace · ${pace.toFixed(1)}x`}>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.1}
                value={pace}
                onChange={(e) => setPace(Number(e.target.value))}
                className="w-full accent-forest"
                aria-label="Pace"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => providerNote("Text-to-speech")}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-forest/30 px-5 py-2.5 text-sm font-medium text-forest hover:bg-forest/5"
          >
            <Play className="h-4 w-4" aria-hidden /> Generate voiceover
          </button>
        </section>

        {/* Captions */}
        <section id="captions" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Captions" hint="Accessibility-first, editable" />
          {!board ? (
            <EmptyState title="Captions appear after a storyboard" body="Generate a storyboard and captions are drafted from the voiceover, ready to edit and export." />
          ) : (
            <>
              <ul className="space-y-2">
                {board.scenes.map((s, i) => (
                  <li key={s.index} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                      {s.timecode}
                    </span>
                    <input
                      defaultValue={s.voiceover}
                      aria-label={`Caption ${i + 1}`}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={downloadSrt}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-forest/30 px-5 py-2.5 text-sm font-medium text-forest hover:bg-forest/5"
              >
                <Download className="h-4 w-4" aria-hidden /> Download .srt
              </button>
            </>
          )}
        </section>

        {/* Variations */}
        <section id="variations" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Variations" hint="One master, many cuts" />
          <div className="flex flex-wrap gap-2">
            {variationTypes.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  setVariations((prev) => (prev.includes(v) ? prev : [...prev, v]))
                }
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-forest hover:text-forest"
              >
                + {v}
              </button>
            ))}
          </div>
          {variations.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {variations.map((v) => (
                <li key={v} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-forest" aria-hidden /> {v} version
                  </span>
                  <span className="text-xs text-muted-foreground">Queued</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Add variations to spin one campaign into emotional, urgency, sponsor, and length cuts,
              consistent brand, varied hook and CTA.
            </p>
          )}
        </section>

        {/* Library */}
        <section id="library" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
          <SectionTitle icon={Sparkles} title="Library" />
          <EmptyState
            title="Your saved campaigns will live here"
            body="Approved storyboards, voiceovers, captions, and rendered videos are saved to your library for reuse and export."
          />
        </section>
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------- helpers */

function SectionTitle({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-forest" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: string[];
  suffix?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((o, i) => (
        <option key={o} value={o}>
          {labels ? labels[i] : o}
          {suffix ?? ""}
        </option>
      ))}
    </select>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium text-charcoal/70">{k}:</dt>
      <dd className="min-w-0">{v}</dd>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Approval({ step, onApprove }: { step: number; onApprove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {approvalSteps.map((s, i) => (
        <React.Fragment key={s}>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              i < step ? "bg-forest text-primary-foreground" : i === step ? "border border-forest text-forest" : "bg-muted text-muted-foreground",
            )}
          >
            {s}
          </span>
          {i < approvalSteps.length - 1 ? <span className="text-muted-foreground" aria-hidden>›</span> : null}
        </React.Fragment>
      ))}
      <button
        type="button"
        onClick={onApprove}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-forest/30 px-4 py-1.5 text-xs font-medium text-forest hover:bg-forest/5"
      >
        <Check className="h-3.5 w-3.5" aria-hidden /> Advance
      </button>
    </div>
  );
}
