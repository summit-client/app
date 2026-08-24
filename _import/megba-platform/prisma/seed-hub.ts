/**
 * Employee Hub seed — idempotent. Seeds configurable locations, the training
 * course catalog, the onboarding template + tasks, and admin roles from the
 * authoritative content module.
 *
 * Run:  npx tsx prisma/seed-hub.ts   (after prisma migrate)
 */
import { PrismaClient } from "@prisma/client";
import {
  hubLocations,
  hubCourses,
  hubOnboardingTemplate,
  hubOnboardingTasks,
  hubAdminEmails,
} from "../src/content/hub/onboarding";

const prisma = new PrismaClient();

async function main() {
  // Locations
  for (const loc of hubLocations) {
    await prisma.hubLocation.upsert({
      where: { name: loc.name },
      update: { order: loc.order, active: true },
      create: { name: loc.name, order: loc.order },
    });
  }

  // Training courses
  for (const c of hubCourses) {
    await prisma.hubTrainingCourse.upsert({
      where: { key: c.key },
      update: {
        title: c.title,
        provider: c.provider ?? null,
        kind: c.kind,
        category: c.category ?? null,
        externalUrl: c.externalUrl ?? null,
        deadlineBucket: c.deadlineBucket,
        order: c.order,
        active: c.active ?? true,
      },
      create: {
        key: c.key,
        title: c.title,
        provider: c.provider ?? null,
        kind: c.kind,
        category: c.category ?? null,
        externalUrl: c.externalUrl ?? null,
        deadlineBucket: c.deadlineBucket,
        order: c.order,
        active: c.active ?? true,
      },
    });
  }

  // Onboarding template (find-or-create by name + version)
  let template = await prisma.hubOnboardingTemplate.findFirst({
    where: { name: hubOnboardingTemplate.name, version: hubOnboardingTemplate.version },
  });
  if (!template) {
    template = await prisma.hubOnboardingTemplate.create({
      data: { name: hubOnboardingTemplate.name, version: hubOnboardingTemplate.version, active: true },
    });
  }

  // Tasks
  for (const t of hubOnboardingTasks) {
    await prisma.hubOnboardingTask.upsert({
      where: { templateId_key: { templateId: template.id, key: t.key } },
      update: {
        week: t.week,
        section: t.section,
        category: t.category,
        title: t.title,
        description: t.description ?? null,
        required: t.required ?? true,
        supervisorSignoffRequired: t.supervisorSignoffRequired ?? false,
        evidenceRequired: t.evidenceRequired ?? false,
        trainingUrl: t.trainingUrl ?? null,
        courseKey: t.courseKey ?? null,
        deadlineBucket: t.deadlineBucket,
        order: t.order,
      },
      create: {
        templateId: template.id,
        key: t.key,
        week: t.week,
        section: t.section,
        category: t.category,
        title: t.title,
        description: t.description ?? null,
        required: t.required ?? true,
        supervisorSignoffRequired: t.supervisorSignoffRequired ?? false,
        evidenceRequired: t.evidenceRequired ?? false,
        trainingUrl: t.trainingUrl ?? null,
        courseKey: t.courseKey ?? null,
        deadlineBucket: t.deadlineBucket,
        order: t.order,
      },
    });
  }

  // Admin roles
  for (const email of hubAdminEmails) {
    const e = email.trim().toLowerCase();
    await prisma.hubUser.upsert({
      where: { email: e },
      update: { role: "ADMIN" },
      create: { email: e, role: "ADMIN", status: "ACTIVE" },
    });
  }

  console.info(
    `Hub seed complete: ${hubLocations.length} locations, ${hubCourses.length} courses, ${hubOnboardingTasks.length} tasks, ${hubAdminEmails.length} admin(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
