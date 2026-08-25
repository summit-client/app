import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildEvidencePacket, ClinicalAIUnavailableError, MockProvider, PROMPT_TEMPLATE_VERSION,
  readConfig, resolveProvider, runReportPipeline,
  type EvidenceRetriever, type ReportGenerationOptions,
} from "@summit/clinical-ai";

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

  const retriever: EvidenceRetriever = IS_PREVIEW ? previewRetriever() : (await import("@/lib/server/retriever")).liveRetriever(sb!);
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

function serverClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}

