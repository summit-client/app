/**
 * Case Review + Supervision Brief — two views over the same evidence packet.
 * Both are DETERMINISTIC: categories, metrics and review questions come from
 * computed evidence and rule tables, so they work with no model call at all.
 * (An LLM may later garnish the brief with narrative; it will never produce
 * the categories or numbers.)
 */

import type { ClinicalEvidencePacket, GoalEvidence } from "../types";

/* ---- Case Review ------------------------------------------------------------- */

export type ReviewCategory =
  | "progressing_normally" | "approaching_mastery" | "review_recommended"
  | "insufficient_data" | "possible_plateau" | "possible_regression"
  | "implementation_concern" | "documentation_concern";

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  progressing_normally: "Progressing Normally",
  approaching_mastery: "Approaching Mastery",
  review_recommended: "Review Recommended",
  insufficient_data: "Insufficient Data",
  possible_plateau: "Possible Plateau",
  possible_regression: "Possible Regression",
  implementation_concern: "Implementation Concern",
  documentation_concern: "Documentation Concern",
};

const INTEGRITY_CONCERN_BELOW = 80;

export interface CaseReview {
  packetId: string;
  client: { id: number; displayName: string };
  categories: { category: ReviewCategory; goals: { goalId: string; goalName: string; why: string }[] }[];
  potentialNextGoals: { fromGoal: string; options: string[]; source: "goal_bank" }[];
}

function goalCategories(g: GoalEvidence): { category: ReviewCategory; why: string }[] {
  const out: { category: ReviewCategory; why: string }[] = [];
  const slope = g.trendSlopePerDay;

  if (g.masteryStatus === "insufficient_data") {
    out.push({ category: "insufficient_data", why: `${g.sessionsAnalyzed} session(s) analyzed; sufficiency criterion not met.` });
  }
  if (g.masteryStatus === "approaching") {
    out.push({ category: "approaching_mastery", why: String(g.masteryEvidence["additional qualifying sessions required"] ?? "") + " additional qualifying session(s) required." });
  }
  if (slope != null && Math.abs(slope) <= 0.15 && g.currentMeanPct != null && g.currentMeanPct < 80 && g.masteryStatus === "not_met" && g.sessionsAnalyzed >= 6) {
    out.push({ category: "possible_plateau", why: `Slope ${slope}/day within plateau threshold; recent mean ${g.currentMeanPct}%.` });
  }
  if (g.baselinePct != null && g.currentMeanPct != null && g.baselinePct - g.currentMeanPct >= 10) {
    out.push({ category: "possible_regression", why: `Mean moved from ${g.baselinePct}% to ${g.currentMeanPct}% against the target direction.` });
  }
  if (g.treatmentIntegrityPct != null && g.treatmentIntegrityPct < INTEGRITY_CONCERN_BELOW) {
    out.push({ category: "implementation_concern", why: `Treatment integrity ${g.treatmentIntegrityPct}% (below ${INTEGRITY_CONCERN_BELOW}%).` });
  }
  if (g.consistency.status !== "CONSISTENT") {
    out.push({ category: "documentation_concern", why: g.consistency.detail });
  } else if (g.notesAnalyzed === 0 && g.sessionsAnalyzed >= 3) {
    out.push({ category: "documentation_concern", why: `${g.sessionsAnalyzed} sessions analyzed with no linked session notes.` });
  }
  if (g.masteryStatus === "mastered" && g.goalBankNextOptions.length) {
    out.push({ category: "review_recommended", why: "Mastered; next-step programming decision pending (approved Goal Bank options on file)." });
  }
  if (!out.length) out.push({ category: "progressing_normally", why: `Slope ${slope ?? "n/a"}/day; documentation consistent.` });
  return out;
}

export function buildCaseReview(packet: ClinicalEvidencePacket): CaseReview {
  const byCat = new Map<ReviewCategory, { goalId: string; goalName: string; why: string }[]>();
  for (const g of packet.goals) {
    for (const { category, why } of goalCategories(g)) {
      byCat.set(category, [...(byCat.get(category) ?? []), { goalId: g.goalId, goalName: g.goalName, why }]);
    }
  }
  const order: ReviewCategory[] = [
    "possible_regression", "possible_plateau", "implementation_concern", "documentation_concern",
    "insufficient_data", "approaching_mastery", "review_recommended", "progressing_normally",
  ];
  return {
    packetId: packet.packetId,
    client: packet.client,
    categories: order.filter((c) => byCat.has(c)).map((c) => ({ category: c, goals: byCat.get(c)! })),
    potentialNextGoals: packet.goals
      .filter((g) => (g.masteryStatus === "mastered" || g.masteryStatus === "approaching") && g.goalBankNextOptions.length)
      .map((g) => ({ fromGoal: g.goalName, options: g.goalBankNextOptions, source: "goal_bank" as const })),
  };
}

/* ---- Supervision Brief -------------------------------------------------------- */

