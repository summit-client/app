import { randomBytes, createHash, timingSafeEqual } from "crypto";

/** Opaque, URL-safe session token (never stored raw, only its SHA-256 is kept). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time string comparison (avoids leaking length/position via timing). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing uniform, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
