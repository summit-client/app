/**
 * @summit/analytics — the deterministic clinical analytics engine.
 *
 * ENGINEERING PRINCIPLE (see ARCHITECTURE.md): AI never does the math. Every
 * mean, rate, slope, threshold and window here is computed by plain code, and
 * every detector returns a structured EVIDENCE object so the UI can always
 * answer "Why am I seeing this?". The LLM's only later role is to narrate
 * these results — never to produce them.
 *
 * Pure TypeScript, zero dependencies, no I/O: callers fetch rows, this module
 * reasons over them. That keeps it unit-testable and provably deterministic.
 */

/* ---- inputs ---------------------------------------------------------------- */

export interface SessionPoint {
  date: string;              // ISO date of the session
  pct: number | null;        // percentage modes
  count: number | null;      // frequency/rate modes
  opportunities: number;     // trials/blocks/steps observed that session
}

export interface ProgramFacts {
  programId: string;
  clientId: number;
  clientName: string;
  goalName: string;
  domain: string | null;
  targetDirection: "increase" | "decrease";
  masteryPct: number;
  masteryConsecutive: number;
  series: SessionPoint[];            // oldest → newest
  phaseChanges: { date: string; label: string }[];
  integrityChecks: { stepsCorrect: number; stepsTotal: number; date: string }[];
  noteThemes: string[];              // clinician_observation evidence (from notes)
  caregiverGoalsOpenDays: number | null; // days since oldest unaddressed caregiver goal
  masteredAt: string | null;
  hasNextGoalProgrammed: boolean;
  goalBankNextOptions: string[];     // approved "next" relations for this goal
}

export interface AnalyticsConfig {
  plateauWindowDays: number;         // window analyzed for plateau
  plateauSlopePerDay: number;        // |slope| below this = flat
  minSessionsForVerdict: number;     // sufficiency criterion
  regressionDropPct: number;         // recent mean below prior mean by this = regression
  insufficientWindowDays: number;
  insufficientMinPoints: number;
  approachingMasteryGap: number;     // qualifying sessions remaining <= this
}

export const DEFAULT_CONFIG: AnalyticsConfig = {
  plateauWindowDays: 30,
  plateauSlopePerDay: 0.15,
  minSessionsForVerdict: 6,
  regressionDropPct: 10,
  insufficientWindowDays: 14,
  insufficientMinPoints: 3,
  approachingMasteryGap: 1,
};

/* ---- primitives (the math the AI is forbidden to do) ----------------------- */

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return round1(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : round1((s[m - 1] + s[m]) / 2);
}

/** Least-squares slope in units per day over the series' pct values. */
export function slopePerDay(series: SessionPoint[]): number | null {
  const pts = series.filter((p) => p.pct != null);
  if (pts.length < 2) return null;
  const t0 = Date.parse(pts[0].date);
  const xs = pts.map((p) => (Date.parse(p.date) - t0) / 86_400_000);
  const ys = pts.map((p) => p.pct as number);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : round2(num / den);
}

export function integrityPct(checks: ProgramFacts["integrityChecks"]): number | null {
  const total = checks.reduce((s, c) => s + c.stepsTotal, 0);
  if (!total) return null;
  return round1((checks.reduce((s, c) => s + c.stepsCorrect, 0) / total) * 100);
}

