"use client";

/**
 * Ecosystem Tracker: the Interdependent Performance and Reinforcement System.
 *
 * Individual contribution and clinic ecosystem each carry half the picture.
 * Personal and Group subtotals normalize to 50 points each, so no one earns
 * their way to the top alone and no one is carried. Every metric names an
 * observable behaviour. Weights, thresholds, domains and reward names are
 * tenant settings, never constants in components.
 */

import { getSetting } from "@summit/settings";

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export const RATING_SCALE: { value: RatingValue; label: string; short: string }[] = [
  { value: 1, label: "Very Poor", short: "Absent or consistently problematic" },
  { value: 2, label: "Developing", short: "Emerging, inconsistent, needs support" },
  { value: 3, label: "Good", short: "Meets the expected level" },
  { value: 4, label: "Very Good", short: "Consistently strong and independent" },
  { value: 5, label: "Excellent", short: "Role model, lifts others" },
];

export type MetricType = "PERSONAL" | "GROUP";
export type SourceKind = "SELF" | "PEER" | "SUPERVISOR" | "OBJECTIVE" | "PD" | "COMPLIANCE";

export const SOURCE_LABEL: Record<SourceKind, string> = {
  SELF: "Self", PEER: "Peers", SUPERVISOR: "Supervisor", OBJECTIVE: "Objective data", PD: "Development", COMPLIANCE: "Compliance",
};

export interface ScorecardMetric {
  key: string;
  category: string;
  behaviour: string;
  weight: number;          // percent of the individual 100
  type: MetricType;        // personal contribution or group contribution
  source: SourceKind;
  evidence: string;        // where the data comes from
}

/** Individual evaluation, 100 points. Tenant default from the organization's system. */
export const DEFAULT_METRICS: ScorecardMetric[] = [
  { key: "rev-billable", category: "Revenue Generating", behaviour: "Maintains the agreed billable hours each week", weight: 10, type: "PERSONAL", source: "OBJECTIVE", evidence: "Schedule and session logs" },
  { key: "rev-leads", category: "Revenue Generating", behaviour: "Onboards new leads within 7 days", weight: 10, type: "PERSONAL", source: "OBJECTIVE", evidence: "Intake tracker timestamps" },
  { key: "rev-retention", category: "Revenue Generating", behaviour: "Keeps clients engaged with few unplanned discharges", weight: 10, type: "PERSONAL", source: "OBJECTIVE", evidence: "Session consistency" },
  { key: "skill-programs", category: "Skill & Performance", behaviour: "Develops and maintains program oversight", weight: 10, type: "PERSONAL", source: "SUPERVISOR", evidence: "Program bank updates, QA review" },
  { key: "skill-teaching", category: "Skill & Performance", behaviour: "Teaches and models procedures for others", weight: 10, type: "PERSONAL", source: "SUPERVISOR", evidence: "Fidelity or IOA review" },
  { key: "growth-ceu", category: "Professional Growth", behaviour: "Completes CEUs and attends supervision", weight: 10, type: "GROUP", source: "PD", evidence: "CEU tracker, supervision notes" },
  { key: "support-feedback", category: "Student Support", behaviour: "Earns strong student and caregiver feedback", weight: 10, type: "GROUP", source: "OBJECTIVE", evidence: "Feedback forms" },
  { key: "env-workspace", category: "Environment & Culture", behaviour: "Keeps the workspace clean and organized", weight: 10, type: "GROUP", source: "PEER", evidence: "Visual checklist, peer audit" },
  { key: "collab-tone", category: "Collaboration & Communication", behaviour: "Cooperates with the team and keeps a respectful tone", weight: 10, type: "GROUP", source: "PEER", evidence: "QA logs, peer survey" },
  { key: "community-events", category: "Community Engagement", behaviour: "Takes part in community events", weight: 5, type: "GROUP", source: "PEER", evidence: "Event attendance" },
  { key: "self-reflection", category: "Self Reflection", behaviour: "Names growth areas and the support that would help", weight: 5, type: "PERSONAL", source: "SELF", evidence: "Monthly reflection" },
];

