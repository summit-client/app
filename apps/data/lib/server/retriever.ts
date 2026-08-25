import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceRetriever, RetrievedClinicalData } from "@summit/clinical-ai";
import type { ProgramFacts } from "@summit/analytics";

/**
 * Live evidence retrieval (step 1): date-bounded, source IDs preserved,
 * shared by every Clinical Intelligence endpoint (reports, supervision, …).
 * Runs under the caller's RLS session — clinic isolation applies at the DB.
 */
export function liveRetriever(sb: SupabaseClient): EvidenceRetriever {
  return {
    async retrieve({ clientId, startDate, endDate }) {
      const endTs = `${endDate}T23:59:59`;
      const [client, programs, records, notes, incidents, mods, decisions, cg, integrity, bankRels] = await Promise.all([
        sb.from("clients").select("id,name").eq("id", clientId).single(),
        sb.from("programs").select("*, program_steps(*)").eq("client_id", clientId).neq("status", "archived"),
        sb.from("session_records").select("id, program_id, started_at, summary_pct, summary_count").eq("client_id", clientId)
          .gte("started_at", startDate).lte("started_at", endTs).not("ended_at", "is", null).order("started_at"),
        sb.from("session_notes").select("id, session_id, created_at, body").eq("client_id", clientId)
          .gte("created_at", startDate).lte("created_at", endTs),
        sb.from("behaviour_incidents").select("id, occurred_at, suspected_function").eq("client_id", clientId)
          .gte("occurred_at", startDate).lte("occurred_at", endTs),
        sb.from("treatment_modifications").select("id, program_id, modified_at, kind, rationale, outcome")
          .gte("modified_at", startDate).lte("modified_at", endTs),
        sb.from("clinical_decisions").select("id, decided_at, pattern, decision").eq("client_id", clientId)
          .gte("decided_at", startDate).lte("decided_at", endTs),
        sb.from("caregiver_goals").select("status, priority").eq("client_id", clientId),
        sb.from("integrity_checks").select("program_id, steps_correct, steps_total, observed_at")
          .gte("observed_at", startDate).lte("observed_at", endTs),
        sb.from("goal_bank_relations").select("from_entry, kind, to:to_entry(name)").eq("kind", "next"),
      ]);

      const recs = records.data ?? [];
      const nextByBank = new Map<string, string[]>();
      for (const r of (bankRels.data ?? []) as unknown as { from_entry: string; to: { name: string } | { name: string }[] | null }[]) {
        const toName = Array.isArray(r.to) ? r.to[0]?.name : r.to?.name; // supabase types to-one joins as arrays without generated DB types
        if (toName) nextByBank.set(r.from_entry, [...(nextByBank.get(r.from_entry) ?? []), toName]);
      }

      const facts: ProgramFacts[] = ((programs.data ?? []) as Record<string, unknown>[]).map((p) => ({
        programId: p.id as string,
        clientId,
        clientName: (client.data?.name as string) ?? `Client ${clientId}`,
        goalName: p.name as string,
        domain: (p.domain as string) ?? null,
        targetDirection: (p.target_direction as "increase" | "decrease") ?? "increase",
        masteryPct: (p.mastery_pct as number) ?? 80,
        masteryConsecutive: (p.mastery_consecutive as number) ?? 3,
        series: recs.filter((r) => r.program_id === p.id).map((r) => ({
          date: String(r.started_at).slice(0, 10),
          pct: r.summary_pct != null ? Number(r.summary_pct) : null,
          count: r.summary_count != null ? Number(r.summary_count) : null,
          opportunities: r.summary_count != null ? Number(r.summary_count) : 10,
        })),
        phaseChanges: (mods.data ?? []).filter((m) => m.program_id === p.id)
          .map((m) => ({ date: String(m.modified_at).slice(0, 10), label: `${m.kind}: ${m.rationale}` })),
        integrityChecks: (integrity.data ?? []).filter((x) => x.program_id === p.id)
          .map((x) => ({ stepsCorrect: x.steps_correct as number, stepsTotal: x.steps_total as number, date: String(x.observed_at).slice(0, 10) })),
        noteThemes: [],
        caregiverGoalsOpenDays: null,
        masteredAt: p.status === "mastered" ? String(p.updated_at ?? "").slice(0, 10) || null : null,
        hasNextGoalProgrammed: true,
        goalBankNextOptions: p.goal_bank_id ? nextByBank.get(p.goal_bank_id as string) ?? [] : [],
      }));

      const noteRows = (notes.data ?? []).map((n) => {
        const body = n.body as { summary?: string; perProgram?: { programName: string; narrative: string }[] } | null;
        return {
          id: n.id as string,
          date: String(n.created_at).slice(0, 10),
          excerpts: [body?.summary ?? "", ...(body?.perProgram ?? []).map((x) => x.narrative)].filter(Boolean),
          programIds: facts
            .filter((f) => (body?.perProgram ?? []).some((x) => x.programName === f.goalName))
            .map((f) => f.programId),
        };
      });

      const cgRows = cg.data ?? [];
      return {
        client: { id: clientId, displayName: (client.data?.name as string) ?? `Client ${clientId}` },
        clinicId: null,
        facts,
        notes: noteRows,
        incidents: (incidents.data ?? []).map((i) => ({
          id: i.id as string, date: String(i.occurred_at).slice(0, 10),
          suspectedFunction: (i.suspected_function as string) ?? null,
        })),
        clinicalEvents: (decisions.data ?? []).map((d) => ({
          date: String(d.decided_at).slice(0, 10), kind: "clinical_decision",
          description: `${d.pattern}: ${d.decision}`, sourceId: d.id as string,
        })),
        caregiverGoals: {
          open: cgRows.filter((x) => x.status === "open").length,
          addressed: cgRows.filter((x) => x.status === "addressed").length,
          reports: cgRows.map((x) => x.priority as string),
        },
        sessionsHeld: new Set(recs.map((r) => r.id)).size,
      } satisfies RetrievedClinicalData;
    },
  };
}
