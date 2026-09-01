/**
 * Shared shape for session_change_requests rows (migration 0035), used by
 * pages/appointments.tsx, components/request-change-modal.tsx and
 * pages/api/sessions/request-change.ts so the three don't each define their
 * own slightly-different copy of the same row.
 */
export type ChangeRequestType = "reschedule" | "cancel";
export type ChangeRequestStatus = "pending" | "approved" | "declined";

export type ChangeRequest = {
  id: string;
  session_id: number;
  request_type: ChangeRequestType;
  status: ChangeRequestStatus;
  created_at: string;
};
