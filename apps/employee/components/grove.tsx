"use client";

import * as React from "react";

/**
 * The visual language of the ecosystem: a Serviceberry grove that grows with
 * the team's score, a volcano that wakes at milestones, and summit peaks with
 * an altitude marker. A healthy grove shares its light, so the tree fills as
 * the site score climbs rather than as any one person's does.
 *
 * Hidden finds live at the bottom of this file. Nothing here changes data.
 */

/** Serviceberry tree. Canopy and fruit grow with `percent` (0 to 100). */
export function ServiceberryTree({ percent, size = 180, golden = false }: { percent: number; size?: number; golden?: boolean }) {
  const p = Math.max(0, Math.min(100, percent));
  const grow = p / 100;
  const berries = Math.round(grow * 11);
  const canopy = 0.45 + grow * 0.55;
  const leafFill = golden ? "#d9a412" : "var(--good)";

  return (
    <svg viewBox="0 0 120 130" width={size} height={size} role="img"
      aria-label={`Grove health ${p} percent`} style={{ display: "block", overflow: "visible" }}>
      <ellipse cx="60" cy="122" rx={26 + grow * 10} ry="5" fill="var(--surface-2)" />
      <path d="M58 122 L58 74 Q60 68 62 74 L62 122 Z" fill="#6b4f3a" />
      <path d="M60 92 L44 78" stroke="#6b4f3a" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M60 88 L76 74" stroke="#6b4f3a" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M60 100 L48 92" stroke="#6b4f3a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <g style={{ transformOrigin: "60px 78px", transform: `scale(${canopy})`, transition: "transform 700ms cubic-bezier(.2,.8,.3,1)" }}>
        <circle cx="60" cy="52" r="24" fill={leafFill} opacity="0.9" />
        <circle cx="42" cy="64" r="17" fill={leafFill} opacity="0.78" />
        <circle cx="78" cy="64" r="17" fill={leafFill} opacity="0.78" />
        <circle cx="60" cy="70" r="15" fill={leafFill} opacity="0.7" />
      </g>
      {Array.from({ length: berries }, (_, i) => {
        const a = (i / 11) * Math.PI * 2;
        const r = 20 + (i % 3) * 6;
        return (
          <circle key={i} cx={60 + Math.cos(a) * r * canopy} cy={58 + Math.sin(a) * r * 0.8 * canopy} r="3"
            fill={golden ? "#f0c419" : "#c0334d"}
            style={{ transition: "all 700ms ease", opacity: 0.95 }} />
        );
      })}
    </svg>
  );
}

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

/* ---- hidden finds ----------------------------------------------------------
   Small rewards for the curious. None of them touch data or scores. */

const FINDS = [
  { id: "konami", label: "Golden berry", hint: "The old cheat code still works." },
  { id: "logo", label: "Eruption", hint: "Tap the volcano seven times." },
  { id: "grove", label: "Serviceberry proverb", hint: "Hold the tree." },
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
