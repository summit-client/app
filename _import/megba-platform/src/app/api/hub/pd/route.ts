import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  provider: z.string().trim().max(120).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  source: z.string().trim().max(40).optional().or(z.literal("")),
  date: z.string().max(20).optional().or(z.literal("")),
  hours: z.number().min(0).max(1000),
  instructor: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  certificateUrl: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link").optional().or(z.literal("")),
  expiryDate: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const user = await getHubSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Please check the form." }, { status: 422 });
  const v = parsed.data;

  const rec = await prisma.hubPdRecord.create({
    data: {
      employeeUserId: user.id,
      title: v.title,
      provider: v.provider || null,
      category: v.category || null,
      source: v.source || null,
      date: v.date ? new Date(v.date) : null,
      hours: v.hours,
      instructor: v.instructor || null,
      description: v.description || null,
      certificateUrl: v.certificateUrl || null,
      expiryDate: v.expiryDate ? new Date(v.expiryDate) : null,
      notes: v.notes || null,
    },
  });
  await recordHubAudit({ actorUserId: user.id, employeeUserId: user.id, action: "pd.added", detail: { title: v.title, hours: v.hours } });

  return NextResponse.json({ ok: true, id: rec.id });
}

export async function DELETE(request: Request) {
  const user = await getHubSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

  // Only delete the caller's own, unverified record.
  const rec = await prisma.hubPdRecord.findUnique({ where: { id } });
  if (!rec || rec.employeeUserId !== user.id) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (rec.verified) {
    return NextResponse.json({ ok: false, error: "Verified records can't be deleted." }, { status: 403 });
  }
  await prisma.hubPdRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
