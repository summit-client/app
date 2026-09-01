/**
 * The session click-popup - opened from the calendar grid (TimeGrid/MonthGrid
 * via CalendarView's onSessionClick) and from the Sessions list
 * (pages/index.jsx's SessionsView) so both entry points share one component
 * instead of two divergent detail views. Originally lived inline in
 * CalendarView.tsx; pulled out so SessionsView could reuse it rather than
 * rebuilding an equivalent popup.
 *
 * "View both schedules" opens SessionSchedulesPanel (the dual mini-calendar)
 * - see that file's header for the PHI rule governing what it's allowed to
 * show. Picking a slot there calls back into `onReschedule` with that slot,
 * same callback the plain "Reschedule" button here uses with no slot - the
 * caller (CalendarView / SessionsView) is the one that actually opens
 * RescheduleModal, so this component never needs to know about it directly.
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { SessionSchedulesPanel } from "./SessionSchedulesPanel";
import type { AvailabilityRow } from "./suggestions";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface ClientAvailabilityRow { client_id: number; day: string; start_time: string; end_time: string }

function useEscapeToClose(onClose: () => void) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export interface SessionDetailProps {
  session: CalSession;
  clients: CalClient[];
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  isDraft: boolean;
  staffAvailability: AvailabilityRow[];
  clientAvailability: ClientAvailabilityRow[];
  clinicId: string;
  workStartHour: number;
  workEndHour: number;
  incrementMinutes: number;
  onClose: () => void;
  onCancelled: () => void;
  /** No slot: plain "Reschedule" click. With a slot: the dual-schedule panel
   *  proposed one - either way the caller opens RescheduleModal. */
  onReschedule: (proposedSlot?: { dateStr: string; hour: number; minute: number }) => void;
}

export function SessionDetail({
  session, clients, employees, locations, sessionTypes, typeColors, isDraft,
  staffAvailability, clientAvailability, clinicId, workStartHour, workEndHour, incrementMinutes,
  onClose, onCancelled, onReschedule,
}: SessionDetailProps) {
  useEscapeToClose(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [showSchedules, setShowSchedules] = React.useState(false);
  const client = clients.find((c) => c.id === session.client_id);
  const emp = employees.find((e) => e.id === session.employee_id);
  const loc = locations.find((l) => l.id === session.location_id);
  const color = typeColors[session.type] || "#888";

  async function handleCancel() {
    if (!confirm("Cancel this session?")) return;
    setCancelling(true);
    setCancelError(null);
    const { error } = await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session.id);
    setCancelling(false);
    if (error) { setCancelError("Cancel failed. Please try again."); return; }
    onCancelled();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Session detail for ${client?.name || "session"}`} style={{ ...modalStyle, borderLeft: `4px solid ${color}` }} onClick={(e) => e.stopPropagation()}>
        {isDraft && (
          <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: "#8A5E10", background: "#EF9F2722", borderRadius: 5, padding: "2px 8px", marginBottom: 8 }}>
            DRAFT — not yet on the confirmed calendar
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{client?.name || "Unknown client"}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{emp?.name || "Unassigned"}</div>
        <DetailRow label="Date" value={session.session_date} />
        <DetailRow label="Time" value={`${String(session.hour).padStart(2, "0")}:${String(session.minute).padStart(2, "0")}`} />
        <DetailRow label="Location" value={session.is_home_visit ? (session.home_address || "Client's home") : (loc?.name || "—")} />
        <DetailRow label="Type" value={session.type} />
        <DetailRow label="Recurrence" value={session.recurrence_id ? "Recurring" : "One-time"} />
        {cancelError && <div style={{ fontSize: 13, color: "#A33A3A", marginTop: 8 }}>{cancelError}</div>}

        <button
          onClick={() => setShowSchedules(true)}
          disabled={!client || !emp}
          title={!client || !emp ? "Needs both a client and a clinician on file" : undefined}
          style={{ width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: (!client || !emp) ? "not-allowed" : "pointer", opacity: (!client || !emp) ? 0.5 : 1 }}
        >
          View both schedules
        </button>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button onClick={handleCancel} disabled={cancelling} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: cancelling ? "not-allowed" : "pointer", background: "#FCE8E8", color: "#A33A3A" }}>
            {cancelling ? "Cancelling..." : "Cancel session"}
          </button>
          <button onClick={() => onReschedule()} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", background: "#5DCAA5", color: "#fff" }}>
            Reschedule
          </button>
          <button onClick={onClose} style={navBtn}>Close</button>
        </div>
      </div>

      {showSchedules && client && emp && (
        <SessionSchedulesPanel
          session={session}
          client={client}
          employee={emp}
          sessionTypes={sessionTypes}
          staffAvailability={staffAvailability}
          clientAvailability={clientAvailability}
          clinicId={clinicId}
          workStartHour={workStartHour}
          workEndHour={workEndHour}
          incrementMinutes={incrementMinutes}
          onClose={() => setShowSchedules(false)}
          onProposeSlot={(dateStr, hour, minute) => { setShowSchedules(false); onReschedule({ dateStr, hour, minute }); }}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  width: 340, background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};
const navBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