export interface BriefGoal {
  goalName: string;
  trend: "Plateau" | "Improving" | "Decreasing" | "Insufficient data";
  currentMeanPct: number | null;
  baselinePct: number | null;
  lastPhaseChangeDaysAgo: number | null;
  treatmentIntegrityPct: number | null;
  notePattern: string | null;             // "prompt dependency mentioned in 2 of 3 recent notes"
  masteryLine: string | null;             // "1 additional qualifying session required."
  reviewQuestions: string[];              // deterministic rule table
}

export interface SupervisionBrief {
  packetId: string;
  client: { id: number; displayName: string };
  period: { start: string; end: string };
  goals: BriefGoal[];
  potentialNextGoals: { option: string; reason: string; source: "goal_bank" }[];
  caregiverPriorities: string[];          // caregiver_report, presented as such
}

function trendOf(g: GoalEvidence): BriefGoal["trend"] {
  if (g.masteryStatus === "insufficient_data") return "Insufficient data";
  const s = g.trendSlopePerDay;
  if (s == null) return "Insufficient data";
  if (s > 0.15) return "Improving";
  if (s < -0.15) return "Decreasing";
  return "Plateau";
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
}

function questionsFor(g: GoalEvidence, trend: BriefGoal["trend"]): string[] {
  const q: string[] = [];
  const themes = (g.soapThemes ? [...g.soapThemes.documentedBarriers, ...g.soapThemes.repeatedThemes] : [])
    .map((t) => t.theme.toLowerCase());
  const promptDependent = themes.some((t) => /prompt depend/.test(t));
  const therapistDiff = themes.some((t) => /familiar therapist|differ by therapist/.test(t));

  if (trend === "Plateau") {
    if (promptDependent) q.push("Is prompt fading occurring according to the program?");
    if (therapistDiff || promptDependent) q.push("Does performance differ by therapist?");
    q.push("Are motivation variables affecting opportunity quality?");
    if (!promptDependent) q.push("Are the mastery criteria and reinforcement schedule still appropriate?");
  }
  if (trend === "Decreasing") {
    const change = g.treatmentChanges.at(-1);
    if (change) q.push(`Did the ${change.rationale} change on ${change.date} precede the decline? Consider an intermediate step or reverting.`);
    q.push("Have setting events or environmental changes been documented?");
  }
  if (g.masteryStatus === "approaching") {
    q.push("Plan the 2-settings and 2-people confirmation for mastery.");
    q.push("Which generalization context comes next?");
  }
  if (g.masteryStatus === "insufficient_data") {
    q.push("Schedule data collection: the sufficiency criterion is not met this period.");
  }
  if (g.treatmentIntegrityPct != null && g.treatmentIntegrityPct < INTEGRITY_CONCERN_BELOW) {
    q.push(`Schedule a fidelity observation (integrity ${g.treatmentIntegrityPct}%).`);
  }
  if (g.consistency.status === "POSSIBLE_DISCREPANCY") {
    q.push("Documentation and data disagree; review which reflects the sessions.");
  }
  return q;
}

function notePattern(g: GoalEvidence): string | null {
  if (!g.soapThemes) return null;
  const themed = [...g.soapThemes.documentedBarriers, ...g.soapThemes.repeatedThemes];
  if (!themed.length) return null;
  const t = themed[0];
  const n = new Set(t.sourceNoteIds).size;
  return `${t.theme} — mentioned in ${n} of ${Math.max(g.notesAnalyzed, n)} recent notes.`;
}

export function buildSupervisionBrief(packet: ClinicalEvidencePacket): SupervisionBrief {
  return {
    packetId: packet.packetId,
    client: packet.client,
    period: packet.reportingPeriod,
    goals: packet.goals.map((g) => {
      const trend = trendOf(g);
      const remaining = g.masteryEvidence["additional qualifying sessions required"];
      return {
        goalName: g.goalName,
        trend,
        currentMeanPct: g.currentMeanPct,
        baselinePct: g.baselinePct,
        lastPhaseChangeDaysAgo: daysSince(g.treatmentChanges.at(-1)?.date),
        treatmentIntegrityPct: g.treatmentIntegrityPct,
        notePattern: notePattern(g),
        masteryLine: g.masteryStatus === "approaching" && remaining != null
          ? `${remaining} additional qualifying session(s) required.`
          : g.masteryStatus === "mastered" ? "Mastery criterion met this period." : null,
        reviewQuestions: questionsFor(g, trend),
      };
    }),
    potentialNextGoals: packet.goals
      .filter((g) => (g.masteryStatus === "mastered" || g.masteryStatus === "approaching") && g.goalBankNextOptions.length)
      .flatMap((g) => g.goalBankNextOptions.map((o) => ({
        option: o,
        reason: `${g.goalName} is ${g.masteryStatus === "mastered" ? "mastered" : "nearing mastery"} and this is an approved linked progression.`,
        source: "goal_bank" as const,
      }))),
    caregiverPriorities: packet.caregiverTraining.reports,
  };
}
