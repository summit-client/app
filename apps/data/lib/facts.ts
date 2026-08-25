"use client";

import type { ProgramFacts, SessionPoint } from "@summit/analytics";
import { IS_PREVIEW } from "./data";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Builds ProgramFacts for the analytics engine. Preview mode ships a caseload
 * engineered to exercise every bucket (the thesis's own worked examples);
 * live mode assembles facts from session_records, phases and integrity_checks.
 */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
function series(specs: [number, number, number][]): SessionPoint[] {
  // [daysAgo, pct, opportunities]
  return specs.map(([d, pct, opp]) => ({ date: daysAgo(d), pct, count: null, opportunities: opp }));
}

const PREVIEW_FACTS: ProgramFacts[] = [
  {
    // The thesis's Alex R. case: 37-day plateau, high integrity, prompt-dependency notes.
    programId: "f-alex-req", clientId: 201, clientName: "Alex R.",
    goalName: "Functional Requesting", domain: "Communication",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[37, 51, 18], [33, 52, 16], [29, 50, 17], [25, 53, 15], [21, 51, 18], [17, 52, 16], [12, 53, 17], [8, 51, 15], [4, 52, 16]]),
    phaseChanges: [{ date: daysAgo(41), label: "Intervention B: VR2" }],
    integrityChecks: [
      { stepsCorrect: 10, stepsTotal: 11, date: daysAgo(9) },
      { stepsCorrect: 9, stepsTotal: 10, date: daysAgo(23) },
    ],
    noteThemes: ["prompt dependency", "stronger performance with familiar therapist"],
    caregiverGoalsOpenDays: null, masteredAt: null, hasNextGoalProgrammed: false,
    goalBankNextOptions: ["Request Help", "Request Break", "Communication-Partner Generalization"],
  },
  {
    // Mastery candidate: one more qualifying session required.
    programId: "f-alex-wait", clientId: 201, clientName: "Alex R.",
    goalName: "Waiting", domain: "Self-regulation",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[20, 61, 8], [16, 70, 8], [12, 76, 9], [8, 84, 8], [4, 88, 9]]),
    phaseChanges: [], integrityChecks: [{ stepsCorrect: 12, stepsTotal: 13, date: daysAgo(6) }],
    noteThemes: ["tolerating longer waits", "improvement noted"],
    caregiverGoalsOpenDays: 12, masteredAt: null, hasNextGoalProgrammed: true,
    goalBankNextOptions: [],
  },
  {
    // Regression after a phase change.
    programId: "f-maya-tact", clientId: 202, clientName: "Maya T.",
    goalName: "Tacting Actions", domain: "Communication",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[30, 74, 12], [26, 76, 14], [22, 71, 12], [18, 58, 13], [14, 52, 12], [10, 49, 12], [5, 47, 14]]),
    phaseChanges: [{ date: daysAgo(20), label: "Prompt fading: gestural → verbal" }],
    integrityChecks: [{ stepsCorrect: 7, stepsTotal: 10, date: daysAgo(8) }],
    noteThemes: ["frustration during trials"],
    caregiverGoalsOpenDays: 34, masteredAt: null, hasNextGoalProgrammed: true,
    goalBankNextOptions: [],
  },
  {
    // Mastered, no next-step goal programmed.
    programId: "f-leo-mand", clientId: 203, clientName: "Leo K.",
    goalName: "Request Preferred Item", domain: "Communication",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[24, 82, 10], [20, 85, 12], [16, 88, 11], [12, 91, 10]]),
    phaseChanges: [], integrityChecks: [{ stepsCorrect: 14, stepsTotal: 15, date: daysAgo(12) }],
    noteThemes: ["independent across materials"],
    caregiverGoalsOpenDays: null, masteredAt: daysAgo(11), hasNextGoalProgrammed: false,
    goalBankNextOptions: ["Request Help", "Request Break", "Request Missing Item"],
  },
  {
    // Sparse data.
    programId: "f-sofia-social", clientId: 204, clientName: "Sofia R.",
    goalName: "Peer Initiation", domain: "Social engagement",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[26, 44, 6], [19, 47, 5]]),
    phaseChanges: [], integrityChecks: [],
    noteThemes: [], caregiverGoalsOpenDays: 41, masteredAt: null, hasNextGoalProgrammed: true,
    goalBankNextOptions: [],
  },
  {
    // Progressing normally (control case).
    programId: "f-maya-engage", clientId: 202, clientName: "Maya T.",
    goalName: "Group Engagement", domain: "Social engagement",
    targetDirection: "increase", masteryPct: 80, masteryConsecutive: 3,
    series: series([[21, 55, 20], [17, 60, 20], [13, 64, 20], [9, 69, 20], [5, 73, 20], [2, 76, 20]]),
    phaseChanges: [], integrityChecks: [{ stepsCorrect: 19, stepsTotal: 20, date: daysAgo(5) }],
    noteThemes: ["steady gains"],
    caregiverGoalsOpenDays: null, masteredAt: null, hasNextGoalProgrammed: true,
    goalBankNextOptions: [],
  },
];

