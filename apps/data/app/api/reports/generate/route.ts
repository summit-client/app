import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildEvidencePacket, ClinicalAIUnavailableError, MockProvider, PROMPT_TEMPLATE_VERSION,
  readConfig, resolveProvider, runReportPipeline,
  type EvidenceRetriever, type ReportGenerationOptions, type RetrievedClinicalData,
} from "@summit/clinical-ai";
import type { ProgramFacts } from "@summit/analytics";

/**
 * POST /api/reports/generate — the evidence-first pipeline, server-side.
 * The browser never chooses a provider; routing, PHI gating, minimization and
 * validation all happen here. If AI is unavailable the endpoint still returns
 * the evidence packet: calculated results never depend on the LLM.
 */

export const runtime = "nodejs";
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: number; startDate?: string; endDate?: string;
    tone?: ReportGenerationOptions["tone"]; length?: ReportGenerationOptions["length"];
    goalFilterIds?: string[];
  } | null;
  if (!body?.clientId || !body.startDate || !body.endDate) {
    return NextResponse.json({ ok: false, error: "clientId, startDate and endDate are required." }, { status: 422 });
  }
  const options: ReportGenerationOptions = { tone: body.tone ?? "clinical", length: body.length ?? "standard", goalFilterIds: body.goalFilterIds };

  // Auth (live mode): verified staff only.
  let userId: string | null = null;
  let clinicId: string | null = null;
  const sb = !IS_PREVIEW ? serverClient(request) : null;
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    const { data: profile } = await sb.from("profiles").select("role, clinic_id").eq("id", user.id).single();
    if (!profile || !["admin", "supervisor", "clinician"].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: "Staff access required." }, { status: 403 });
    }
    userId = user.id; clinicId = profile.clinic_id ?? null;
  }

  const retriever: EvidenceRetriever = IS_PREVIEW ? previewRetriever() : liveRetriever(sb!);
  const input = { clientId: body.clientId, startDate: body.startDate, endDate: body.endDate };

  try {
    const provider = resolveProvider({ task: "progress_report", containsPhi: !IS_PREVIEW });
    if (!readConfig().progressReportsEnabled) throw new ClinicalAIUnavailableError("Progress-report drafting is disabled in this environment.");
    const { packet, report } = await runReportPipeline(retriever, provider, {
      ...input, reportType: "progress_report", options, goalFilterIds: body.goalFilterIds,
    });

    // Audit: structured provenance, ids and hashes — never raw prompts.
    if (sb) {
      await sb.from("evidence_packets").upsert({
        id: packet.packetId, clinic_id: clinicId, client_id: packet.client.id,
        period_start: input.startDate, period_end: input.endDate,
        packet, packet_hash: packet.packetHash, created_by: userId,
      });
      await sb.from("ai_requests").insert({
        clinic_id: clinicId, requesting_user: userId, client_id: packet.client.id,
        feature: "progress_report", provider: provider.name,
        model: report.modelNote, prompt_template_version: PROMPT_TEMPLATE_VERSION,
        evidence_packet_id: packet.packetId, evidence_packet_hash: packet.packetHash,
        output_id: report.reportId, approval_status: "draft",
      });
    }
    return NextResponse.json({ ok: true, packet, report });
  } catch (e) {
    if (e instanceof ClinicalAIUnavailableError) {
      // Degrade gracefully: evidence packet still ships; narrative does not.
      const packet = await buildEvidencePacket(retriever, new MockProvider(), input).catch(() => null);
      return NextResponse.json({ ok: true, packet, report: null, aiUnavailable: true, message: e.message });
    }
    return NextResponse.json({ ok: false, error: "Report generation failed." }, { status: 500 });
  }
}

/* ---- retrieval implementations ---------------------------------------------- */

function previewRetriever(): EvidenceRetriever {
  return {
    async retrieve({ clientId }) {
      const { getPreviewRetrieval } = await import("@/lib/preview-report");
      return getPreviewRetrieval(clientId);
    },
  };
}

