import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";
import { computeDueDate } from "@/lib/hub/deadlines";

export const runtime = "nodejs";

const schema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "AWAITING_SIGNOFF", "NOT_APPLICABLE"]).optional(),
  notes: z.string().max(2000).optional(),
  applicable: z.boolean().optional(),
});

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
    return NextResponse.json({ ok: false, error: "Invalid update." }, { status: 422 });
  }
  const { taskId, notes, applicable } = parsed.data;

  const task = await prisma.hubOnboardingTask.findUnique({
    where: { id: taskId },
    include: { template: true },
  });
  if (!task || !task.template.active) {
    return NextResponse.json({ ok: false, error: "Unknown task." }, { status: 404 });
  }

  // Sign-off tasks can't be self-completed, the employee marks them ready.
  let status = parsed.data.status;
  if (status === "COMPLETED" && task.supervisorSignoffRequired) status = "AWAITING_SIGNOFF";

  const now = new Date();
  const hireDate = user.profile.startDate ?? null;
  const dueDate = computeDueDate(hireDate, task.deadlineBucket, task.customDueOffsetDays);

  const update: Record<string, unknown> = {};
  if (notes !== undefined) update.notes = notes;
  if (applicable !== undefined) update.applicable = applicable;
  if (status !== undefined) {
    update.status = status;
    if (status === "IN_PROGRESS") update.startedAt = now;
    if (status === "COMPLETED") {
      update.completedAt = now;
      update.employeeConfirmedAt = now;
    }
    if (status === "AWAITING_SIGNOFF") update.employeeConfirmedAt = now;
    if (status === "NOT_APPLICABLE") update.applicable = false;
    if (status === "NOT_STARTED") {
      update.completedAt = null;
      update.employeeConfirmedAt = null;
    }
  }

  const saved = await prisma.hubTaskProgress.upsert({
    where: { employeeUserId_taskId: { employeeUserId: user.id, taskId } },
    update,
    create: {
      employeeUserId: user.id,
      taskId,
      dueDate,
      status: status ?? "NOT_STARTED",
      applicable: applicable ?? true,
      notes: notes ?? null,
      startedAt: status === "IN_PROGRESS" ? now : null,
      completedAt: status === "COMPLETED" ? now : null,
      employeeConfirmedAt: status === "COMPLETED" || status === "AWAITING_SIGNOFF" ? now : null,
    },
  });

  if (status !== undefined) {
    await recordHubAudit({
      actorUserId: user.id,
      employeeUserId: user.id,
      action: "onboarding.task_status",
      detail: { key: task.key, status },
    });
  }

  return NextResponse.json({
    ok: true,
    progress: {
      status: saved.status,
      applicable: saved.applicable,
      notes: saved.notes,
      completedAt: saved.completedAt,
    },
  });
}
