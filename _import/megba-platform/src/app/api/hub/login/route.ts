import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/hub/crypto";
import {
  normalizeEmail,
  isAllowedHubEmail,
  HUB_DOMAIN_REJECT_MESSAGE,
} from "@/lib/hub/email";
import { hubLoginRateCheck, recordHubLoginAttempt, clientIp } from "@/lib/hub/rate-limit";
import { createHubSession } from "@/lib/hub/session";
import { recordHubAudit } from "@/lib/hub/audit";
import { hubAdminEmails } from "@/content/hub/onboarding";

/**
 * Beta login: validates BOTH the exact email domain AND the shared beta password
 * (held only in HUB_BETA_PASSWORD, never in the client or the DB). Rate-limited,
 * and each employee is upserted as an individual user.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const rateKey = `${clientIp(request)}|${email}`;

  // Rate limit first.
  const rl = await hubLoginRateCheck(rateKey);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const beta = process.env.HUB_BETA_PASSWORD;
  if (!beta) {
    // Misconfiguration, do not reveal details to the client.
    console.error("[hub] HUB_BETA_PASSWORD is not set; logins cannot succeed.");
    return NextResponse.json({ ok: false, error: "Login is not available right now." }, { status: 503 });
  }

  const domainOk = isAllowedHubEmail(email);
  const passwordOk = safeEqual(password, beta);

  if (!domainOk) {
    await recordHubLoginAttempt(rateKey, false);
    return NextResponse.json({ ok: false, error: HUB_DOMAIN_REJECT_MESSAGE }, { status: 403 });
  }
  if (!passwordOk) {
    await recordHubLoginAttempt(rateKey, false);
    return NextResponse.json({ ok: false, error: "Incorrect access password." }, { status: 401 });
  }

  // Success, every employee is an individual user even in the shared-password beta.
  const isAdmin = hubAdminEmails.map((e) => e.toLowerCase()).includes(email);
  const user = await prisma.hubUser.upsert({
    where: { email },
    update: { lastActivityAt: new Date(), status: "ACTIVE" },
    create: { email, role: isAdmin ? "ADMIN" : "EMPLOYEE", status: "ACTIVE", lastActivityAt: new Date() },
    include: { profile: true },
  });

  await createHubSession(user.id);
  await recordHubLoginAttempt(rateKey, true);
  await recordHubAudit({ actorUserId: user.id, employeeUserId: user.id, action: "auth.login" });

  return NextResponse.json({ ok: true, needsProfile: !user.profile });
}
