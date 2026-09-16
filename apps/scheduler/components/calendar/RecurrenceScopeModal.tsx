/**
 * The "This session only / This and following / All in the series" scope
 * picker shown before a series-aware write (reschedule, cancel) touches more
 * than one occurrence of a `sessions.recurrence_id` group.
 *
 * Originally lived inline in CalendarView.tsx (drag-to-reschedule was the
 * first caller - see applyReschedule there for the this/following/all shift
 * logic this picker feeds). Pulled out into its own file so
 * RescheduleModal.tsx's "Reschedule" button and SessionDetail.tsx's "Cancel
 * session" button can show the identical picker instead of each rebuilding
 * an equivalent one - CalendarView.tsx now imports it from here too.
 */
import * as React from "react";
import { RecurringIcon } from "./icons";
import { useFocusTrap } from "../../lib/useFocusTrap";

export type RecurrenceScope = "this" | "following" | "all";

function useEscapeToClose(onClose: () => void) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

interface Props {
  /** Defaults cover the reschedule/move wording (the original, only caller
   *  until now); SessionDetail's cancel flow overrides both for its own
   *  action instead of reusing "move"-flavoured copy for a cancel. */
  title?: string;
  prompt?: string;
  options?: { key: RecurrenceScope; label: string }[];
  onPick: (scope: RecurrenceScope) => void;
  onCancel: () => void;
}

export function RecurrenceScopeModal({
  title = "Move recurring session",
  prompt = "This session repeats. What should the new time apply to?",
  options,
  onPick,
  onCancel,
}: Props) {
  useEscapeToClose(onCancel);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const opts = options || [
    { key: "this" as const, label: "This session only" },
    { key: "following" as const, label: "This and following sessions" },
    { key: "all" as const, label: "All sessions in the series" },
  ];
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary)" }}>
          <RecurringIcon size={16} /> {title}
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>{prompt}</p>
        {opts.map((o) => (
          <button key={o.key} onClick={() => onPick(o.key)} style={{ ...navBtn, width: "100%", textAlign: "left", marginBottom: 6 }}>
            {o.label}
          </button>
        ))}
        <button onClick={onCancel} style={{ ...navBtn, width: "100%", marginTop: 4, color: "var(--color-text-secondary)" }}>Cancel</button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2.8px)", WebkitBackdropFilter: "blur(2.8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  width: 340, background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};
const navBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
