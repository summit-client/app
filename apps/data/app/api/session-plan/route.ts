import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ClinicalAIUnavailableError, MockProvider, PROMPT_TEMPLATE_VERSION, resolveProvider, stableHash,
  type ClinicalAIProvider, type SessionPlanEvidence, type SuggestedSessionPlan,
} from "@summit/clinical-ai";

/**
 * POST /api/session-plan — Suggest Session Plan for ONE client's session.
 *
 * The deterministic engine selects the candidates (attention flags, days since
 * last run, maintenance due); the model only arranges today's session around
 * them. Session planning selects and organizes existing programming — it never
 * changes the treatment plan. Provider routing stays server-side, same as
 * every other Clinical Intelligence endpoint.
 */

export const runtime = "nodejs";
// Double-gated like proxy.ts's own PREVIEW_BYPASS - NEXT_PUBLIC_DEV_PREVIEW is
// browser-readable, so on its own it can't be trusted to skip this route's
// real auth/role check below.
const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

interface PostedGoal {
  programId: string; goalName: string; domain: string | null; status: string;
  currentMeanPct: number | null; lastRunDaysAgo: number | null;
  attentionFlag: string | null; isBehaviourProgram: boolean;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: number; clientName?: string; plannedDurationMin?: number;
    location?: string; focus?: string | null;
    goals?: PostedGoal[]; clientInterests?: string[]; supervisorPriorities?: string[];
  } | null;
  if (!body?.clientId || !body.plannedDurationMin || !body.location || !Array.isArray(body.goals)) {
    return NextResponse.json({ ok: false, error: "clientId, plannedDurationMin, location and goals are required." }, { status: 422 });
  }

  let userId: string | null = null;
  let clinicId: string | null = null;
  if (!IS_PREVIEW) {
    const sb = serverClient(request);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    const { data: profile } = await sb.from("profiles").select("role, clinic_id").eq("id", user.id).single();
    if (!profile || !["admin", "supervisor", "clinician"].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: "Staff access required." }, { status: 403 });
    }
    userId = user.id; clinicId = profile.clinic_id ?? null;
  }

  // Evidence is scoped to this one client; nothing outside their record enters.
  const evidence: SessionPlanEvidence = {
    client: { id: body.clientId, displayName: body.clientName ?? `Client ${body.clientId}` },
    plannedDurationMin: body.plannedDurationMin,
    location: body.location,
    focus: body.focus ?? null,
    goals: body.goals,
    maintenanceDueProgramIds: body.goals.filter((g) => g.status === "maintenance" || g.status === "mastered").map((g) => g.programId),
    generalizationNeeds: body.goals
      .filter((g) => g.attentionFlag === "criterion_met")
      .map((g) => `${g.goalName}: probe in a second setting / with a second person`),
    supervisorPriorities: body.supervisorPriorities ?? [],
    clientInterests: body.clientInterests ?? [],
  };

  let provider: ClinicalAIProvider;
  try {
    provider = resolveProvider({ task: "session_plan", containsPhi: !IS_PREVIEW });
  } catch {
    provider = new MockProvider(); // local-only fallback; nothing leaves the server
  }

  let plan: SuggestedSessionPlan;
  try {
    plan = await provider.suggestSessionPlan(evidence);
  } catch (e) {
    if (e instanceof ClinicalAIUnavailableError) {
      return NextResponse.json({ ok: false, degraded: true, error: e.message }, { status: 503 });
    }
    throw e;
  }

  // Guardrail: the model may only arrange supplied programs, never invent them.
  const known = new Set(body.goals.map((g) => g.programId));
  plan.priorityProgramIds = plan.priorityProgramIds.filter((id) => known.has(id));
  plan.maintenanceProgramIds = plan.maintenanceProgramIds.filter((id) => known.has(id));
  plan.activities = plan.activities.map((a) => ({ ...a, programIds: a.programIds.filter((id) => known.has(id)) }));

  if (!IS_PREVIEW) {
    const sb = serverClient(request);
    await sb.from("ai_requests").insert({
      clinic_id: clinicId, requesting_user: userId, client_id: body.clientId,
      feature: "session_plan", provider: provider.name, model: "session plan",
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      evidence_packet_id: `sp-${body.clientId}-${stableHash(evidence).slice(0, 8)}`,
      evidence_packet_hash: stableHash(evidence),
      output_id: `sp-out-${stableHash(plan)}`, approval_status: null,
    });
  }

  return NextResponse.json({ ok: true, plan });
}

function serverClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => { /* read-only */ } } },
  );
}
