/**
 * Minimal in-memory rate limiter for expensive/AI endpoints.
 *
 * NOTE: process-memory only, it resets on serverless cold start and is not
 * shared across instances. It is a first line of defence; for production put a
 * shared store (Upstash/Redis) behind the same interface, plus provider-side
 * spend caps (see MULTIMODAL.md, AI cost protection). A public AI endpoint must
 * never be able to run up an unlimited bill.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt };
}

/** Best-effort client key from headers (Phase 2: use the authenticated user id). */
export function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "anon").trim();
}
