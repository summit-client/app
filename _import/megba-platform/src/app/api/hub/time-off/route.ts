import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";
import { sendEmail } from "@/lib/email";
import { inclusiveDays } from "@/lib/hub/entitlements";

export const runtime = "nodejs";

const OFFICE_INBOX = process.env.HUB_TIMEOFF_INBOX || "office@mountetnachildservices.com";

const schema = z.object({
  type: z.enum(["VACATION", "SICK"]),
  startDate: z.string().min(8).max(20),
  endDate: z.string().min(8).max(20),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

function fmt(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

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
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Please check the form and try again." }, { status: 422 });
  }
  const { type, startDate, endDate, reason } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ ok: false, error: "Please choose a valid date range." }, { status: 422 });
  }
  const days = inclusiveDays(start, end);
  if (days > 60) {
    return NextResponse.json({ ok: false, error: "That request is too long. Please contact the office." }, { status: 422 });
  }

  const created = await prisma.hubTimeOffRequest.create({
    data: {
      employeeUserId: user.id,
      type,
      startDate: start,
      endDate: end,
      days,
      reason: reason || null,
      status: "REQUESTED",
    },
  });

  // Notify the office (best-effort; the request is recorded regardless).
  const p = user.profile;
  const name = p ? `${p.firstName} ${p.lastName}` : user.email;
  const label = type === "VACATION" ? "Vacation" : "Sick / mental-health";
  const text =
    `New time-off request from the Employee Hub\n\n` +
    `Employee: ${name}${p ? ` (${p.employeeNumber})` : ""}\n` +
    `Email: ${user.email}\n` +
    `Type: ${label}\n` +
    `Dates: ${fmt(start)} to ${fmt(end)} (${days} day${days === 1 ? "" : "s"})\n` +
    `Reason: ${reason || "(none)"}\n` +
    `Submitted: ${fmt(new Date())}\n\n` +
    `Review it in the Employee Hub.`;

  let notified = false;
  try {
    const res = await sendEmail({
      to: OFFICE_INBOX,
      subject: `Time-off request: ${name} (${label})`,
      text,
      replyTo: user.email,
    });
    notified = res.delivered;
  } catch {
    /* keep going; request is saved */
  }

  if (notified) {
    await prisma.hubTimeOffRequest.update({ where: { id: created.id }, data: { notified: true } });
  }

  await recordHubAudit({
    actorUserId: user.id,
    employeeUserId: user.id,
    action: "time_off.requested",
    detail: { type, days, notified },
  });

  return NextResponse.json({ ok: true, id: created.id, days, notified });
}

export async function GET() {
  const user = await getHubSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const requests = await prisma.hubTimeOffRequest.findMany({
    where: { employeeUserId: user.id },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ ok: true, requests });
}
