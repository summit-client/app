import { prisma } from "@/lib/prisma";

export type CertStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

/** Lifecycle state of a certificate, driven by its expiry date. */
export function certStatus(expiryDate: Date | null, now = new Date()): CertStatus {
  if (!expiryDate) return "NO_EXPIRY";
  const days = (expiryDate.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "ACTIVE";
}

export const certStatusLabel: Record<CertStatus, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  NO_EXPIRY: "Active",
};

/**
 * Next sequential MEGBA certificate number for a year, e.g. MEGBA-2026-000142.
 * Counting is done inside the caller's transaction to avoid duplicate numbers.
 */
export async function nextCertNumber(
  tx: Pick<typeof prisma, "hubCertificate">,
  year: number,
): Promise<string> {
  const prefix = `MEGBA-${year}-`;
  const count = await tx.hubCertificate.count({ where: { certNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}
