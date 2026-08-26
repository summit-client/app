"use client";

/**
 * Ecosystem Tracker: OBM-informed monthly scorecards, peer feedback,
 * recognition, and bonus eligibility.
 *
 * Every metric names an observable behaviour. Vague traits ("good attitude",
 * "works hard") are excluded by design. The rating scale is behaviourally
 * anchored 1 to 5. Weights, allowances, thresholds and values are tenant
 * settings, never constants in components.
 *
 * Default domains are modelled on the organization's live monthly self and
 * peer feedback process: self reflection, collaboration and communication,
 * visibility and community engagement, environment, professional growth, and
 * a support question. Administrators reconfigure all of it in Settings.
 */

import { getSetting } from "@summit/settings";

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export const RATING_SCALE: { value: RatingValue; label: string; anchor: string }[] = [
  { value: 1, label: "Very Poor", anchor: "The behaviour is absent, well below expectation, or consistently problematic." },
  { value: 2, label: "Fair / Developing", anchor: "The behaviour is emerging or inconsistent and needs support." },
  { value: 3, label: "Good", anchor: "The employee demonstrates the expected behaviour at the required level." },
  { value: 4, label: "Very Good", anchor: "The behaviour is consistently strong, independent, collaborative and reliable." },
  { value: 5, label: "Excellent", anchor: "Role-model performance: anticipates needs, assists others, demonstrates leadership." },
];

export type SourceKind = "SELF" | "PEER" | "SUPERVISOR" | "OBJECTIVE" | "PD" | "COMPLIANCE";

export const SOURCE_LABEL: Record<SourceKind, string> = {
  SELF: "Self reflection",
  PEER: "Peer feedback",
  SUPERVISOR: "Supervisor assessment",
  OBJECTIVE: "Objective data",
  PD: "Professional development",
  COMPLIANCE: "Compliance",
};

export interface ScorecardMetric {
  key: string;
  domain: string;
  behaviour: string;          // the observable behaviour being rated
  source: SourceKind;
  weight: number;             // relative weight inside its source
  appliesToRoles: string[];   // empty means every role
}

/** Tenant default metric set. Administrators add, remove and reweight these. */
export const DEFAULT_METRICS: ScorecardMetric[] = [
  { key: "doc-deadlines", domain: "Documentation", behaviour: "Completes session documentation by the required deadline", source: "OBJECTIVE", weight: 3, appliesToRoles: [] },
  { key: "doc-quality", domain: "Documentation", behaviour: "Documentation contains the required objective data and is signed without follow-up", source: "SUPERVISOR", weight: 2, appliesToRoles: [] },
  { key: "reliability-schedule", domain: "Reliability", behaviour: "Communicates schedule changes through the agreed channel and within the agreed notice", source: "OBJECTIVE", weight: 2, appliesToRoles: [] },
  { key: "reliability-prepared", domain: "Reliability", behaviour: "Arrives prepared with materials and program plans ready for assigned duties", source: "PEER", weight: 2, appliesToRoles: [] },
  { key: "clinical-implements", domain: "Clinical Quality", behaviour: "Implements supervisor recommendations in the next scheduled session", source: "SUPERVISOR", weight: 3, appliesToRoles: [] },
  { key: "clinical-procedures", domain: "Clinical Quality", behaviour: "Follows written teaching procedures and prompting hierarchies as programmed", source: "SUPERVISOR", weight: 3, appliesToRoles: [] },
  { key: "comms-response", domain: "Communication", behaviour: "Responds to team communication within the agreed response window", source: "PEER", weight: 2, appliesToRoles: [] },
  { key: "comms-meetings", domain: "Communication", behaviour: "Contributes case-relevant observations during team meetings", source: "PEER", weight: 2, appliesToRoles: [] },
  { key: "team-support", domain: "Teamwork", behaviour: "Supports colleagues with setup, coverage or problem-solving when asked and available", source: "PEER", weight: 2, appliesToRoles: [] },
  { key: "team-environment", domain: "Environment", behaviour: "Returns materials and leaves shared spaces ready for the next session", source: "PEER", weight: 1, appliesToRoles: [] },
  { key: "prof-boundaries", domain: "Professionalism", behaviour: "Maintains professional boundaries with clients, families and colleagues", source: "SUPERVISOR", weight: 2, appliesToRoles: [] },
  { key: "engagement-community", domain: "Community Engagement", behaviour: "Contributes to community engagement activities within role boundaries", source: "PEER", weight: 1, appliesToRoles: [] },
  { key: "growth-training", domain: "Professional Development", behaviour: "Completes assigned training by its due date", source: "PD", weight: 3, appliesToRoles: [] },
  { key: "growth-credential", domain: "Professional Development", behaviour: "Keeps credential requirements on pace for the current cycle", source: "COMPLIANCE", weight: 2, appliesToRoles: [] },
  { key: "self-reflection", domain: "Self Reflection", behaviour: "Identifies specific growth areas and the support that would help", source: "SELF", weight: 2, appliesToRoles: [] },
];

