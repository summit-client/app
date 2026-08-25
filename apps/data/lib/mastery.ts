import type { Program, SessionProgramSummary, TrialEvent } from "./types";

/** Percentage for a batch of events, by mode. Null when not meaningful yet. */
export function sessionPercent(program: Program, events: TrialEvent[]): number | null {
  const ev = events.filter((e) => e.programId === program.id);
  if (!ev.length) return null;
  switch (program.mode) {
    case "dtt": {
      const trials = ev.filter((e) => ["Y", "P", "N"].includes(e.code));
      if (!trials.length) return null;
      const y = trials.filter((e) => e.code === "Y").length;
      return Math.round((y / trials.length) * 100);
    }
    case "task_analysis": {
      const steps = new Map<number, string>();
      for (const e of ev) if (e.stepPosition != null) steps.set(e.stepPosition, e.code);
      if (!steps.size) return null;
      const independent = [...steps.values()].filter((c) => c === "Y").length;
      return Math.round((independent / (program.steps.length || steps.size)) * 100);
    }
    case "interval": {
      const blocks = ev.filter((e) => e.code === "hit" || e.code === "miss");
      if (!blocks.length) return null;
      return Math.round((blocks.filter((e) => e.code === "hit").length / blocks.length) * 100);
    }
    case "net": {
      const t = ev.filter((e) => e.code === "spont" || e.code === "prompted");
      if (!t.length) return null;
      return Math.round((t.filter((e) => e.code === "spont").length / t.length) * 100);
    }
    case "yni": {
      const t = ev.filter((e) => ["yes", "no", "inc"].includes(e.code));
      if (!t.length) return null;
      return Math.round((t.filter((e) => e.code === "yes").length / t.length) * 100);
    }
    default:
      return null; // frequency/duration/abc summarize by count/seconds, not %
  }
}

/** Frequency count and rate per hour over the elapsed session time. */
export function frequencySummary(programId: string, events: TrialEvent[], startedAt: number) {
  const count = events.filter((e) => e.programId === programId && e.code === "+").length
    - events.filter((e) => e.programId === programId && e.code === "-").length;
  const hours = Math.max((Date.now() - startedAt) / 3_600_000, 1 / 60);
  return { count: Math.max(count, 0), ratePerHour: Math.round((Math.max(count, 0) / hours) * 10) / 10 };
}

/** House mastery standard: N consecutive sessions at/above the criterion percent. */
export function masteryCheck(program: Program, withToday: number | null): {
  met: boolean; window: number[];
} {
  const history = withToday == null ? program.last5 : [...program.last5, withToday];
  const window = history.slice(-program.masteryConsecutive);
  const met =
    window.length >= program.masteryConsecutive &&
    window.every((p) =>
      program.targetDirection === "increase" ? p >= program.masteryPct : p <= 100 - program.masteryPct,
    );
  return { met, window };
}

/**
 * Derived per-program rollup for a finished session. Numerator/denominator are
 * preserved alongside the calculated value so nothing collapses to a bare
 * percentage — the raw observations stay authoritative and every future metric
 * (independence, prompt dependency, variability, integrity) stays computable.
 */
export function deriveProgramSummary(
  program: Program,
  ev: TrialEvent[],
  sessionId: number,
  _elapsedHours: number, // rate_per_hour is a display transform of count ÷ hours; the count is what's stored
): SessionProgramSummary | null {
  if (!ev.length) return null;
  const base = { sessionId, programId: program.id, rawObservationCount: ev.length };
  switch (program.mode) {
    case "dtt": {
      const trials = ev.filter((e) => ["Y", "P", "N"].includes(e.code));
      if (!trials.length) return null;
      const y = trials.filter((e) => e.code === "Y").length;
      return { ...base, numerator: y, denominator: trials.length, calculatedValue: Math.round((y / trials.length) * 100), metricType: "percent_independent" };
    }
    case "net": {
      const t = ev.filter((e) => e.code === "spont" || e.code === "prompted");
      if (!t.length) return null;
      const s = t.filter((e) => e.code === "spont").length;
      return { ...base, numerator: s, denominator: t.length, calculatedValue: Math.round((s / t.length) * 100), metricType: "percent_independent" };
    }
    case "yni": {
      const t = ev.filter((e) => ["yes", "no", "inc"].includes(e.code));
      if (!t.length) return null;
      const y = t.filter((e) => e.code === "yes").length;
      return { ...base, numerator: y, denominator: t.length, calculatedValue: Math.round((y / t.length) * 100), metricType: "percent_independent" };
    }
    case "task_analysis": {
      const steps = new Map<number, string>();
      for (const e of ev) if (e.stepPosition != null) steps.set(e.stepPosition, e.code);
      if (!steps.size) return null;
      const ind = [...steps.values()].filter((c) => c === "Y").length;
      const total = program.steps.length || steps.size;
      return { ...base, numerator: ind, denominator: total, calculatedValue: Math.round((ind / total) * 100), metricType: "percent_independent" };
    }
    case "interval": {
      const blocks = ev.filter((e) => e.code === "hit" || e.code === "miss");
      if (!blocks.length) return null;
      const hits = blocks.filter((e) => e.code === "hit").length;
      return { ...base, numerator: hits, denominator: blocks.length, calculatedValue: Math.round((hits / blocks.length) * 100), metricType: "percent_intervals" };
    }
    case "frequency": {
      const count = Math.max(ev.filter((e) => e.code === "+").length - ev.filter((e) => e.code === "-").length, 0);
      return { ...base, numerator: count, denominator: null, calculatedValue: count, metricType: "count" };
    }
    case "duration": {
      const seconds = ev.filter((e) => e.code === "stop").reduce((s, e) => s + (Number(e.note?.replace("s", "")) || 0), 0);
      if (!seconds) return null;
      return { ...base, numerator: seconds, denominator: null, calculatedValue: seconds, metricType: "total_seconds" };
    }
    case "abc":
      return { ...base, numerator: null, denominator: null, calculatedValue: null, metricType: "observations" };
  }
}

export function trendArrow(last5: number[]): "up" | "down" | "flat" {
  if (last5.length < 2) return "flat";
  const d = last5[last5.length - 1] - last5[last5.length - 2];
  return d > 2 ? "up" : d < -2 ? "down" : "flat";
}
