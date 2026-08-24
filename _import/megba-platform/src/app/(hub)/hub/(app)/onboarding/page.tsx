import Link from "next/link";
import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/hub/deadlines";
import { OnboardingBoard, type TaskVM } from "@/components/hub/onboarding-board";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "My Onboarding", path: "/hub/onboarding", noindex: true });

const WEEK_SUBTITLE: Record<number, string> = {
  1: "Get set up, ground yourself in policy, and begin supervised observation.",
  2: "Take on a hands-on role, lead part of a session, and confirm readiness.",
};

export default async function OnboardingPage() {
  const user = await requireHubUserWithProfile();
  const p = user.profile!;
  const hireDate = p.startDate ?? null;

  const [template, progressRows, courses] = await Promise.all([
    prisma.hubOnboardingTemplate.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
      include: { tasks: { orderBy: { order: "asc" } } },
    }),
    prisma.hubTaskProgress.findMany({ where: { employeeUserId: user.id } }),
    prisma.hubTrainingCourse.findMany({ select: { key: true, externalUrl: true } }),
  ]);

  const progressByTask = new Map(progressRows.map((r) => [r.taskId, r]));
  const courseUrl = new Map(courses.map((c) => [c.key, c.externalUrl]));

  const tasks: TaskVM[] = (template?.tasks ?? []).map((t) => {
    const pr = progressByTask.get(t.id);
    return {
      id: t.id,
      key: t.key,
      week: t.week,
      section: t.section,
      category: t.category,
      title: t.title,
      description: t.description,
      required: t.required,
      signoff: t.supervisorSignoffRequired,
      evidenceRequired: t.evidenceRequired,
      url: t.trainingUrl ?? (t.courseKey ? courseUrl.get(t.courseKey) ?? null : null),
      due: computeDueDate(hireDate, t.deadlineBucket, t.customDueOffsetDays)?.toISOString() ?? null,
      status: pr?.status ?? "NOT_STARTED",
      applicable: pr?.applicable ?? true,
      notes: pr?.notes ?? "",
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">My Onboarding</h1>
        <p className="mt-1 text-muted-foreground">
          Your Week 1 and Week 2 tasks. Everything saves automatically as you go.
        </p>
        {!hireDate ? (
          <p className="mt-3 rounded-md border border-ember/30 bg-ember/5 p-3 text-sm text-charcoal">
            Add your start date in{" "}
            <Link href="/hub/profile" className="font-medium text-forest hover:underline">your profile</Link>{" "}
            so we can show your task due dates.
          </p>
        ) : null}
      </header>

      {tasks.length ? (
        <OnboardingBoard
          tasks={tasks}
          vscStatus={p.vscStatus}
          weekSubtitles={WEEK_SUBTITLE}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          The onboarding template hasn&apos;t been set up yet. Run the seed to load it.
        </div>
      )}
    </div>
  );
}
