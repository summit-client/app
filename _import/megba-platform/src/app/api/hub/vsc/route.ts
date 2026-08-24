import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";

export const runtime = "nodejs";

// Employees may self-report progress up to "Pending". CLEARED / REQUIRES_FOLLOWUP
// are set only by an admin (Phase 9), so an employee can't clear their own check.
const schema = z.object({ status: z.enum(["NOT_SUBMITTED", "APPLIED", "PENDING"]) });

export async function POST(request: Request) {
  const user = await getHubSessionUser();
  if (!user?.profile) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 422 });
  }

  await prisma.hubEmployeeProfile.update({
    where: { userId: user.id },
    data: { vscStatus: parsed.data.status, vscUpdatedAt: new Date() },
  });
  await recordHubAudit({
    actorUserId: user.id,
    employeeUserId: user.id,
    action: "vsc.self_reported",
    detail: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