function windowSplit(series: SessionPoint[], days: number): { first: SessionPoint[]; recent: SessionPoint[] } {
  const cutoff = Date.now() - days * 86_400_000;
  const inWindow = series.filter((p) => Date.parse(p.date) >= cutoff);
  const half = Math.floor(inWindow.length / 2);
  return { first: inWindow.slice(0, half), recent: inWindow.slice(half) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---- detectors: each returns verdict + full evidence ----------------------- */

export interface Evidence { [fact: string]: string | number | boolean | null }
export interface Verdict { flagged: boolean; evidence: Evidence }

export function detectPlateau(f: ProgramFacts, cfg = DEFAULT_CONFIG): Verdict {
  const cutoff = Date.now() - cfg.plateauWindowDays * 86_400_000;
  const window = f.series.filter((p) => Date.parse(p.date) >= cutoff && p.pct != null);
  const { first, recent } = windowSplit(f.series, cfg.plateauWindowDays);
  const firstMean = mean(first.map((p) => p.pct as number).filter((x) => x != null));
  const recentMean = mean(recent.map((p) => p.pct as number).filter((x) => x != null));
  const slope = slopePerDay(window);
  const phaseChangesInWindow = f.phaseChanges.filter((c) => Date.parse(c.date) >= cutoff).length;
  const sufficient = window.length >= cfg.minSessionsForVerdict;
  const flat = slope != null && Math.abs(slope) <= cfg.plateauSlopePerDay;
  const belowMastery = recentMean != null && (
    f.targetDirection === "increase" ? recentMean < f.masteryPct : recentMean > 100 - f.masteryPct
  );
  const flagged = sufficient && flat && belowMastery && phaseChangesInWindow === 0;
  const plateauDays = window.length
    ? Math.round((Date.now() - Date.parse(window[0].date)) / 86_400_000)
    : 0;
  return {
    flagged,
    evidence: {
      "eligible sessions analyzed": window.length,
      "opportunities": window.reduce((s, p) => s + p.opportunities, 0),
      "first-period mean %": firstMean,
      "recent-period mean %": recentMean,
      "slope (pts/day)": slope,
      "plateau slope threshold": cfg.plateauSlopePerDay,
      "phase changes in window": phaseChangesInWindow,
      "sufficient data criterion met": sufficient,
      "plateau period (days)": plateauDays,
    },
  };
}

export function detectRegression(f: ProgramFacts, cfg = DEFAULT_CONFIG): Verdict {
  const { first, recent } = windowSplit(f.series, cfg.plateauWindowDays);
  const firstMean = mean(first.map((p) => p.pct as number).filter((x) => x != null));
  const recentMean = mean(recent.map((p) => p.pct as number).filter((x) => x != null));
  const sufficient = first.length + recent.length >= cfg.minSessionsForVerdict;
  let drop: number | null = null;
  let flagged = false;
  if (firstMean != null && recentMean != null) {
    drop = round1(f.targetDirection === "increase" ? firstMean - recentMean : recentMean - firstMean);
    flagged = sufficient && drop >= cfg.regressionDropPct;
  }
  return {
    flagged,
    evidence: {
      "first-period mean %": firstMean,
      "recent-period mean %": recentMean,
      "change against target direction": drop,
      "regression threshold (pts)": cfg.regressionDropPct,
      "sufficient data criterion met": sufficient,
    },
  };
}

export function detectMasteryCandidate(f: ProgramFacts, cfg = DEFAULT_CONFIG): Verdict {
  const qualifying = (p: SessionPoint) =>
    p.pct != null &&
    (f.targetDirection === "increase" ? p.pct >= f.masteryPct : p.pct <= 100 - f.masteryPct);
  let streak = 0;
  for (let i = f.series.length - 1; i >= 0 && qualifying(f.series[i]); i--) streak++;
  const remaining = Math.max(f.masteryConsecutive - streak, 0);
  const flagged = streak > 0 && remaining <= cfg.approachingMasteryGap && f.masteredAt == null;
  return {
    flagged,
    evidence: {
      "mastery criterion": `${f.masteryPct}% × ${f.masteryConsecutive} consecutive sessions`,
      "current qualifying streak": streak,
      "additional qualifying sessions required": remaining,
      "latest session %": f.series.at(-1)?.pct ?? null,
    },
  };
}

export function detectInsufficientData(f: ProgramFacts, cfg = DEFAULT_CONFIG): Verdict {
  const cutoff = Date.now() - cfg.insufficientWindowDays * 86_400_000;
  const recent = f.series.filter((p) => Date.parse(p.date) >= cutoff);
  const flagged = recent.length < cfg.insufficientMinPoints && f.masteredAt == null;
  return {
    flagged,
    evidence: {
      "window (days)": cfg.insufficientWindowDays,
      "data points in window": recent.length,
      "minimum required": cfg.insufficientMinPoints,
    },
  };
}

export function detectMasteredWithoutNext(f: ProgramFacts): Verdict {
  const flagged = f.masteredAt != null && !f.hasNextGoalProgrammed;
  const daysSince = f.masteredAt ? Math.round((Date.now() - Date.parse(f.masteredAt)) / 86_400_000) : null;
  return {
    flagged,
    evidence: {
      "mastered on": f.masteredAt,
      "days since mastery": daysSince,
      "next-step goal programmed": f.hasNextGoalProgrammed,
      "approved Goal Bank next options": f.goalBankNextOptions.join("; ") || "none on file",
    },
  };
}

/* ---- temporal intelligence: before/after an event -------------------------- */

export function compareWindows(f: ProgramFacts, splitDateISO: string): Evidence {
  const split = Date.parse(splitDateISO);
  const before = f.series.filter((p) => Date.parse(p.date) < split && p.pct != null);
  const after = f.series.filter((p) => Date.parse(p.date) >= split && p.pct != null);
  const variability = (pts: SessionPoint[]) => {
    const m = mean(pts.map((p) => p.pct as number));
    if (m == null || pts.length < 2) return null;
    return round1(Math.sqrt(pts.reduce((s, p) => s + ((p.pct as number) - m) ** 2, 0) / (pts.length - 1)));
  };
  return {
    "split date": splitDateISO,
    "before: sessions": before.length,
    "before: mean %": mean(before.map((p) => p.pct as number)),
    "before: variability (sd)": variability(before),
    "after: sessions": after.length,
    "after: mean %": mean(after.map((p) => p.pct as number)),
    "after: variability (sd)": variability(after),
    "after: slope (pts/day)": slopePerDay(after),
  };
}

/* ---- the attention engine --------------------------------------------------- */

export type Bucket =
  | "possible_plateau" | "possible_regression" | "approaching_mastery"
  | "insufficient_data" | "mastered_without_next" | "progressing";

export const BUCKET_LABEL: Record<Bucket, string> = {
  possible_plateau: "Possible Plateau",
  possible_regression: "Possible Regression",
  approaching_mastery: "Approaching Mastery",
  insufficient_data: "Insufficient Recent Data",
  mastered_without_next: "Mastered — No Next Goal",
  progressing: "Progressing Normally",
};

export interface AttentionItem {
  bucket: Bucket;
  programId: string;
  clientId: number;
  clientName: string;
  goalName: string;
  domain: string | null;
  headline: string;                       // deterministic one-line metric summary
  integrityPct: number | null;
  noteThemes: string[];                   // clinician_observation — labelled as such in UI
  goalBankNextOptions: string[];          // provenance: organization Goal Bank
  evidence: Evidence;                     // the full "why am I seeing this"
}

/** Classify one program into its most urgent bucket, with evidence. */
export function classifyProgram(f: ProgramFacts, cfg = DEFAULT_CONFIG): AttentionItem {
  const integ = integrityPct(f.integrityChecks);
  const base = {
    programId: f.programId,
    clientId: f.clientId, clientName: f.clientName, goalName: f.goalName,
    domain: f.domain, integrityPct: integ, noteThemes: f.noteThemes,
    goalBankNextOptions: f.goalBankNextOptions,
  };
  const mastered = detectMasteredWithoutNext(f);
  if (mastered.flagged) {
    return { ...base, bucket: "mastered_without_next", evidence: mastered.evidence,
      headline: `Mastered ${mastered.evidence["days since mastery"]} days ago — no next-step goal programmed` };
  }
  const regression = detectRegression(f, cfg);
  if (regression.flagged) {
    return { ...base, bucket: "possible_regression", evidence: regression.evidence,
      headline: `Mean moved ${regression.evidence["change against target direction"]} pts against the target direction` };
  }
  const plateau = detectPlateau(f, cfg);
  if (plateau.flagged) {
    return { ...base, bucket: "possible_plateau", evidence: plateau.evidence,
      headline: `Plateau ${plateau.evidence["plateau period (days)"]} days · recent mean ${plateau.evidence["recent-period mean %"]}%` };
  }
  const mastery = detectMasteryCandidate(f, cfg);
  if (mastery.flagged) {
    return { ...base, bucket: "approaching_mastery", evidence: mastery.evidence,
      headline: `${mastery.evidence["additional qualifying sessions required"]} qualifying session(s) from mastery` };
  }
  const insufficient = detectInsufficientData(f, cfg);
  if (insufficient.flagged) {
    return { ...base, bucket: "insufficient_data", evidence: insufficient.evidence,
      headline: `${insufficient.evidence["data points in window"]} data point(s) in the last ${cfg.insufficientWindowDays} days` };
  }
  return { ...base, bucket: "progressing", evidence: {
    "recent mean %": mean(f.series.slice(-5).map((p) => p.pct as number).filter((x) => x != null)),
    "slope (pts/day)": slopePerDay(f.series.slice(-8)),
  }, headline: "On track" };
}

/** "What needs my attention today?" — the whole caseload, bucketed. */
export function attention(caseload: ProgramFacts[], cfg = DEFAULT_CONFIG): {
  counts: Partial<Record<Bucket, number>>;
  items: AttentionItem[];
} {
  const items = caseload.map((f) => classifyProgram(f, cfg));
  const counts: Partial<Record<Bucket, number>> = {};
  for (const i of items) counts[i.bucket] = (counts[i.bucket] ?? 0) + 1;
  const order: Bucket[] = ["possible_regression", "possible_plateau", "mastered_without_next",
    "approaching_mastery", "insufficient_data", "progressing"];
  items.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
  return { counts, items };
}

/* ---- canonical supervisor queries (structured filters, not paragraphs) ------ */

export interface CannedQuery {
  id: string;
  label: string;
  run: (caseload: ProgramFacts[], cfg?: AnalyticsConfig) => AttentionItem[];
}

export const SUPERVISOR_QUERIES: CannedQuery[] = [
  {
    id: "plateau-high-integrity",
    label: "Plateaued 30+ days with treatment integrity above 85%",
    run: (cs, cfg = DEFAULT_CONFIG) =>
      cs.map((f) => ({ f, v: detectPlateau(f, cfg), i: integrityPct(f.integrityChecks) }))
        .filter((x) => x.v.flagged && x.i != null && x.i > 85)
        .map((x) => ({ ...classifyProgram(x.f, cfg), bucket: "possible_plateau" as Bucket, evidence: x.v.evidence })),
  },
  {
    id: "mastered-no-next",
    label: "Mastered in the last 14 days without a next-step goal",
    run: (cs) =>
      cs.filter((f) => {
        const v = detectMasteredWithoutNext(f);
        return v.flagged && Number(v.evidence["days since mastery"] ?? 99) <= 14;
      }).map((f) => classifyProgram(f)),
  },
  {
    id: "sparse-data",
    label: "Fewer than 3 data points on an active goal in 2 weeks",
    run: (cs, cfg = DEFAULT_CONFIG) =>
      cs.filter((f) => detectInsufficientData(f, cfg).flagged).map((f) => classifyProgram(f, cfg)),
  },
  {
    id: "approaching-mastery",
    label: "Goals approaching mastery",
    run: (cs, cfg = DEFAULT_CONFIG) =>
      cs.filter((f) => detectMasteryCandidate(f, cfg).flagged).map((f) => classifyProgram(f, cfg)),
  },
  {
    id: "notes-vs-data",
    label: "Notes describe improvement but data remain stable",
    run: (cs, cfg = DEFAULT_CONFIG) =>
      cs.filter((f) => {
        const flat = detectPlateau(f, cfg).flagged;
        const improving = f.noteThemes.some((t) => /improv|progress|better|increase/i.test(t));
        return flat && improving;
      }).map((f) => classifyProgram(f, cfg)),
  },
];