/** The five branch domains a site is scored on. */
export const CLINIC_DOMAINS = [
  { key: "environment", label: "Environment & Cleanliness", lead: "Environmental Lead" },
  { key: "collaboration", label: "Collaboration & Culture", lead: "Collaboration Lead" },
  { key: "student", label: "Student Support", lead: "Student Support Lead" },
  { key: "visibility", label: "Visibility & Engagement", lead: "Visibility Lead" },
  { key: "growth", label: "Professional Growth", lead: "Growth Lead" },
];

export interface MetricResponse { metricKey: string; source: SourceKind; rating: RatingValue; comment: string; subject?: string; rater?: string }

export interface Subtotal { earned: number; possible: number; percent: number; responses: number }

export interface EcosystemResult {
  score: number | null;       // 0 to 100
  personal: Subtotal;         // normalized to 50
  group: Subtotal;            // normalized to 50
  band: "BONUS" | "FEEDBACK_PLAN" | "COACHING" | null;
  byCategory: { category: string; percent: number; weight: number }[];
  strongest: string | null;
  focus: string | null;
  missing: string[];
}

const pct = (rating: number) => ((rating - 1) / 4) * 100;

/**
 * Weighted individual score. Personal and Group each normalize to 50 points,
 * so a strong personal month cannot mask an absent contribution to the team.
 * Metrics with no rating are excluded rather than counted as zero.
 */
export function computeEcosystem(responses: MetricResponse[], metrics: ScorecardMetric[] = DEFAULT_METRICS): EcosystemResult {
  const latest = new Map<string, MetricResponse[]>();
  for (const r of responses) latest.set(r.metricKey, [...(latest.get(r.metricKey) ?? []), r]);

  const side = (type: MetricType): Subtotal => {
    const ms = metrics.filter((m) => m.type === type);
    let earned = 0, possible = 0, n = 0;
    for (const m of ms) {
      const rs = latest.get(m.key);
      if (!rs?.length) continue;
      const mean = rs.reduce((s, r) => s + r.rating, 0) / rs.length;
      earned += (pct(mean) / 100) * m.weight;
      possible += m.weight;
      n += rs.length;
    }
    const percent = possible ? Math.round((earned / possible) * 100) : 0;
    return { earned: Math.round(earned * 10) / 10, possible, percent, responses: n };
  };

  const personal = side("PERSONAL");
  const group = side("GROUP");
  const any = personal.responses + group.responses > 0;
  const score = any ? Math.round((personal.percent * 0.5) + (group.percent * 0.5)) : null;

  const bonusMin = Number(getSetting("bonus.minScore")) || 85;
  const coachingBelow = 70;
  const band = score == null ? null : score >= bonusMin ? "BONUS" : score >= coachingBelow ? "FEEDBACK_PLAN" : "COACHING";

  const cats = [...new Set(metrics.map((m) => m.category))].map((category) => {
    const ms = metrics.filter((m) => m.category === category);
    const rated = ms.filter((m) => latest.get(m.key)?.length);
    const weight = ms.reduce((s, m) => s + m.weight, 0);
    if (!rated.length) return { category, percent: -1, weight };
    const p = rated.reduce((s, m) => {
      const rs = latest.get(m.key)!;
      return s + pct(rs.reduce((n, r) => n + r.rating, 0) / rs.length);
    }, 0) / rated.length;
    return { category, percent: Math.round(p), weight };
  });
  const scored = cats.filter((c) => c.percent >= 0).sort((a, b) => b.percent - a.percent);

  return {
    score, personal, group, band,
    byCategory: cats,
    strongest: scored[0]?.category ?? null,
    focus: scored.length > 1 ? scored[scored.length - 1].category : null,
    missing: metrics.filter((m) => !latest.get(m.key)?.length).map((m) => m.behaviour),
  };
}

export const BAND_LABEL: Record<NonNullable<EcosystemResult["band"]>, string> = {
  BONUS: "Reinforcer unlocked",
  FEEDBACK_PLAN: "Feedback plan",
  COACHING: "Coaching conversation",
};

/* ---- clinic scoreboard ---------------------------------------------------- */

export interface ClinicScore {
  site: string;
  domains: Record<string, number>;   // domain key to percent
  average: number;
  unlocked: boolean;
}

