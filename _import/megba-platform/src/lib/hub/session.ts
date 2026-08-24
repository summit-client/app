import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, sha256 } from "./crypto";

const COOKIE = "hub_session";

function ttlHours(): number {
  const n = Number(process.env.HUB_SESSION_TTL_HOURS || 168);
  return Number.isFinite(n) && n > 0 ? n : 168;
}

/** Create a DB-backed session and set a secure, httpOnly cookie. */
export async function createHubSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours() * 3600 * 1000);
  const userAgent = headers().get("user-agent")?.slice(0, 255) ?? null;

  await prisma.hubAuthSession.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent },
  });

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type HubSessionUser = NonNullable<Awaited<ReturnType<typeof getHubSessionUser>>>;

/** Resolve the current employee from the session cookie, or null. Read-only. */
export async function getHubSessionUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.hubAuthSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { profile: { include: { location: true } } } } },
  });

  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status === "DISABLED" || session.user.deletedAt) return null;

  return session.user;
}

/** Revoke the current session and clear the cookie. */
export async function destroyHubSession(): Promise<void> {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    await prisma.hubAuthSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookies().delete(COOKIE);
}