export async function getCaseloadFacts(): Promise<ProgramFacts[]> {
  if (IS_PREVIEW) return PREVIEW_FACTS;

  const sb = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
  // Live mode: one round trip per table, joined in memory.
  const [programs, records, phases, integrity, banks] = await Promise.all([
    sb.from("programs").select("id, client_id, name, domain, target_direction, mastery_pct, mastery_consecutive, status, goal_bank_id, clients:client_id(name)").neq("status", "archived"),
    sb.from("session_records").select("program_id, started_at, summary_pct, summary_count").not("ended_at", "is", null).order("started_at"),
    sb.from("phases").select("program_id, started_at, label"),
    sb.from("integrity_checks").select("program_id, steps_correct, steps_total, observed_at"),
    sb.from("goal_bank_relations").select("from_entry, kind, to:to_entry(name)").eq("kind", "next"),
  ]);
  const recs = records.data ?? [];
  const nextByBank = new Map<string, string[]>();
  for (const r of (banks.data ?? []) as { from_entry: string; to: { name: string } | null }[]) {
    if (!r.to) continue;
    nextByBank.set(r.from_entry, [...(nextByBank.get(r.from_entry) ?? []), r.to.name]);
  }
  return ((programs.data ?? []) as Record<string, unknown>[]).map((p) => {
    const mine = recs.filter((r) => r.program_id === p.id);
    return {
      programId: p.id as string,
      clientId: p.client_id as number,
      clientName: ((p.clients as { name?: string } | null)?.name) ?? `Client ${p.client_id}`,
      goalName: p.name as string,
      domain: (p.domain as string) ?? null,
      targetDirection: (p.target_direction as "increase" | "decrease") ?? "increase",
      masteryPct: (p.mastery_pct as number) ?? 80,
      masteryConsecutive: (p.mastery_consecutive as number) ?? 3,
      series: mine.map((r) => ({
        date: String(r.started_at).slice(0, 10),
        pct: r.summary_pct != null ? Number(r.summary_pct) : null,
        count: r.summary_count != null ? Number(r.summary_count) : null,
        opportunities: r.summary_count != null ? Number(r.summary_count) : 10,
      })),
      phaseChanges: (phases.data ?? []).filter((x) => x.program_id === p.id)
        .map((x) => ({ date: String(x.started_at).slice(0, 10), label: (x.label as string) ?? "phase change" })),
      integrityChecks: (integrity.data ?? []).filter((x) => x.program_id === p.id)
        .map((x) => ({ stepsCorrect: x.steps_correct as number, stepsTotal: x.steps_total as number, date: String(x.observed_at).slice(0, 10) })),
      noteThemes: [], // note-theme extraction is the LLM's later job; empty = no clinician_observation evidence
      caregiverGoalsOpenDays: null,
      masteredAt: p.status === "mastered" ? null : null,
      hasNextGoalProgrammed: true,
      goalBankNextOptions: p.goal_bank_id ? nextByBank.get(p.goal_bank_id as string) ?? [] : [],
    };
  });
}
