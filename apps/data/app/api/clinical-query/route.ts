import { NextResponse, type NextRequest } from "next/server";
import {
  MockProvider, resolveProvider, type ClinicalAIProvider,
} from "@summit/clinical-ai";
import { requireStaff, routeServerClient } from "@/lib/server/authz";

/**
 * POST /api/clinical-query — natural-language caseload querying.
 * The model's ONLY job is translating the question to one of the deterministic
 * filter ids; the analytics engine computes the results client-side over the
 * caseload facts. Questions are non-PHI by construction (free text typed by
 * the supervisor; no packet is sent), so routing allows the non-PHI path.
 *
 * Auth/role check matches every other Clinical Intelligence endpoint in this
 * app (decision-tree, planning, reports/generate, session-plan, supervision)
 * — this route was previously the one gap where any signed-in user of any
 * role, not just staff of this clinic, could reach the AI provider.
 */

export const runtime = "nodejs";
// Double-gated like proxy.ts's own PREVIEW_BYPASS - NEXT_PUBLIC_DEV_PREVIEW is
// browser-readable, so on its own it can't be trusted to skip this route's
// real auth/role check below.
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ ok: false, error: "A question is required." }, { status: 422 });
  if (question.length > 500) return NextResponse.json({ ok: false, error: "Question too long." }, { status: 413 });

  if (!IS_PREVIEW) {
    const auth = await requireStaff(routeServerClient(request));
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let provider: ClinicalAIProvider;
  try {
    // containsPhi is declared by the caller - resolveProvider never inspects
    // the payload - and this route declared `false` for a 500-character free
    // text box that is only trimmed and length-checked. A supervisor asking
    // "is Maya still on the 3-step prompt?" is identifiable clinical data, so
    // the declaration was simply untrue, and it is the declaration alone that
    // decides whether the question may leave for a non-Azure provider.
    //
    // Declared true. The practical effect in an environment without
    // CLINICAL_AI_ALLOW_PHI is that this falls to the offline keyword
    // responder below rather than reaching a model - a worse answer, not a
    // silent one, and the safe direction under PHIPA. Nothing here redacts
    // the question, so nothing here can honestly declare it PHI-free.
    provider = resolveProvider({ task: "clinical_query", containsPhi: true });
  } catch (e) {
    // Logged, because "the model is not available for identifiable questions
    // in this environment" and "the key is missing" produce the same offline
    // answer on screen.
    console.warn("[data/clinical-query] falling back to the offline responder:",
      e instanceof Error ? e.message : e);
    provider = new MockProvider(); // keyword mapping still works offline
  }

  try {
    const out = await provider.answerClinicalQuery({ question }, { packets: [] });
    return NextResponse.json({ ok: true, ...out });
  } catch {
    // Deterministic keyword fallback keeps the feature alive without any provider.
    const out = await new MockProvider().answerClinicalQuery({ question }, { packets: [] });
    return NextResponse.json({ ok: true, ...out, degraded: true });
  }
}
