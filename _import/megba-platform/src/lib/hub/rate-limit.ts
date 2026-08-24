import { prisma } from "@/lib/prisma";
import { sha256 } from "./crypto";

/**
 * DB-backed login rate limiting (survives serverless cold starts, unlike an
 * in-memory counter). Keyed on a hash of ip + email so it is not linkable back
 * to a plaintext identifier.
 */
function limits() {
  const max = Number(process.env.HUB_LOGIN_MAX_ATTEMPTS || 8);
  const windowMin = Number(process.env.HUB_LOGIN_WINDOW_MINUTES || 15);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 8,
    windowMs: (Number.isFinite(windowMin) && windowMin > 0 ? windowMin : 15) * 60_000,
  };
}

export async function hubLoginRateCheck(rawKey: string): Promise<{ ok: boolean }> {
  const { max, windowMs } = limits();
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.hubLoginAttempt.count({
    where: { keyHash: sha256(rawKey), createdAt: { gte: since } },
  });
  return { ok: count < max };
}

export async function recordHubLoginAttempt(rawKey: string, success: boolean): Promise<void> {
  try {
    await prisma.hubLoginAttempt.create({ data: { keyHash: sha256(rawKey), success } });
  } catch {
    /* never block login on logging failure */
  }
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}
