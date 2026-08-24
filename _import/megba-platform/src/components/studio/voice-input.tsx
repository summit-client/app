"use client";

import * as React from "react";
import { Mic, Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type State = "idle" | "recording" | "paused";

/* Minimal typing for the Web Speech API (not in lib.dom). */
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Voice-to-text using the browser's Web Speech API. This genuinely works, no
 * external key needed. When you supply a server STT provider (see providers),
 * you can route audio there instead for higher accuracy / more languages.
 *
 * Emits the reviewed transcript to `onCommit` when the user stops; the parent
 * shows it for editing before submitting.
 */
export function VoiceInput({ onCommit, lang = "en-US" }: { onCommit: (text: string) => void; lang?: string }) {
  const [state, setState] = React.useState<State>("idle");
  const [interim, setInterim] = React.useState("");
  const [supported, setSupported] = React.useState(true);
  const recRef = React.useRef<SR | null>(null);
  const desiredRef = React.useRef<State>("idle");
  const finalRef = React.useRef("");

  React.useEffect(() => {
    setSupported(!!getRecognition());
    return () => {
      desiredRef.current = "idle";
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  const ensure = () => {
    if (recRef.current) return recRef.current;
    const rec = getRecognition();
    if (!rec) return null;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (e) => {
      let iv = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else iv += r[0].transcript;
      }
      setInterim(iv);
    };
    rec.onend = () => {
      // Continuous workaround: browsers auto-stop; restart while recording.
      if (desiredRef.current === "recording") {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        desiredRef.current = "idle";
        setState("idle");
        setSupported(false);
      }
    };
    recRef.current = rec;
    return rec;
  };

  const start = () => {
    const rec = ensure();
    if (!rec) return;
    desiredRef.current = "recording";
    setState("recording");
    try {
      rec.start();
    } catch {
      /* already running */
    }
  };
  const pause = () => {
    desiredRef.current = "paused";
    setState("paused");
    recRef.current?.stop();
  };
  const stop = () => {
    desiredRef.current = "idle";
    recRef.current?.stop();
    const text = (finalRef.current + " " + interim).trim();
    finalRef.current = "";
    setInterim("");
    setState("idle");
    if (text) onCommit(text);
  };

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Voice input isn&apos;t available in this browser, type your instruction instead.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {state === "idle" ? (
        <button
          type="button"
          onClick={start}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-forest hover:bg-forest/5"
        >
          <Mic className="h-4 w-4" aria-hidden />
          Speak
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-maple/40 bg-maple/5 px-2 py-1">
          <span className="flex items-center gap-1.5 px-1 text-sm font-medium text-maple">
            <span
              className={cn("h-2 w-2 rounded-full bg-maple", state === "recording" && "animate-pulse")}
              aria-hidden
            />
            {state === "recording" ? "Listening" : "Paused"}
          </span>
          {state === "recording" ? (
            <button type="button" onClick={pause} aria-label="Pause" className="rounded-full p-1.5 hover:bg-maple/10">
              <Pause className="h-4 w-4 text-maple" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={start} aria-label="Resume" className="rounded-full p-1.5 hover:bg-maple/10">
              <Play className="h-4 w-4 text-maple" aria-hidden />
            </button>
          )}
          <button type="button" onClick={stop} aria-label="Stop and use transcript" className="rounded-full p-1.5 hover:bg-maple/10">
            <Square className="h-4 w-4 text-maple" aria-hidden />
          </button>
        </div>
      )}
      {state !== "idle" && interim ? (
        <span className="truncate text-xs text-muted-foreground" aria-live="polite">
          {interim}
        </span>
      ) : null}
    </div>
  );
}
