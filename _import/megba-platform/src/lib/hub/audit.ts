import { prisma } from "@/lib/prisma";

/**
 * Append an HR/training audit event. Never throws into the caller, auditing
 * must not break the primary action.
 */
export async function recordHubAudit(event: {
  actorUserId?: string | null;
  employeeUserId?: string | null;
  action: string;
  detail?: Record<string, unknown> | null;
  verifierUserId?: string | null;
}): Promise<void> {
  try {
    await prisma.hubAuditEvent.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        employeeUserId: event.employeeUserId ?? null,
        action: event.action,
        detail: (event.detail ?? undefined) as object | undefined,
        verifierUserId: event.verifierUserId ?? null,
      },
    });
  } catch {
    /* swallow */
  }
}
