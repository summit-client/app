import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";

export const runtime = "nodejs";

const schema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  jobTitle: z.string().trim().max(80).optional().or(z.literal("")),
  locationId: z.string().trim().max(40).optional().or(z.literal("")),
  supervisorName: z.string().trim().max(80).optional().or(z.literal("")),
  startDate: z.string().trim().max(20).optional().or(z.literal("")),
  photoUrl: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link").optional().or(z.literal("")),
});

/** Generate a unique internal employee number, e.g. MOU-2026-0004. */
async function nextEmployeeNumber(startDate: Date | null): Promise<string> {
  const year = (startDate ?? new Date()).getFullYear();
  const base = await prisma.hubEmployeeProfile.count();
  for (let i = 0; i < 5; i++) {
    const candidate = `MOU-${year}-${String(base + 1 + i).padStart(4, "0")}`;
    const clash = await prisma.hubEmployeeProfile.findUnique({ where: { employeeNumber: candidate } });
    if (!clash) return candidate;
  }
  return `MOU-${year}-${Date.now().toString().slice(-6)}`;
}

export async function POST(request: Request) {
  const user = await getHubSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const existing = await prisma.hubEmployeeProfile.findUnique({ where: { userId: user.id } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "Profile already exists." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Please check the form and try again." }, { status: 422 });
  }
  const d = parsed.data;

  // Validate the location belongs to the configured set (if provided).
  let locationId: string | null = null;
  if (d.locationId) {
    const loc = await prisma.hubLocation.findUnique({ where: { id: d.locationId } });
    locationId = loc ? loc.id : null;
  }
  const startDate = d.startDate ? new Date(d.startDate) : null;
  const validStart = startDate && !Number.isNaN(startDate.getTime()) ? startDate : null;

  const employeeNumber = await nextEmployeeNumber(validStart);

  const profile = await prisma.hubEmployeeProfile.create({
    data: {
      userId: user.id,
      employeeNumber,
      firstName: d.firstName,
      lastName: d.lastName,
      jobTitle: d.jobTitle || null,
      locationId,
      supervisorName: d.supervisorName || null,
      startDate: validStart,
      photoUrl: d.photoUrl || null,
      onboardingStartedAt: new Date(),
    },
  });

  await recordHubAudit({
    actorUserId: user.id,
    employeeUserId: user.id,
    action: "profile.created",
    detail: { employeeNumber },
  });

  return NextResponse.json({ ok: true, employeeNumber: profile.employeeNumber });
}
