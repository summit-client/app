"use client";

import type { ProgramFacts } from "@summit/analytics";
import { IS_PREVIEW } from "./data";
import { createBrowserClient } from "@supabase/ssr";
import { getPreviewCaseloadFacts } from "./preview-facts";

/**
 * Builds ProgramFacts for the analytics engine. Preview mode ships a caseload
 * engineered to exercise every bucket (the thesis's own worked examples);
 * live mode assembles facts from session_records, phases and integrity_checks.
 */

export async function getCaseloadFacts(): Promise<ProgramFacts[]> {
  if (IS_PREVIEW) return getPreviewCaseloadFacts();

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
  for (const r of (banks.data ?? []) as unknown as { from_entry: string; to: { name: string } | { name: string }[] | null }[]) {
    const toName = Array.isArray(r.to) ? r.to[0]?.name : r.to?.name; // supabase types to-one joins as arrays without generated DB types
    if (!toName) continue;
    nextByBank.set(r.from_entry, [...(nextByBank.get(r.from_entry) ?? []), toName]);
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
