import { BookOpenCheck, ExternalLink } from "lucide-react";
import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/hub/deadlines";
import { TrainingList, type CourseVM } from "@/components/hub/training-list";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Training & Development", path: "/hub/training", noindex: true });

export default async function TrainingPage() {
  const user = await requireHubUserWithProfile();
  const hireDate = user.profile!.startDate ?? null;

  const [courses, training] = await Promise.all([
    prisma.hubTrainingCourse.findMany({
      where: { active: true, kind: { in: ["COMPLIANCE", "CLINICAL"] } },
      orderBy: [{ kind: "asc" }, { order: "asc" }],
    }),
    prisma.hubEmployeeTraining.findMany({ where: { employeeUserId: user.id } }),
  ]);
  const byCourse = new Map(training.map((t) => [t.courseId, t]));

  const items: CourseVM[] = courses.map((c) => {
    const t = byCourse.get(c.id);
    return {
      id: c.id,
      title: c.title,
      provider: c.provider,
      kind: c.kind,
      url: c.externalUrl,
      due: computeDueDate(hireDate, c.deadlineBucket)?.toISOString() ?? null,
      status: t?.status ?? "NOT_STARTED",
      completedAt: t?.completedAt?.toISOString() ?? null,
      timeSpentMinutes: t?.timeSpentMinutes ?? 0,
      certificateUrl: t?.certificateUrl ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Training &amp; Development</h1>
        <p className="mt-1 text-muted-foreground">
          Open each course, then mark it complete and confirm. Your completions save automatically.
        </p>
      </header>

      <a
        href="/clinical/visual-task-list.html"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-forest text-primary-foreground">
          <BookOpenCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-forest">BCBA Visual Task List &amp; Training Guide</p>
          <p className="text-sm text-forest/80">
            All 104 tasks across the nine domains, one diagram each, for supervision, fieldwork and study.
          </p>
        </div>
        <ExternalLink className="h-5 w-5 text-forest" aria-hidden />
      </a>

      <TrainingList items={items} />
    </div>
  );
}
