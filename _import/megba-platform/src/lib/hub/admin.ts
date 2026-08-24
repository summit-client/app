import { prisma } from "@/lib/prisma";

/** Onboarding progress for one employee, counting required + applicable tasks only. */
function onboardingProgress(
  requiredTaskIds: string[],
  progress: { taskId: string; status: string; applicable: boolean }[],
) {
  const byTask = new Map(progress.map((p) => [p.taskId, p]));
  let applicable = 0;
  let completed = 0;
  for (const id of requiredTaskIds) {
    const pr = byTask.get(id);
    if (pr && pr.applicable === false) continue;
    applicable += 1;
    if (pr && pr.status === "COMPLETED") completed += 1;
  }
  const percent = applicable ? Math.round((completed / applicable) * 100) : 0;
  return { applicable, completed, percent };
}

export interface DirectoryRow {
  id: string;
  name: string;
  employeeNumber: string;
  jobTitle: string | null;
  location: string | null;
  vscStatus: string;
  startDate: Date | null;
  onboardingPercent: number;
  trainingDue: number;
}

export interface AdminOverview {
  employees: DirectoryRow[];
  pendingSignoffs: { progressId: string; employeeId: string; employeeName: string; taskTitle: string; week: number }[];
  pendingTimeOff: { id: string; employeeName: string; type: string; startDate: Date; endDate: Date; days: number }[];
  unverifiedPd: number;
  recentAudit: { id: string; action: string; createdAt: Date; who: string; subject: string }[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [template, users, allProgress, allTraining, courses, pendingTimeOffRows, unverifiedPd, auditRows] =
    await Promise.all([
      prisma.hubOnboardingTemplate.findFirst({
        where: { active: true },
        orderBy: { version: "desc" },
        include: { tasks: true },
      }),
      prisma.hubUser.findMany({
        where: { status: "ACTIVE" },
        include: { profile: { include: { location: true } } },
      }),
      prisma.hubTaskProgress.findMany({ select: { employeeUserId: true, taskId: true, status: true, applicable: true } }),
      prisma.hubEmployeeTraining.findMany({ select: { employeeUserId: true, courseId: true, status: true } }),
      prisma.hubTrainingCourse.findMany({ where: { active: true, kind: { in: ["COMPLIANCE", "CLINICAL"] } }, select: { id: true } }),
      prisma.hubTimeOffRequest.findMany({
        where: { status: "REQUESTED" },
        include: { employee: { include: { profile: true } } },
        orderBy: { submittedAt: "asc" },
      }),
      prisma.hubPdRecord.count({ where: { verified: false } }),
      prisma.hubAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

  const tasks = template?.tasks ?? [];
  const requiredTaskIds = tasks.filter((t) => t.required).map((t) => t.id);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const courseIds = new Set(courses.map((c) => c.id));

  const progressByUser = new Map<string, typeof allProgress>();
  for (const p of allProgress) {
    let arr = progressByUser.get(p.employeeUserId);
    if (!arr) {
      arr = [];
      progressByUser.set(p.employeeUserId, arr);
    }
    arr.push(p);
  }
  const trainingDoneByUser = new Map<string, Set<string>>();
  for (const t of allTraining) {
    if (t.status !== "COMPLETED") continue;
    let set = trainingDoneByUser.get(t.employeeUserId);
    if (!set) {
      set = new Set<string>();
      trainingDoneByUser.set(t.employeeUserId, set);
    }
    set.add(t.courseId);
  }

  const withProfile = users.filter((u) => u.profile);
  const nameOf = new Map(withProfile.map((u) => [u.id, `${u.profile!.firstName} ${u.profile!.lastName}`]));

  const employees: DirectoryRow[] = withProfile
    .map((u) => {
      const prof = u.profile!;
      const prog = progressByUser.get(u.id) ?? [];
      const ob = onboardingProgress(requiredTaskIds, prog);
      const done = trainingDoneByUser.get(u.id) ?? new Set<string>();
      let trainingDue = 0;
      for (const id of courseIds) if (!done.has(id)) trainingDue += 1;
      return {
        id: u.id,
        name: `${prof.firstName} ${prof.lastName}`,
        employeeNumber: prof.employeeNumber,
        jobTitle: prof.jobTitle,
        location: prof.location?.name ?? null,
        vscStatus: prof.vscStatus,
        startDate: prof.startDate,
        onboardingPercent: ob.percent,
        trainingDue,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const pendingSignoffs = allProgress
    .filter((p) => p.status === "AWAITING_SIGNOFF")
    .map((p) => {
      const task = taskById.get(p.taskId);
      return {
        progressId: `${p.employeeUserId}:${p.taskId}`,
        employeeId: p.employeeUserId,
        employeeName: nameOf.get(p.employeeUserId) ?? "Employee",
        taskTitle: task?.title ?? "Task",
        week: task?.week ?? 1,
      };
    });

  const pendingTimeOff = pendingTimeOffRows.map((r) => ({
    id: r.id,
    employeeName: r.employee.profile ? `${r.employee.profile.firstName} ${r.employee.profile.lastName}` : r.employee.email,
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    days: Number(r.days),
  }));

  const recentAudit = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    createdAt: a.createdAt,
    who: (a.actorUserId && nameOf.get(a.actorUserId)) || "System",
    subject: (a.employeeUserId && nameOf.get(a.employeeUserId)) || "",
  }));

  return { employees, pendingSignoffs, pendingTimeOff, unverifiedPd, recentAudit };
}

/** Full record set for one employee, for the admin detail view and reports. */
export async function getEmployeeDetail(employeeUserId: string) {
  const [user, template, progress, training, courses, pd, certificates, timeOff, signoffs] = await Promise.all([
    prisma.hubUser.findUnique({
      where: { id: employeeUserId },
      include: { profile: { include: { location: true } } },
    }),
    prisma.hubOnboardingTemplate.findFirst({ where: { active: true }, orderBy: { version: "desc" }, include: { tasks: { orderBy: { order: "asc" } } } }),
    prisma.hubTaskProgress.findMany({ where: { employeeUserId } }),
    prisma.hubEmployeeTraining.findMany({ where: { employeeUserId } }),
    prisma.hubTrainingCourse.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { order: "asc" }] }),
    prisma.hubPdRecord.findMany({ where: { employeeUserId }, orderBy: { date: "desc" } }),
    prisma.hubCertificate.findMany({ where: { employeeUserId }, orderBy: { issuedDate: "desc" } }),
    prisma.hubTimeOffRequest.findMany({ where: { employeeUserId }, orderBy: { submittedAt: "desc" }, take: 50 }),
    prisma.hubSignoff.findMany({ where: { employeeUserId }, orderBy: { signedAt: "desc" }, take: 50 }),
  ]);
  if (!user || !user.profile) return null;
  const profile = user.profile;

  const tasks = template?.tasks ?? [];
  const progByTask = new Map(progress.map((p) => [p.taskId, p]));
  const requiredIds = tasks.filter((t) => t.required).map((t) => t.id);
  const ob = onboardingProgress(
    requiredIds,
    progress.map((p) => ({ taskId: p.taskId, status: p.status, applicable: p.applicable })),
  );
  const pdHours = pd.reduce((s, r) => s + Number(r.hours), 0);
  const trainingByCourse = new Map(training.map((t) => [t.courseId, t]));

  return { user, profile, tasks, progByTask, ob, training, trainingByCourse, courses, pd, pdHours, certificates, timeOff, signoffs };
}

export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployeeDetail>>>;
