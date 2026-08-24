import { prisma } from "@/lib/prisma";
import { computeEntitlements, type Entitlements, type RequestLite } from "./entitlements";

const DEADLINE_OFFSET_DAYS: Record<string, number | null> = {
  WEEK_1: 7,
  WEEK_2: 14,
  WITHIN_14_DAYS: 14,
  WITHIN_30_DAYS: 30,
  CUSTOM: null,
};

export interface TrainingDueItem {
  key: string;
  title: string;
  dueDate: Date | null;
  url: string | null;
  kind: string;
}

export interface DashboardData {
  onboarding: { requiredApplicable: number; completed: number; percent: number };
  nextTaskTitle: string | null;
  trainingDue: TrainingDueItem[];
  pdHours: number;
  certificatesCount: number;
  timeOff: Entitlements | null; // null when no hire date yet
  hireDate: Date | null;
}

export async function getHubDashboard(userId: string, hireDate: Date | null): Promise<DashboardData> {
  const [template, progress, completedTraining, pdAgg, certificatesCount, requests] = await Promise.all([
    prisma.hubOnboardingTemplate.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
      include: { tasks: { orderBy: { order: "asc" } } },
    }),
    prisma.hubTaskProgress.findMany({ where: { employeeUserId: userId } }),
    prisma.hubEmployeeTraining.findMany({
      where: { employeeUserId: userId, status: "COMPLETED" },
      select: { courseId: true },
    }),
    prisma.hubPdRecord.aggregate({ _sum: { hours: true }, where: { employeeUserId: userId } }),
    prisma.hubCertificate.count({ where: { employeeUserId: userId } }),
    prisma.hubTimeOffRequest.findMany({
      where: { employeeUserId: userId },
      select: { type: true, days: true, status: true, startDate: true },
    }),
  ]);

  // Onboarding progress, required + applicable items only.
  const progressByTask = new Map(progress.map((p) => [p.taskId, p]));
  const requiredTasks = (template?.tasks ?? []).filter((t) => t.required);
  const requiredApplicable = requiredTasks.filter(
    (t) => progressByTask.get(t.id)?.status !== "NOT_APPLICABLE" && progressByTask.get(t.id)?.applicable !== false,
  );
  const completed = requiredApplicable.filter((t) => progressByTask.get(t.id)?.status === "COMPLETED").length;
  const percent = requiredApplicable.length > 0 ? Math.round((completed / requiredApplicable.length) * 100) : 0;

  const nextTask = requiredApplicable.find((t) => {
    const st = progressByTask.get(t.id)?.status;
    return st !== "COMPLETED";
  });

  // Training due, compliance + clinical courses not yet completed, with due
  // dates derived from the hire date + the course's deadline bucket.
  const completedCourseIds = new Set(completedTraining.map((c) => c.courseId));
  const courses = await prisma.hubTrainingCourse.findMany({
    where: { active: true, kind: { in: ["COMPLIANCE", "CLINICAL"] } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
  });
  const trainingDue: TrainingDueItem[] = courses
    .filter((c) => !completedCourseIds.has(c.id))
    .map((c) => {
      const offset = DEADLINE_OFFSET_DAYS[c.deadlineBucket] ?? null;
      const dueDate = hireDate && offset != null ? new Date(hireDate.getTime() + offset * 86_400_000) : null;
      return { key: c.key, title: c.title, dueDate, url: c.externalUrl, kind: c.kind };
    })
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const pdHours = Number(pdAgg._sum.hours ?? 0);

  const timeOff = hireDate
    ? computeEntitlements(
        hireDate,
        requests.map<RequestLite>((r) => ({
          type: r.type as RequestLite["type"],
          days: Number(r.days),
          status: r.status as RequestLite["status"],
          startDate: r.startDate,
        })),
      )
    : null;

  return {
    onboarding: { requiredApplicable: requiredApplicable.length, completed, percent },
    nextTaskTitle: nextTask?.title ?? null,
    trainingDue,
    pdHours,
    certificatesCount,
    timeOff,
    hireDate,
  };
}
