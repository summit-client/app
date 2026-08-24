import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";
import { computeDueDate } from "@/lib/hub/deadlines";

export const runtime = "nodejs";

const schema = z.object({
  courseId: z.string().min(1),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  attestation: z.boolean().optional(),
  timeSpentMinutes: z.number().int().min(0).max(100000).optional(),
  certificateUrl: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link").optional().or(z.literal("")),
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
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid update." }, { status: 422 });
  const { courseId, status, timeSpentMinutes, certificateUrl } = parsed.data;

  const course = await prisma.hubTrainingCourse.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ ok: false, error: "Unknown course." }, { status: 404 });

  // Completing a training requires the employee's attestation.
  if (status === "COMPLETED" && !parsed.data.attestation) {
    return NextResponse.json(
      { ok: false, error: "Please confirm you completed this training." },
      { status: 422 },
    );
  }

  const now = new Date();
  const hireDate = user.profile.startDate ?? null;
  const dueDate = computeDueDate(hireDate, course.deadlineBucket);

  const update: Record<string, unknown> = {};
  if (timeSpentMinutes !== undefined) {
    update.timeSpentMinutes = timeSpentMinutes;
    update.timeSource = "manual"; // labelled honestly, this is time the employee entered
  }
  if (certificateUrl !== undefined) update.certificateUrl = certificateUrl || null;
  if (status !== undefined) {
    update.status = status;
    if (status === "IN_PROGRESS") update.startedAt = now;
    if (status === "COMPLETED") {
      update.completedAt = now;
      update.attestation = true;
    }
    if (status === "NOT_STARTED") {
      update.completedAt = null;
      update.attestation = false;
    }
  }

  const saved = await prisma.hubEmployeeTraining.upsert({
    where: { employeeUserId_courseId: { employeeUserId: user.id, courseId } },
    update,
    create: {
      employeeUserId: user.id,
      courseId,
      dueDate,
      status: status ?? "NOT_STARTED",
      attestation: status === "COMPLETED",
      timeSpentMinutes: timeSpentMinutes ?? 0,
      timeSource: timeSpentMinutes ? "manual" : null,
      certificateUrl: certificateUrl || null,
      completedAt: status === "COMPLETED" ? now : null,
      startedAt: status === "IN_PROGRESS" ? now : null,
    },
  });

  // Keep the matching onboarding task in sync when a training is completed.
  if (status === "COMPLETED") {
    const task = await prisma.hubOnboardingTask.findFirst({
      where: { courseKey: course.key, template: { active: true } },
    });
    if (task) {
      await prisma.hubTaskProgress.upsert({
        where: { employeeUserId_taskId: { employeeUserId: user.id, taskId: task.id } },
        update: { status: "COMPLETED", completedAt: now, employeeConfirmedAt: now },
        create: {
          employeeUserId: user.id,
          taskId: task.id,
          status: "COMPLETED",
          completedAt: now,
          employeeConfirmedAt: now,
          dueDate: computeDueDate(hireDate, task.deadlineBucket, task.customDueOffsetDays),
        },
      });
    }
    await recordHubAudit({
      actorUserId: user.id,
      employeeUserId: user.id,
      action: "training.completed",
      detail: { course: course.key },
    });
  }

  return NextResponse.json({
    ok: true,
    training: { status: saved.status, completedAt: saved.completedAt, timeSpentMinutes: saved.timeSpentMinutes },
  });
}
