import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildCaseReview, buildEvidencePacket, buildSupervisionBrief, MockProvider,
  PROMPT_TEMPLATE_VERSION, resolveProvider,
  type ClinicalAIProvider, type EvidenceRetriever,
} from "@summit/clinical-ai";

/**
 * POST /api/supervision — Prepare Case Review + Supervision Brief.
 * Same packet infrastructure as reports; the categories, metrics and review
 * questions are deterministic, so this endpoint works even with AI disabled
 * (theme extraction just degrades to empty themes).
 */

export const runtime = "nodejs";
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: number; startDate?: string; endDate?: string;
  } | null;
  if (!body?.clientId || !body.startDate || !body.endDate) {
    return NextResponse.json({ ok: false, error: "clientId, startDate and endDate are required." }, { status: 422 });
  }

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

  // Theme extraction uses the routed provider when available; the brief and
  // review remain fully functional without it.
  let provider: ClinicalAIProvider;
  try {
    provider = resolveProvider({ task: "note_themes", containsPhi: !IS_PREVIEW });
  } catch {
    provider = new MockProvider(); // preview-grade themes only; deterministic layers unaffected
  }

  const retriever: EvidenceRetriever = IS_PREVIEW
    ? { retrieve: async ({ clientId }) => (await import("@/lib/preview-report")).getPreviewRetrieval(clientId) }
    : (await import("@/lib/server/retriever")).liveRetriever(sb!);

  const packet = await buildEvidencePacket(retriever, provider, {
    clientId: body.clientId, startDate: body.startDate, endDate: body.endDate,
  });
  const review = buildCaseReview(packet);
  const brief = buildSupervisionBrief(packet);

  if (sb) {
    await sb.from("evidence_packets").upsert({
      id: packet.packetId, clinic_id: clinicId, client_id: packet.client.id,
      period_start: body.startDate, period_end: body.endDate,
      packet, packet_hash: packet.packetHash, created_by: userId,
    });
    await sb.from("ai_requests").insert({
      clinic_id: clinicId, requesting_user: userId, client_id: packet.client.id,
      feature: "case_review", provider: provider.name, model: "deterministic + theme extraction",
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      evidence_packet_id: packet.packetId, evidence_packet_hash: packet.packetHash,
      output_id: `${packet.packetId}-review`, approval_status: null,
    });
  }

  return NextResponse.json({ ok: true, packet, review, brief });
}

function serverClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}