function liveRetriever(sb: ReturnType<typeof serverClient>): EvidenceRetriever {
  return {
    async retrieve({ clientId, startDate, endDate }) {
      const inPeriod = (col: string) => ({ gte: `${col}.gte.${startDate}`, lte: `${col}.lte.${endDate}` });
      const [client, programs, records, notes, incidents, mods, decisions, cg, integrity] = await Promise.all([
        sb.from("clients").select("id,name").eq("id", clientId).single(),
        sb.from("programs").select("*, program_steps(*)").eq("client_id", clientId).neq("status", "archived"),
        sb.from("session_records").select("id, program_id, started_at, summary_pct, summary_count").eq("client_id", clientId)
          .gte("started_at", startDate).lte("started_at", `${endDate}T23:59:59`).not("ended_at", "is", null).order("started_at"),
        sb.from("session_notes").select("id, session_id, created_at, body").eq("client_id", clientId)
          .gte("created_at", startDate).lte("created_at", `${endDate}T23:59:59`),
        sb.from("behaviour_incidents").select("id, occurred_at, suspected_function").eq("client_id", clientId)
          .gte("occurred_at", startDate).lte("occurred_at", `${endDate}T23:59:59`),
        sb.from("treatment_modifications").select("id, program_id, modified_at, kind, rationale, outcome")
          .gte("modified_at", startDate).lte("modified_at", `${endDate}T23:59:59`),
        sb.from("clinical_decisions").select("id, decided_at, pattern, decision").eq("client_id", clientId)
          .gte("decided_at", startDate).lte("decided_at", `${endDate}T23:59:59`),
        sb.from("caregiver_goals").select("status, priority").eq("client_id", clientId),
        sb.from("integrity_checks").select("program_id, steps_correct, steps_total, observed_at")
          .gte("observed_at", startDate).lte("observed_at", `${endDate}T23:59:59`),
      ]);
      void inPeriod;
      const recs = records.data ?? [];
      const facts: ProgramFacts[] = ((programs.data ?? []) as Record<string, unknown>[]).map((p) => ({
        programId: p.id as string, clientId,
        clientName: (client.data?.name as string) ?? `Client ${clientId}`,
        goalName: p.name as string, domain: (p.domain as string) ?? null,
        targetDirection: (p.target_direction as "increase" | "decrease") ?? "increase",
        masteryPct: (p.mastery_pct as number) ?? 80, masteryConsecutive: (p.mastery_consecutive as number) ?? 3,
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
        noteThemes: [], caregiverGoalsOpenDays: null,
        masteredAt: p.status === "mastered" ? String(p.updated_at ?? "").slice(0, 10) || null : null,
        hasNextGoalProgrammed: true, goalBankNextOptions: [],
      }));
      const noteRows = (notes.data ?? []).map((n) => {
        const body = n.body as { summary?: string; perProgram?: { programName: string; narrative: string }[] } | null;
        return {
          id: n.id as string, date: String(n.created_at).slice(0, 10),
          excerpts: [body?.summary ?? "", ...(body?.perProgram ?? []).map((x) => x.narrative)].filter(Boolean),
          programIds: facts.filter((f) => (body?.perProgram ?? []).some((x) => x.programName === f.goalName)).map((f) => f.programId),
        };
      });
      const cgRows = cg.data ?? [];
      return {
        client: { id: clientId, displayName: (client.data?.name as string) ?? `Client ${clientId}` },
        clinicId: null,
        facts,
        notes: noteRows,
        incidents: (incidents.data ?? []).map((i) => ({ id: i.id as string, date: String(i.occurred_at).slice(0, 10), suspectedFunction: (i.suspected_function as string) ?? null })),
        clinicalEvents: (decisions.data ?? []).map((d) => ({ date: String(d.decided_at).slice(0, 10), kind: "clinical_decision", description: `${d.pattern}: ${d.decision}`, sourceId: d.id as string })),
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

function serverClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}

