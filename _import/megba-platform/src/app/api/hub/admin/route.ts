import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";
import { sendEmail } from "@/lib/email";
import { nextCertNumber } from "@/lib/hub/certificates";

export const runtime = "nodejs";

const signoffSchema = z.object({
  action: z.literal("signoff"),
  progressId: z.string().min(3), // "employeeUserId:taskId"
  decision: z.enum(["APPROVED", "RETURNED"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
const timeoffSchema = z.object({
  action: z.literal("timeoff"),
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "DENIED"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
const pdSchema = z.object({
  action: z.literal("pd_verify"),
  id: z.string().min(1),
  verified: z.boolean(),
});
const certSchema = z.object({
  action: z.literal("issue_certificate"),
  employeeUserId: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  competency: z.string().trim().max(200).optional().or(z.literal("")),
  instructor: z.string().trim().max(120).optional().or(z.literal("")),
  trainingHours: z.number().min(0).max(9999).optional(),
  expiryDate: z.string().max(20).optional().or(z.literal("")),
});
const schema = z.discriminatedUnion("action", [signoffSchema, timeoffSchema, pdSchema, certSchema]);

function fmt(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export async function POST(request: Request) {
  const admin = await getHubSessionUser();
  if (!admin) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });

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
  const data = parsed.data;

  // ---- Task sign-off ----
  if (data.action === "signoff") {
    const [employeeUserId, taskId] = data.progressId.split(":");
    if (!employeeUserId || !taskId) {
      return NextResponse.json({ ok: false, error: "Unknown task." }, { status: 422 });
    }
    const approved = data.decision === "APPROVED";
    await prisma.hubTaskProgress.update({
      where: { employeeUserId_taskId: { employeeUserId, taskId } },
      data: approved
        ? { status: "COMPLETED", supervisorSignedById: admin.id, supervisorSignedAt: new Date(), completedAt: new Date() }
        : { status: "IN_PROGRESS", supervisorSignedById: null, supervisorSignedAt: null },
    });
    await prisma.hubSignoff.create({
      data: {
        employeeUserId,
        subjectKind: "TASK",
        subjectRef: taskId,
        supervisorUserId: admin.id,
        decision: data.decision,
        note: data.note || null,
      },
    });
    await recordHubAudit({
      actorUserId: admin.id,
      employeeUserId,
      action: approved ? "signoff.approved" : "signoff.returned",
      detail: { taskId },
    });
    return NextResponse.json({ ok: true });
  }

  // ---- Time-off decision ----
  if (data.action === "timeoff") {
    const req = await prisma.hubTimeOffRequest.findUnique({
      where: { id: data.id },
      include: { employee: { include: { profile: true } } },
    });
    if (!req) return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
    const status = data.decision === "APPROVED" ? "APPROVED" : "DENIED";
    await prisma.hubTimeOffRequest.update({
      where: { id: req.id },
      data: { status, decidedById: admin.id, decidedAt: new Date(), note: data.note || null },
    });
    const label = req.type === "VACATION" ? "Vacation" : "Sick / mental-health";
    try {
      await sendEmail({
        to: req.employee.email,
        subject: `Your time-off request was ${status === "APPROVED" ? "approved" : "declined"}`,
        text:
          `Your ${label.toLowerCase()} request for ${fmt(req.startDate)} to ${fmt(req.endDate)} ` +
          `(${Number(req.days)} day${Number(req.days) === 1 ? "" : "s"}) was ${status === "APPROVED" ? "approved" : "declined"}.` +
          (data.note ? `\n\nNote: ${data.note}` : "") +
          `\n\nSee your balances in the Employee Hub.`,
      });
    } catch {
      /* decision is recorded regardless */
    }
    await recordHubAudit({
      actorUserId: admin.id,
      employeeUserId: req.employeeUserId,
      action: status === "APPROVED" ? "time_off.approved" : "time_off.denied",
      detail: { type: req.type, days: Number(req.days) },
    });
    return NextResponse.json({ ok: true });
  }

  // ---- PD verification ----
  if (data.action === "pd_verify") {
    const rec = await prisma.hubPdRecord.findUnique({ where: { id: data.id } });
    if (!rec) return NextResponse.json({ ok: false, error: "Record not found." }, { status: 404 });
    await prisma.hubPdRecord.update({
      where: { id: rec.id },
      data: data.verified
        ? { verified: true, verifyStatus: "VERIFIED", verifiedById: admin.id, verifiedAt: new Date() }
        : { verified: false, verifyStatus: "UNVERIFIED", verifiedById: null, verifiedAt: null },
    });
    await recordHubAudit({
      actorUserId: admin.id,
      employeeUserId: rec.employeeUserId,
      action: data.verified ? "pd.verified" : "pd.unverified",
      detail: { pdId: rec.id },
    });
    return NextResponse.json({ ok: true });
  }

  // ---- Issue a MEGBA certificate ----
  const expiry = data.expiryDate ? new Date(data.expiryDate) : null;
  if (expiry && Number.isNaN(expiry.getTime())) {
    return NextResponse.json({ ok: false, error: "Please choose a valid expiry date." }, { status: 422 });
  }
  const cert = await prisma.$transaction(async (tx) => {
    const certNumber = await nextCertNumber(tx, new Date().getFullYear());
    return tx.hubCertificate.create({
      data: {
        certNumber,
        employeeUserId: data.employeeUserId,
        title: data.title,
        competency: data.competency || null,
        instructor: data.instructor || null,
        trainingHours: data.trainingHours ?? null,
        expiryDate: expiry,
        verifyStatus: "VERIFIED",
      },
    });
  });
  await recordHubAudit({
    actorUserId: admin.id,
    employeeUserId: data.employeeUserId,
    action: "certificate.issued",
    detail: { certNumber: cert.certNumber, title: cert.title },
  });
  return NextResponse.json({ ok: true, certNumber: cert.certNumber, id: cert.id });
}
