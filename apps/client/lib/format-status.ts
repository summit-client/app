/**
 * Turns a raw status value (`session_notes.status`, `sessions.status`,
 * `programs.status` - all lowercase, underscore-separated) into
 * display copy, e.g. "on_hold" -> "On Hold". Shared by the dashboard
 * (design-b.tsx), pages/appointments.tsx and pages/progress.tsx so the
 * same status always reads the same way everywhere it appears.
 */
export function formatStatus(status: string | null): string {
  if (!status) {
    return "Scheduled";
  }

  return status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
