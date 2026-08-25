import { NextResponse, type NextRequest } from "next/server";
import {
  MockProvider, resolveProvider, type ClinicalAIProvider,
} from "@summit/clinical-ai";

/**
 * POST /api/clinical-query — natural-language caseload querying.
 * The model's ONLY job is translating the question to one of the deterministic
 * filter ids; the analytics engine computes the results client-side over the
 * caseload facts. Questions are non-PHI by construction (free text typed by
 * the supervisor; no packet is sent), so routing allows the non-PHI path.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ ok: false, error: "A question is required." }, { status: 422 });
  if (question.length > 500) return NextResponse.json({ ok: false, error: "Question too long." }, { status: 413 });

  let provider: ClinicalAIProvider;
  try {
    provider = resolveProvider({ task: "clinical_query", containsPhi: false });
  } catch {
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
