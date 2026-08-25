import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildEvidencePacket, ClinicalAIUnavailableError, MockProvider, PROMPT_TEMPLATE_VERSION,
  resolveProvider, type ClinicalAIProvider, type EvidenceRetriever, type TreatmentPlanSuggestions,
} from "@summit/clinical-ai";

/**
 * POST /api/planning — Treatment Planning Copilot data.
 * Returns the evidence packet plus suggestions in strict priority order:
 * Goal Bank options ship deterministically with provenance; the AI may only
 * ADD alternatives, clearly labelled ai_generated. Committing a plan decision
 * is a separate authenticated write to clinical_decisions.
 */

export const runtime = "nodejs";
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: number; startDate?: string; endDate?: string;
    commit?: { goalName: string; source: string; rationale: string; pattern: string };
  } | null;
  if (!body?.clientId) return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 422 });

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

  // Commit path: the clinician's decision is recorded, audited, and owned by them.
  if (body.commit) {
    if (sb) {
      await sb.from("clinical_decisions").insert({
        clinic_id: clinicId, client_id: body.clientId,
        pattern: body.commit.pattern, decision: `Plan: ${body.commit.goalName} (${body.commit.source})`,
        options_considered: [{ option: body.commit.goalName, rationale: body.commit.rationale }],
        decided_by: userId,
      });
    }
    return NextResponse.json({ ok: true, committed: true });
  }

  const startDate = body.startDate ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
  const retriever: EvidenceRetriever = IS_PREVIEW
    ? { retrieve: async ({ clientId }) => (await import("@/lib/preview-report")).getPreviewRetrieval(clientId) }
    : (await import("@/lib/server/retriever")).liveRetriever(sb!);

  let provider: ClinicalAIProvider;
  try {
    provider = resolveProvider({ task: "treatment_planning", containsPhi: !IS_PREVIEW });
  } catch {
    provider = new MockProvider(); // local-only fallback; nothing leaves the server
  }

  const packet = await buildEvidencePacket(retriever, provider, { clientId: body.clientId, startDate, endDate });

  // Priority 2: organization-approved Goal Bank — deterministic, always present.
  const goalBankSuggestions: TreatmentPlanSuggestions["suggestions"] = packet.goals
    .filter((g) => (g.masteryStatus === "mastered" || g.masteryStatus === "approaching") && g.goalBankNextOptions.length)
    .flatMap((g) => g.goalBankNextOptions.map((o) => ({
      goalName: o, source: "goal_bank" as const,
      rationale: `${g.goalName} is ${g.masteryStatus === "mastered" ? "mastered" : "nearing mastery"}; approved linked progression.`,
      evidenceIds: [`metric_${g.programId}`],
    })));

  // Priority 5: AI alternatives — additive only, clearly labelled; failure is silent.
  let aiSuggestions: TreatmentPlanSuggestions["suggestions"] = [];
  try {
    const out = await provider.generateTreatmentPlanSuggestions({
      packet,
      goalBankNextOptions: packet.goals.map((g) => ({ goalId: g.goalId, options: g.goalBankNextOptions })),
    });
    aiSuggestions = out.suggestions.filter((s) => s.source !== "goal_bank"); // bank items already listed deterministically
  } catch (e) {
    if (!(e instanceof ClinicalAIUnavailableError)) aiSuggestions = [];
  }

  if (sb) {
    await sb.from("ai_requests").insert({
      clinic_id: clinicId, requesting_user: userId, client_id: packet.client.id,
      feature: "treatment_planning", provider: provider.name, model: "packet + suggestions",
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      evidence_packet_id: packet.packetId, evidence_packet_hash: packet.packetHash,
      output_id: `${packet.packetId}-plan`, approval_status: null,
    });
  }

  return NextResponse.json({ ok: true, packet, goalBankSuggestions, aiSuggestions });
}

function serverClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}
