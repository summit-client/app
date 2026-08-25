/**
 * The evidence-first progress-report pipeline (steps 1–8 of 10; steps 9–10,
 * clinician review and sign+version, live in the app workspace and schema).
 *
 *   1 retrieve (injected, date-bounded, IDs preserved)
 *   2 deterministic analytics            — @summit/analytics, never the LLM
 *   3 evidence packet                    — the only clinical input to the model
 *   4 note-theme extraction              — separate call, evidence-typed
 *   5 note–data consistency engine       — deterministic, never auto-resolved
 *   6 narrative drafting                 — approved provider, language only
 *   7 sentence-level provenance          — blocks carry evidenceIds + type
 *   8 validation pass                    — deterministic number/date check
 */

import {
  DEFAULT_CONFIG, detectInsufficientData, detectMasteryCandidate, detectPlateau,
  integrityPct, mean, slopePerDay, type ProgramFacts, type SessionPoint,
} from "@summit/analytics";
import type {
  ClinicalAIProvider, ClinicalEvidencePacket, GeneratedClinicalReport, GoalEvidence,
  NoteDataConsistency, NoteEvidenceInput, ReportGenerationOptions, SourceRef,
  StructuredNoteThemes,
} from "../types";
import { minimizePacket, stableHash } from "../provider";

/* ---- step 1: retrieval contract (the app implements this) ------------------- */

export interface RetrievedClinicalData {
  client: { id: number; displayName: string };
  clinicId: string | null;
  facts: ProgramFacts[];                       // series already date-bounded
  notes: { id: string; date: string; excerpts: string[]; programIds: string[] }[];
  incidents: { id: string; date: string; suspectedFunction: string | null }[];
  clinicalEvents: { date: string; kind: string; description: string; sourceId: string }[];
  caregiverGoals: { open: number; addressed: number; reports: string[] };
  sessionsHeld: number;
}

export interface EvidenceRetriever {
  retrieve(input: {
    clientId: number;
    startDate: string;
    endDate: string;
    goalFilterIds?: string[];
  }): Promise<RetrievedClinicalData>;
}

/* ---- steps 2–3: deterministic analytics → packet ---------------------------- */

function baselineOf(series: SessionPoint[]): number | null {
  return mean(series.slice(0, Math.max(1, Math.floor(series.length / 4)))
    .map((p) => p.pct).filter((x): x is number => x != null));
}

function variabilityOf(series: SessionPoint[]): number | null {
  const ys = series.map((p) => p.pct).filter((x): x is number => x != null);
  const m = mean(ys);
  if (m == null || ys.length < 2) return null;
  return Math.round(Math.sqrt(ys.reduce((s, y) => s + (y - m) ** 2, 0) / (ys.length - 1)) * 10) / 10;
}

/* ---- step 5: note–data consistency (deterministic, never auto-resolved) ----- */

export function noteDataConsistency(
  f: ProgramFacts,
  themes: StructuredNoteThemes | null,
): NoteDataConsistency {
  const recentMean = mean(f.series.slice(-5).map((p) => p.pct).filter((x): x is number => x != null));
  if (f.series.length < 3) {
    return { status: "INSUFFICIENT_DATA", detail: `Only ${f.series.length} data point(s) in the period; documentation cannot be cross-checked against measurement.` };
  }
  const slope = slopePerDay(f.series);
  const flat = slope != null && Math.abs(slope) <= DEFAULT_CONFIG.plateauSlopePerDay;
  const improvingData = slope != null && slope > DEFAULT_CONFIG.plateauSlopePerDay;
  const notesImprove = !!themes && [...themes.documentedStrengths, ...themes.repeatedThemes]
    .some((t) => /improv|progress|better|increase|gain/i.test(t.theme));
  const notesMention = !!themes && Object.values(themes).some((arr) => arr.length > 0);

  if (notesImprove && flat) {
    return {
      status: "POSSIBLE_DISCREPANCY",
      detail: `Documentation describes improvement while quantitative performance remained relatively stable (recent mean ${recentMean ?? "n/a"}%, slope ${slope}/day).`,
    };
  }
  if (improvingData && !notesImprove && notesMention) {
    return {
      status: "OBJECTIVE_PROGRESS_NOT_REFLECTED_IN_NOTES",
      detail: `Measured performance is improving (slope ${slope}/day) but documentation does not describe the gain.`,
    };
  }
  return { status: "CONSISTENT", detail: "Documentation and quantitative data are consistent for this period." };
}

/* ---- step 8: deterministic validation of the draft --------------------------- */

const NUM_RE = /\d+(?:\.\d+)?%?/g;

function allowedNumbers(packet: ClinicalEvidencePacket): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") { out.add(String(v)); out.add(String(Math.round(v))); }
    else if (typeof v === "string") for (const m of v.match(NUM_RE) ?? []) out.add(m.replace("%", ""));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(packet);
  return out;
}

export function validateReport(report: GeneratedClinicalReport, packet: ClinicalEvidencePacket): GeneratedClinicalReport {
  const allowed = allowedNumbers(packet);
  return {
    ...report,
    blocks: report.blocks.map((b) => {
      const unsupported = (b.text.match(NUM_RE) ?? [])
        .map((n) => n.replace("%", ""))
        .filter((n) => !allowed.has(n));
      return {
        ...b,
        validation: unsupported.length
          ? { status: "flagged" as const, unsupportedValues: [...new Set(unsupported)] }
          : { status: "verified" as const, unsupportedValues: [] },
      };
    }),
  };
}

/* ---- the orchestrator --------------------------------------------------------- */

export interface ReportPipelineInput {
  clientId: number;
  startDate: string;
  endDate: string;
  reportType: "progress_report";
  goalFilterIds?: string[];
  options: ReportGenerationOptions;
}

