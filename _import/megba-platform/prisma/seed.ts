/**
 * Database seed.
 *
 * Run with:  npm run db:seed   (after `prisma migrate dev`)
 *
 * Seeds languages, roles + permissions, a super-admin user, and demonstration
 * courses/articles/case studies. Idempotent via upsert.
 */
import { PrismaClient, RoleName, ContentStatus } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

// Pure data modules (no React/Next imports) — safe to import in a Node seed.
import { languages } from "../src/content/languages";
import { courses } from "../src/content/courses";
import { insights, caseStudies } from "../src/content/misc";

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const PERMISSIONS = [
  "user:manage",
  "role:manage",
  "course:publish",
  "translation:manage",
  "content:approve",
  "credential:verify",
  "partner:manage",
  "consultation:manage",
  "billing:manage",
  "analytics:view",
  "lead:view",
];

async function main() {
  // Languages
  for (const l of languages) {
    await prisma.language.upsert({
      where: { code: l.code },
      update: { label: l.label, nativeLabel: l.nativeLabel, dir: l.dir, enabled: l.enabled, reviewed: l.reviewed },
      create: { code: l.code, label: l.label, nativeLabel: l.nativeLabel, dir: l.dir, enabled: l.enabled, reviewed: l.reviewed },
    });
  }

  // Permissions
  const permissionRecords = await Promise.all(
    PERMISSIONS.map((key) =>
      prisma.permission.upsert({ where: { key }, update: {}, create: { key } }),
    ),
  );

  // Roles
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` },
    });
  }

  // Give SUPER_ADMIN every permission.
  const superAdmin = await prisma.role.findUnique({ where: { name: RoleName.SUPER_ADMIN } });
  if (superAdmin) {
    for (const perm of permissionRecords) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id } },
        update: {},
        create: { roleId: superAdmin.id, permissionId: perm.id },
      });
    }
  }

  // Super-admin user (change credentials immediately in production).
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@megba.example";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!12345";
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "MEGBA Super Admin",
      passwordHash: hashPassword(adminPassword),
      emailVerified: new Date(),
    },
  });
  if (superAdmin) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superAdmin.id } },
      update: {},
      create: { userId: admin.id, roleId: superAdmin.id },
    });
  }

  // Demonstration courses
  for (const c of courses) {
    await prisma.course.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        academy: c.academy,
        level: c.level,
        topic: c.topic,
        delivery: c.delivery,
        durationHours: c.durationHours,
        price: typeof c.price === "number" ? c.price : null,
        priceType: c.price === "Free" ? "free" : c.price === "Institutional" ? "institutional" : "paid",
        certificate: c.certificate,
        ceu: c.ceu,
        verifiedStatus: c.verifiedStatus,
        institutionalOnly: c.institutionalOnly,
        status: ContentStatus.PUBLISHED,
        modules: {
          create: c.modules.map((title, order) => ({ title, order })),
        },
        languages: {
          create: c.languages.map((langCode) => ({ langCode })),
        },
      },
    });
  }

  // Demonstration articles
  for (const a of insights) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body.join("\n\n"),
        category: a.category,
        author: a.author,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(a.date),
      },
    });
  }

  // Demonstration case studies
  for (const cs of caseStudies) {
    await prisma.caseStudy.upsert({
      where: { slug: cs.slug },
      update: {},
      create: {
        slug: cs.slug,
        title: cs.title,
        region: cs.region,
        audience: cs.audience,
        challenge: cs.challenge,
        approach: cs.approach,
        outcome: cs.outcome,
        status: ContentStatus.PUBLISHED,
      },
    });
  }

  console.info(`Seed complete. Super-admin: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