export function clinicAverage(domains: Record<string, number>): number {
  const vals = CLINIC_DOMAINS.map((d) => domains[d.key] ?? 0);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

export function rankSites(sites: ClinicScore[]): ClinicScore[] {
  return [...sites].sort((a, b) => b.average - a.average);
}

/** Private percentile band. Individual scores never appear on a leaderboard. */
export function percentileBand(score: number, peers: number[]): { band: string; detail: string } {
  if (!peers.length) return { band: "No comparison yet", detail: "Your score is private to you, your supervisor and HR." };
  const below = peers.filter((p) => p < score).length;
  const p = Math.round((below / peers.length) * 100);
  const band = p >= 75 ? "Top quarter" : p >= 50 ? "Upper half" : p >= 25 ? "Lower half" : "Building";
  return { band, detail: "Shown only to you. Individual scores never appear on a leaderboard." };
}

/* ---- recognition ----------------------------------------------------------- */

export const RECOGNITION_CATEGORIES = [
  "Helping Hand", "Above & Beyond", "Team Player", "Client Champion", "Problem Solver",
  "Great Communication", "Mentorship", "Leadership Moment", "Learning Champion", "Innovation", "Reliability",
];

export interface Recognition {
  id: string; from: string; to: string; category: string; points: number;
  message: string; date: string; flagged: string | null;
}

export interface RecognitionCheck { allowed: boolean; reason: string }

export function checkRecognition(
  draft: { from: string; to: string; points: number; message: string; category: string },
  monthToDate: Recognition[],
): RecognitionCheck {
  if (draft.from === draft.to) return { allowed: false, reason: "You cannot recognize yourself." };
  if (draft.message.trim().length < 12) return { allowed: false, reason: "Say what they actually did." };
  const allowance = Number(getSetting("recog.monthlyAllowance")) || 10;
  const perPerson = Number(getSetting("recog.maxPerPerson")) || 4;
  const given = monthToDate.filter((r) => r.from === draft.from);
  const spent = given.reduce((s, r) => s + r.points, 0);
  if (spent + draft.points > allowance) return { allowed: false, reason: `${allowance - spent} points left this month.` };
  const toPerson = given.filter((r) => r.to === draft.to).reduce((s, r) => s + r.points, 0);
  if (toPerson + draft.points > perPerson) return { allowed: false, reason: `Cap of ${perPerson} points per person each month.` };
  if (given.some((r) => r.to === draft.to && r.category === draft.category && r.message.trim() === draft.message.trim())) {
    return { allowed: false, reason: "You already sent that one." };
  }
  return { allowed: true, reason: "" };
}

export function reciprocalFlag(draft: { from: string; to: string }, monthToDate: Recognition[]): string | null {
  return monthToDate.some((r) => r.from === draft.to && r.to === draft.from)
    ? "Mutual recognition this month, visible to managers"
    : null;
}

/* ---- reinforcer eligibility ------------------------------------------------ */

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

/** Eligibility only. Summit records no monetary amounts and no model decides it. */
export function computeBonus(inputs: BonusInputs): BonusResult {
  if (getSetting("bonus.enabled") !== true) return { status: "NOT_ENABLED", reasons: [] };
  const min = Number(getSetting("bonus.minScore")) || 85;
  const reasons = [
    { label: `Score ${min} or above`, met: (inputs.score ?? -1) >= min, detail: inputs.score == null ? "Waiting on this month's inputs" : `${inputs.score}` },
    { label: "Training complete", met: inputs.trainingComplete, detail: inputs.trainingComplete ? "Done" : "Assigned training outstanding" },
    { label: "Documentation complete", met: inputs.documentationComplete, detail: inputs.documentationComplete ? "Done" : "Notes outstanding" },
    { label: "Credentials on pace", met: inputs.credentialCompliant, detail: inputs.credentialCompliant ? "On pace" : "A cycle is behind" },
    { label: "Policies acknowledged", met: inputs.policiesAcknowledged, detail: inputs.policiesAcknowledged ? "Current" : "One outstanding" },
  ];
  if (inputs.score == null) return { status: "PENDING", reasons };
  return { status: reasons.every((r) => r.met) ? "QUALIFIED" : "NOT_QUALIFIED", reasons };
}

export const PEER_PROMPTS = [
  { key: "star1", label: "Star: what went well?" },
  { key: "star2", label: "Star: what helped the team?" },
  { key: "wish", label: "Wish: what would help them grow?" },
];

export function requiresExample(rating: RatingValue): boolean {
  return rating <= 2;
}
