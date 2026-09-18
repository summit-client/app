import { NextResponse, type NextRequest } from "next/server";
import {
  buildEvidencePacket, MockProvider, PROMPT_TEMPLATE_VERSION, resolveProvider,
  type ClinicalAIProvider, type EvidenceRetriever,
} from "@summit/clinical-ai";
import { requireStaff, requireClientInClinic, routeServerClient } from "@/lib/server/authz";

/**
 * POST /api/decision-tree — AI-assisted clinical decision support for one
 * flagged goal. The detected pattern and its evidence come from the
 * deterministic engine; the tree structures options — the clinician decides.
 * "Commit" and "send to supervisor" both write clinical_decisions with the
 * evidence packet attached, building the longitudinal decision log.
 */

export const runtime = "nodejs";
// Double-gated like proxy.ts's own PREVIEW_BYPASS - NEXT_PUBLIC_DEV_PREVIEW is
// browser-readable, so on its own it can't be trusted to skip this route's
// real auth/role check below.
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: number; goalId?: string; pattern?: string;
    commit?: { decision: string; remeasureAt?: string };
  } | null;
  if (!body?.clientId || !body.goalId) {
    return NextResponse.json({ ok: false, error: "clientId and goalId are required." }, { status: 422 });
  }

  let userId: string | null = null;
  let clinicId: string | null = null;
  const sb = !IS_PREVIEW ? routeServerClient(request) : null;
  if (sb) {
    const auth = await requireStaff(sb);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    userId = auth.userId; clinicId = auth.clinicId;

    // The session supplies the clinic, the body supplied the client, and
    // nothing checked the two agreed. Every write below stamps the CALLER's
    // clinic_id, so `with check (clinic_id = auth_clinic_id())` passes for
    // any client id at all, including another clinic's. Same check
    // app/api/planning already makes.
    const owns = await requireClientInClinic(sb, body.clientId, clinicId);
    if (!owns.ok) return NextResponse.json({ ok: false, error: owns.error }, { status: owns.status });
  }

  const startDate = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  const retriever: EvidenceRetriever = IS_PREVIEW
    ? { retrieve: async ({ clientId }) => (await import("@/lib/preview-report")).getPreviewRetrieval(clientId) }
    : (await import("@/lib/server/retriever")).liveRetriever(sb!);

  let provider: ClinicalAIProvider;
  try {
    provider = resolveProvider({ task: "decision_tree", containsPhi: !IS_PREVIEW });
  } catch {
    provider = new MockProvider();
  }

  const packet = await buildEvidencePacket(retriever, provider, { clientId: body.clientId, startDate, endDate });
  const goal = packet.goals.find((g) => g.goalId === body.goalId);
  if (!goal) return NextResponse.json({ ok: false, error: "Goal not found in the evidence window." }, { status: 404 });

  // Commit path: record the clinician's decision with the reviewed evidence.
  if (body.commit) {
    if (sb) {
      // The insert's result used to be discarded and this route answered
      // `committed: true` regardless, so an RLS refusal told the clinician
      // their decision was recorded when no row existed.
      const { error } = await sb.from("clinical_decisions").insert({
        clinic_id: clinicId, client_id: body.clientId, program_id: body.goalId,
        pattern: body.pattern ?? "clinical review",
        evidence: goal.masteryEvidence,
        decision: body.commit.decision,
        remeasure_at: body.commit.remeasureAt ?? null,
        decided_by: userId,
      });
      if (error) {
        console.error("[data/decision-tree] clinical_decisions insert failed:", error.message);
        return NextResponse.json(
          { ok: false, error: "That decision was not recorded. Please try again." },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ ok: true, committed: true });
  }

  const tree = await provider.generateDecisionTree({
    packet, goalId: body.goalId,
    pattern: body.pattern ?? "Pattern under review",
    patternEvidence: goal.masteryEvidence,
  }).catch(() => null);

  // Longitudinal memory: prior decisions/modifications for this goal, so the
  // clinician sees "a similar change was trialed and discontinued".
  const history = goal.treatmentChanges.map((c) => ({
    date: c.date, summary: c.rationale, outcome: c.outcome,
  }));

  if (sb) {
    await sb.from("ai_requests").insert({
      clinic_id: clinicId, requesting_user: userId, client_id: body.clientId,
      feature: "decision_tree", provider: provider.name, model: "tree",
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      evidence_packet_id: packet.packetId, evidence_packet_hash: packet.packetHash,
      output_id: `${packet.packetId}-tree-${body.goalId}`, approval_status: null,
    });
  }

  return NextResponse.json({
    ok: true, goalName: goal.goalName, patternEvidence: goal.masteryEvidence, tree, history,
    aiUnavailable: tree == null,
  });
}
