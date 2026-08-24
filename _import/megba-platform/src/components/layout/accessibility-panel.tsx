"use client";

import * as React from "react";
import { Accessibility, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefs = {
  fontScale: number; // 0.9 – 1.35
  contrast: "normal" | "high";
  motion: "full" | "reduced";
  readingWidth: number; // ch
  spacing: number; // em letter-spacing
};

const DEFAULTS: Prefs = {
  fontScale: 1,
  contrast: "normal",
  motion: "full",
  readingWidth: 68,
  spacing: 0,
};

const STORAGE_KEY = "megba_a11y";

function apply(p: Prefs) {
  const root = document.documentElement;
  root.style.setProperty("--font-scale", String(p.fontScale));
  root.style.setProperty("--reading-width", `${p.readingWidth}ch`);
  root.style.letterSpacing = p.spacing ? `${p.spacing}em` : "";
  root.dataset.contrast = p.contrast === "high" ? "high" : "";
  root.dataset.motion = p.motion === "reduced" ? "reduced" : "";
}

export function AccessibilityPanel() {
  const [open, setOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULTS);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as Prefs;
        setPrefs(parsed);
        apply(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    setPrefs(DEFAULTS);
    apply(DEFAULTS);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-forest text-primary-foreground shadow-lift hover:bg-forest-700"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Accessibility settings"
      >
        <Accessibility className="h-6 w-6" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-start p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-charcoal/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Accessibility settings"
            className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lift"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Accessibility</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="space-y-5 text-sm">
              <Control label={`Text size, ${Math.round(prefs.fontScale * 100)}%`}>
                <input
                  type="range"
                  min={0.9}
                  max={1.35}
                  step={0.05}
                  value={prefs.fontScale}
                  onChange={(e) => update({ fontScale: Number(e.target.value) })}
                  className="w-full accent-forest"
                  aria-label="Text size"
                />
              </Control>

              <Control label="Contrast">
                <Toggle
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High" },
                  ]}
                  value={prefs.contrast}
                  onChange={(v) => update({ contrast: v as Prefs["contrast"] })}
                />
              </Control>

              <Control label="Motion">
                <Toggle
                  options={[
                    { value: "full", label: "Full" },
                    { value: "reduced", label: "Reduced" },
                  ]}
                  value={prefs.motion}
                  onChange={(v) => update({ motion: v as Prefs["motion"] })}
                />
              </Control>

              <Control label={`Reading width, ${prefs.readingWidth}ch`}>
                <input
                  type="range"
                  min={54}
                  max={86}
                  step={2}
                  value={prefs.readingWidth}
                  onChange={(e) => update({ readingWidth: Number(e.target.value) })}
                  className="w-full accent-forest"
                  aria-label="Reading width"
                />
              </Control>

              <Control label={`Letter spacing, ${prefs.spacing.toFixed(2)}em`}>
                <input
                  type="range"
                  min={0}
                  max={0.12}
                  step={0.01}
                  value={prefs.spacing}
                  onChange={(e) => update({ spacing: Number(e.target.value) })}
                  className="w-full accent-forest"
                  aria-label="Letter spacing"
                />
              </Control>

              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 text-sm font-medium text-forest hover:underline"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reset to defaults
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-medium">{label}</p>
      {children}
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1.5 text-sm",
            value === o.value ? "bg-forest text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
