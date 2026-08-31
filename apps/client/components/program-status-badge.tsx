import { formatStatus } from "../lib/format-status";

/**
 * Shared goal/program status pill - used by both the dashboard's Progress
 * Snapshot card and the full pages/progress.tsx list, so a goal's status
 * reads identically (same colour, same label) everywhere it's shown.
 * Previously defined only inside design-b.tsx; pages/progress.tsx needs
 * the exact same badge, not a second copy that could drift from it.
 */
const PROGRAM_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  mastered: { bg: "#E6F6EF", text: "#1A7F4B" },
  active: { bg: "#EAF2FE", text: "#1D5FAE" },
  maintenance: { bg: "#EAF2FE", text: "#1D5FAE" },
  on_hold: { bg: "#FEF3E6", text: "#B4690E" },
  draft: { bg: "#F1F2F4", text: "#607987" },
  pending_signoff: { bg: "#F1F2F4", text: "#607987" },
  archived: { bg: "#F1F2F4", text: "#607987" },
};

export function ProgramStatusBadge({ status }: { status: string }) {
  const color = PROGRAM_STATUS_COLORS[status] ?? PROGRAM_STATUS_COLORS.draft;

  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: color.bg,
        color: color.text,
      }}
    >
      {formatStatus(status)}
    </span>
  );
}
