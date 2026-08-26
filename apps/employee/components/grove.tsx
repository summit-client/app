"use client";

import * as React from "react";

/**
 * The visual language of the ecosystem: a volcano that wakes at milestones,
 * summit peaks with an altitude marker, and the climb, a mountain whose camps
 * are the career pathway with a climber marker at your elevation.
 *
 * Hidden finds live at the bottom of this file. Nothing here changes data.
 */

/** Mount Etna. Erupts when the site unlocks its reward. */
export function Volcano({ active, size = 150 }: { active: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 140 110" width={size} height={size * 0.79} role="img"
      aria-label={active ? "Volcano erupting" : "Volcano at rest"} style={{ display: "block", overflow: "visible" }}>
      {active ? (
        <g className="erupt">
          <path d="M62 40 Q70 6 78 40 Z" fill="#f0a02c" opacity="0.9" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} className={`ember e${i}`} cx={70 + (i - 2.5) * 7} cy={34} r={2 + (i % 3)} fill={i % 2 ? "#e8641c" : "#f5b93f"} />
          ))}
        </g>
      ) : null}
      <path d="M8 104 L54 40 Q70 26 86 40 L132 104 Z" fill="var(--accent)" />
      <path d="M8 104 L54 40 Q62 32 70 34 L70 104 Z" fill="var(--accent)" opacity="0.78" />
      <path d="M54 40 Q70 26 86 40 L78 44 Q70 38 62 44 Z" fill="#fff" opacity="0.85" />
      {active ? <path d="M70 40 L60 78 L80 74 Z" fill="#e8641c" opacity="0.75" className="lava" /> : null}
    </svg>
  );
}

/** Three summit peaks with the altitude marker at the current score. */
export function SummitPeaks({ percent, height = 90 }: { percent: number; height?: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const y = 96 - (p / 100) * 74;
  return (
    <svg viewBox="0 0 220 100" width="100%" height={height} role="img" aria-label={`Altitude ${p} percent`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="peakfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <polygon points="10,96 58,34 106,96" fill="url(#peakfill)" />
      <polygon points="70,96 128,16 186,96" fill="url(#peakfill)" />
      <polygon points="140,96 182,44 212,96" fill="url(#peakfill)" />
      <polygon points="128,16 138,30 118,30" fill="#fff" opacity="0.9" />
      <line x1="0" y1={y} x2="220" y2={y} stroke="var(--good)" strokeWidth="2" strokeDasharray="5 4" />
      <text x="216" y={y - 5} textAnchor="end" fontSize="10" fill="var(--good)" fontWeight="700">{p}</text>
    </svg>
  );
}

/** Compact ring for a single score. */
export function ScoreRing({ value, max = 100, size = 108, label }: { value: number | null; max?: number; size?: number; label?: string }) {
  const p = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label ?? `Score ${value ?? "none"}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 800ms cubic-bezier(.2,.8,.3,1)" }} />
      <text x="50" y="54" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--ink)"
        style={{ fontVariantNumeric: "tabular-nums" }}>{value ?? "—"}</text>
    </svg>
  );
}


/** The climb: camps up the mountain are the career pathway, and the climber
 * marker sits at your elevation. Elevation is earned, never guaranteed. */
export function TheClimb({ elevation, camps, size = 300 }: { elevation: number; camps: string[]; size?: number }) {
  const p = Math.max(0, Math.min(100, elevation));
  // path from base (20,190) to summit (150,18)
  const px = 20 + (p / 100) * 130;
  const py = 190 - (p / 100) * 172;
  const n = Math.max(camps.length, 2);
  return (
    <svg viewBox="0 0 300 210" width="100%" style={{ maxWidth: size * 1.6, display: "block" }} role="img"
      aria-label={`Elevation ${p} of 100`}>
      <defs>
        <linearGradient id="climbfill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <polygon points="0,200 150,14 300,200" fill="url(#climbfill)" />
      <polygon points="150,14 166,36 134,36" fill="#fff" opacity="0.92" />
      <path d="M150,14 L162,26 L150,30 Z" fill="var(--danger)" />
      <path d={`M20,190 L${150},18`} stroke="#fff" strokeWidth="2" strokeDasharray="4 5" opacity="0.7" fill="none" />
      {camps.map((c, i) => {
        const t = camps.length === 1 ? 1 : i / (camps.length - 1);
        const cx = 20 + t * 130;
        const cy = 190 - t * 172;
        const reached = p >= (i / (n - 1)) * 100 - 0.5;
        return (
          <g key={c}>
            <circle cx={cx} cy={cy} r="5" fill={reached ? "var(--good)" : "var(--surface)"} stroke={reached ? "var(--good)" : "var(--line-strong)"} strokeWidth="2" />
            <text x={cx + 10} y={cy + 4} fontSize="9.5" fill={reached ? "var(--ink)" : "var(--muted)"} fontWeight={reached ? 700 : 500}>{c}</text>
          </g>
        );
      })}
      <g style={{ transition: "transform 900ms cubic-bezier(.2,.8,.3,1)", transform: `translate(${px}px, ${py}px)` }}>
        <circle cx="0" cy="-9" r="5" fill="var(--ink)" />
        <path d="M0,-4 L0,6 M0,0 L-6,4 M0,0 L6,4 M0,6 L-4,14 M0,6 L4,14" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** Sparks: a small starburst that plays over a recognition moment. */
export function Sparks({ run }: { run: boolean }) {
  if (!run) return null;
  return (
    <span className="sparks" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)`, animationDelay: `${i * 0.03}s` }} />
      ))}
    </span>
  );
}

/* ---- hidden finds ----------------------------------------------------------
   Small rewards for the curious. None of them touch data or scores. */

const FINDS = [
  { id: "konami", label: "Golden berry", hint: "The old cheat code still works." },
  { id: "logo", label: "Eruption", hint: "Tap the volcano seven times." },
  { id: "grove", label: "Ecosystem proverb", hint: "Hold the mountain." },
];

export function useEasterEggs() {
  const [found, setFound] = React.useState<string[]>([]);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setFound(JSON.parse(localStorage.getItem("summit-finds") ?? "[]") as string[]);
    } catch { /* none yet */ }
  }, []);

  const unlock = React.useCallback((id: string, message: string) => {
    setFound((prev) => {
      if (prev.includes(id)) { setToast(message); return prev; }
      const next = [...prev, id];
      localStorage.setItem("summit-finds", JSON.stringify(next));
      setToast(`${message}  (${next.length} of ${FINDS.length} found)`);
      return next;
    });
    setTimeout(() => setToast(null), 4200);
  }, []);

  // Konami code.
  React.useEffect(() => {
    const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let i = 0;
    const onKey = (e: KeyboardEvent) => {
      i = e.key === seq[i] || e.key.toLowerCase() === seq[i] ? i + 1 : 0;
      if (i === seq.length) {
        i = 0;
        document.documentElement.setAttribute("data-golden", "");
        unlock("konami", "Golden berry season. The grove turns gold for a moment.");
        setTimeout(() => document.documentElement.removeAttribute("data-golden"), 9000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlock]);

  return { found, total: FINDS.length, toast, unlock, list: FINDS };
}

export function EggToast({ toast }: { toast: string | null }) {
  if (!toast) return null;
  return <div className="egg-toast" role="status">{toast}</div>;
}

/** Confetti-free celebration: berries drifting up from the footer. */
export function BerryBurst({ run }: { run: boolean }) {
  if (!run) return null;
  return (
    <div className="berry-burst" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ left: `${6 + i * 6.6}%`, animationDelay: `${(i % 7) * 0.12}s` }} />
      ))}
    </div>
  );
}
