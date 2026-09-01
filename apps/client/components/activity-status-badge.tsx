import { formatStatus } from "../lib/format-status";
import type { ActivityStatus } from "../lib/activity-display";

/** Colours are distinct from ProgramStatusBadge's palette on purpose - an
 *  activity's status ("assigned" / "in_progress" / "completed") and a
 *  goal's status ("active" / "mastered" / ...) are different vocabularies
 *  and this page shows both a goal grouping and its activities together,
 *  so the two badge families need to read as clearly different things. */
const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, { bg: string; text: string }> = {
  completed: { bg: "#E6F6EF", text: "#1A7F4B" },
  in_progress: { bg: "#FEF3E6", text: "#B4690E" },
  assigned: { bg: "#F1F2F4", text: "#607987" },
};

export function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
  const color = ACTIVITY_STATUS_COLORS[status] ?? ACTIVITY_STATUS_COLORS.assigned;

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