export interface MetricResponse { metricKey: string; source: SourceKind; rating: RatingValue; comment: string; rater?: string }

export interface EcosystemBreakdown {
  source: SourceKind;
  weightPct: number;
  meanRating: number | null;   // 1 to 5
  points: number;              // contribution to the 0 to 100 score
  responses: number;
}

export interface EcosystemResult {
  score: number | null;        // 0 to 100, null when nothing has been submitted
  breakdown: EcosystemBreakdown[];
  strongestDomain: string | null;
  developmentDomain: string | null;
  missing: string[];           // sources with no input yet
}

function sourceWeights(): Record<SourceKind, number> {
  return {
    OBJECTIVE: Number(getSetting("eco.weightObjective")) || 0,
    SUPERVISOR: Number(getSetting("eco.weightSupervisor")) || 0,
    PEER: Number(getSetting("eco.weightPeer")) || 0,
    SELF: Number(getSetting("eco.weightSelf")) || 0,
    PD: Number(getSetting("eco.weightPd")) || 0,
    COMPLIANCE: 0, // compliance gates bonus eligibility rather than scoring
  };
}

/**
 * Weighted Ecosystem Score. Sources with no responses are excluded and the
 * remaining weights are renormalized, so an absent peer round never reads as
 * poor performance.
 */
export function computeEcosystem(responses: MetricResponse[], metrics: ScorecardMetric[] = DEFAULT_METRICS): EcosystemResult {
  const weights = sourceWeights();
  const byMetric = new Map(metrics.map((m) => [m.key, m]));
  const sources: SourceKind[] = ["OBJECTIVE", "SUPERVISOR", "PEER", "SELF", "PD"];

  const present = sources.filter((s) => responses.some((r) => r.source === s));
  const totalWeight = present.reduce((sum, s) => sum + weights[s], 0);

  const breakdown: EcosystemBreakdown[] = sources.map((s) => {
    const rs = responses.filter((r) => r.source === s);
    if (!rs.length) return { source: s, weightPct: weights[s], meanRating: null, points: 0, responses: 0 };
    // weight each metric by its configured weight inside the source
    let num = 0, den = 0;
    for (const r of rs) {
      const w = byMetric.get(r.metricKey)?.weight ?? 1;
      num += r.rating * w;
      den += w;
    }
    const mean = num / den;
    const share = totalWeight > 0 ? weights[s] / totalWeight : 0;
    return {
      source: s,
      weightPct: weights[s],
      meanRating: Math.round(mean * 100) / 100,
      points: Math.round(((mean - 1) / 4) * 100 * share * 10) / 10,
      responses: rs.length,
    };
  });

  const score = present.length ? Math.round(breakdown.reduce((s, b) => s + b.points, 0)) : null;

  const domainMeans = new Map<string, { sum: number; n: number }>();
  for (const r of responses) {
    const d = byMetric.get(r.metricKey)?.domain;
    if (!d) continue;
    const cur = domainMeans.get(d) ?? { sum: 0, n: 0 };
    domainMeans.set(d, { sum: cur.sum + r.rating, n: cur.n + 1 });
  }
  const ranked = [...domainMeans.entries()].map(([d, v]) => ({ d, mean: v.sum / v.n })).sort((a, b) => b.mean - a.mean);

  return {
    score,
    breakdown,
    strongestDomain: ranked[0]?.d ?? null,
    developmentDomain: ranked.length > 1 ? ranked[ranked.length - 1].d : null,
    missing: sources.filter((s) => !present.includes(s)).map((s) => SOURCE_LABEL[s]),
  };
}

/* ---- recognition -------------------------------------------------------------- */

export const RECOGNITION_CATEGORIES = [
  "Helping Hand", "Above & Beyond", "Team Player", "Client Champion", "Problem Solver",
  "Great Communication", "Mentorship", "Leadership Moment", "Learning Champion", "Innovation", "Reliability",
];