export async function buildEvidencePacket(
  retriever: EvidenceRetriever,
  provider: ClinicalAIProvider,
  input: Omit<ReportPipelineInput, "options" | "reportType">,
): Promise<ClinicalEvidencePacket> {
  // 1 — date-bounded retrieval, IDs preserved
  const data = await retriever.retrieve(input);

  // 4 — note themes (separate model call; on failure the packet proceeds without them)
  let themes: StructuredNoteThemes | null = null;
  if (data.notes.length) {
    const noteInput: NoteEvidenceInput = {
      clientDisplayName: data.client.displayName,
      notes: data.notes.map((n) => ({ id: n.id, date: n.date, excerpts: n.excerpts })),
    };
    try { themes = await provider.extractNoteThemes(noteInput); } catch { themes = null; }
  }

  // 2–3 — deterministic analytics per goal → packet
  const goals: GoalEvidence[] = data.facts.map((f) => {
    const mastery = detectMasteryCandidate(f);
    const plateau = detectPlateau(f);
    const insufficient = detectInsufficientData(f);
    const masteryStatus: GoalEvidence["masteryStatus"] =
      f.masteredAt ? "mastered"
      : insufficient.flagged ? "insufficient_data"
      : mastery.flagged ? "approaching"
      : plateau.flagged ? "not_met" : "not_met";
    const sources: SourceRef[] = [
      { kind: "metric", id: `metric_${f.programId}`, label: `${f.goalName} computed metrics` },
      ...data.notes.filter((n) => n.programIds.includes(f.programId))
        .map((n): SourceRef => ({ kind: "session_note", id: n.id })),
    ];
    return {
      goalId: f.programId, programId: f.programId, goalName: f.goalName, domain: f.domain,
      baselinePct: baselineOf(f.series),
      currentMeanPct: mean(f.series.slice(-5).map((p) => p.pct).filter((x): x is number => x != null)),
      trendSlopePerDay: slopePerDay(f.series),
      variabilitySd: variabilityOf(f.series),
      sessionsAnalyzed: f.series.length,
      opportunitiesAnalyzed: f.series.reduce((s, p) => s + p.opportunities, 0),
      masteryStatus,
      masteryCriteria: `${f.masteryPct}% across ${f.masteryConsecutive} consecutive sessions, 2 settings, 2 people`,
      masteryEvidence: mastery.evidence,
      phases: f.phaseChanges.map((c) => ({ name: "intervention", label: c.label, startedAt: c.date, endedAt: null })),
      treatmentChanges: f.phaseChanges.map((c, i) => ({ date: c.date, kind: "phase_change", rationale: c.label, outcome: null, sourceId: `phase_${f.programId}_${i}` })),
      soapThemes: themes,
      documentedBarriers: (themes?.documentedBarriers ?? []).map((t) => t.theme),
      caregiverReports: (themes?.caregiverReports ?? []).map((t) => t.theme),
      treatmentIntegrityPct: integrityPct(f.integrityChecks),
      consistency: noteDataConsistency(f, themes),
      sourceReferences: sources,
    };
  });

  const byFunction: Record<string, number> = {};
  for (const i of data.incidents) {
    const k = i.suspectedFunction ?? "unclear";
    byFunction[k] = (byFunction[k] ?? 0) + 1;
  }

  const packetNoHash: Omit<ClinicalEvidencePacket, "packetHash"> = {
    packetId: `pkt-${input.clientId}-${input.startDate}-${input.endDate}`,
    client: data.client,
    clinicId: data.clinicId,
    reportingPeriod: { start: input.startDate, end: input.endDate },
    reportType: "progress_report",
    serviceSummary: {
      sessionsHeld: data.sessionsHeld,
      sessionsAnalyzed: Math.max(...goals.map((g) => g.sessionsAnalyzed), 0),
      firstSessionDate: data.facts[0]?.series[0]?.date ?? null,
      lastSessionDate: data.facts[0]?.series.at(-1)?.date ?? null,
    },
    goals,
    behaviourSummary: {
      incidents: data.incidents.length,
      byFunction,
      sourceReferences: data.incidents.map((i): SourceRef => ({ kind: "behaviour_incident", id: i.id })),
    },
    caregiverTraining: { goalsOpen: data.caregiverGoals.open, goalsAddressed: data.caregiverGoals.addressed, reports: data.caregiverGoals.reports },
    clinicalEvents: data.clinicalEvents,
    dataQualityFlags: data.facts
      .filter((f) => detectInsufficientData(f).flagged)
      .map((f) => `${f.goalName}: ${f.series.filter((p) => Date.parse(p.date) >= Date.now() - 14 * 86_400_000).length} data point(s) in 14 days`),
    noteDataConsistencyFlags: goals.filter((g) => g.consistency.status !== "CONSISTENT").map((g) => `${g.goalName}: ${g.consistency.detail}`),
    sources: [
      ...goals.flatMap((g) => g.sourceReferences),
      ...data.incidents.map((i): SourceRef => ({ kind: "behaviour_incident", id: i.id })),
    ],
  };
  return { ...packetNoHash, packetHash: stableHash(packetNoHash) };
}

export async function runReportPipeline(
  retriever: EvidenceRetriever,
  provider: ClinicalAIProvider,
  input: ReportPipelineInput,
): Promise<{ packet: ClinicalEvidencePacket; report: GeneratedClinicalReport }> {
  const packet = await buildEvidencePacket(retriever, provider, input);
  // minimum-necessary context, then draft (6–7), then deterministic validation (8)
  const minimized = minimizePacket(packet, { goalFilterIds: input.goalFilterIds });
  const draft = await provider.draftProgressReport(minimized, input.options);
  const report = validateReport(draft, packet);
  return { packet, report };
}