export interface Recognition {
  id: string;
  from: string;
  to: string;
  category: string;
  points: number;
  message: string;      // behaviour-specific explanation, required
  date: string;
  flagged: string | null;
}

export interface RecognitionCheck { allowed: boolean; reason: string }

/**
 * Anti-gaming rules: no self-recognition, a monthly giving allowance, a cap on
 * points to any one person, duplicate detection, and reciprocal flagging.
 */
export function checkRecognition(
  draft: { from: string; to: string; points: number; message: string; category: string },
  monthToDate: Recognition[],
): RecognitionCheck {
  if (draft.from === draft.to) return { allowed: false, reason: "Self-recognition is not permitted." };
  if (!draft.message.trim() || draft.message.trim().length < 12) {
    return { allowed: false, reason: "Describe the specific behaviour you are recognizing." };
  }
  const allowance = Number(getSetting("recog.monthlyAllowance")) || 10;
  const perPerson = Number(getSetting("recog.maxPerPerson")) || 4;
  const given = monthToDate.filter((r) => r.from === draft.from);
  const spent = given.reduce((s, r) => s + r.points, 0);
  if (spent + draft.points > allowance) {
    return { allowed: false, reason: `That exceeds your ${allowance}-point monthly allowance (${allowance - spent} remaining).` };
  }
  const toPerson = given.filter((r) => r.to === draft.to).reduce((s, r) => s + r.points, 0);
  if (toPerson + draft.points > perPerson) {
    return { allowed: false, reason: `The monthly maximum to one person is ${perPerson} points.` };
  }
  const duplicate = given.some((r) => r.to === draft.to && r.category === draft.category && r.message.trim() === draft.message.trim());
  if (duplicate) return { allowed: false, reason: "That recognition is a duplicate of one you already sent." };
  return { allowed: true, reason: "" };
}

/** Reciprocal pattern worth a manager's eye: mutual points inside the same month. */
export function reciprocalFlag(draft: { from: string; to: string }, monthToDate: Recognition[]): string | null {
  const back = monthToDate.some((r) => r.from === draft.to && r.to === draft.from);
  return back ? "Reciprocal recognition this month. Visible to managers for review." : null;
}

/* ---- bonus eligibility --------------------------------------------------------- */

export interface BonusInputs {
  score: number | null;
  trainingComplete: boolean;
  documentationComplete: boolean;
  credentialCompliant: boolean;
  policiesAcknowledged: boolean;
}

export interface BonusResult {
  status: "QUALIFIED" | "NOT_QUALIFIED" | "NOT_ENABLED" | "PENDING";
  reasons: { label: string; met: boolean; detail: string }[];
}

/**
 * Bonus eligibility, explained line by line. Summit stores eligibility only,
 * never monetary amounts, and no model decides compensation.
 */
export function computeBonus(inputs: BonusInputs): BonusResult {
  if (getSetting("bonus.enabled") !== true) return { status: "NOT_ENABLED", reasons: [] };
  const min = Number(getSetting("bonus.minScore")) || 80;
  const reasons = [
    { label: `Ecosystem Score at or above ${min}`, met: (inputs.score ?? -1) >= min, detail: inputs.score == null ? "The month has no submitted inputs yet." : `Score: ${inputs.score}` },
    { label: "Required training complete", met: inputs.trainingComplete, detail: inputs.trainingComplete ? "Complete" : "Assigned training remains outstanding." },
    { label: "Documentation complete", met: inputs.documentationComplete, detail: inputs.documentationComplete ? "Complete" : "Session documentation remains outstanding." },
    { label: "Credential compliance on pace", met: inputs.credentialCompliant, detail: inputs.credentialCompliant ? "On pace" : "A credential cycle is behind pace." },
    { label: "Policy acknowledgements current", met: inputs.policiesAcknowledged, detail: inputs.policiesAcknowledged ? "Current" : "A required policy acknowledgement is outstanding." },
  ];
  if (inputs.score == null) return { status: "PENDING", reasons };
  return { status: reasons.every((r) => r.met) ? "QUALIFIED" : "NOT_QUALIFIED", reasons };
}

/** Peer feedback prompts: behaviour-focused, examples requested for low ratings. */
export const PEER_PROMPTS = [
  "What did this person do particularly well?",
  "What behaviour positively affected the team?",
  "Where could this person improve, and what would improvement look like?",
  "What support might help?",
];

export function requiresExample(rating: RatingValue): boolean {
  return rating <= 2;
}
