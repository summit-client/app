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
import { RecurrenceScopeModal } from "./RecurrenceScopeModal";
import type { AvailabilityRow } from "./suggestions";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { todayDateStr } from "./dateUtils";
import { useAppUser } from "../../lib/UserContext";
import { visibleClient, visibleLocation } from "../../lib/sessionPrivacy";

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
  /** Set when this session came from the "compare schedules" overlay
   *  (StaffOverlayPicker.tsx), so the modal's accent bar matches the colour
   *  the block was shown in on the grid, same as the tooltip already does -
   *  see TimeGrid.tsx's colorOverride prop. */
  colorOverride?: string;
  isDraft: boolean;
  /**
   * Whether the signed-in viewer may cancel/reschedule THIS session -
   * admin/scheduler always; a clinician only when session.employee_id is
   * their own linked staff row (2026-09-02, migration 0046 + full read
   * parity for the scheduler portal). Both callers (CalendarView.tsx,
   * pages/index.jsx's SessionsView) compute this per-session and pass it in
   * rather than this component re-deriving it, since it already needs
   * appUser identity it doesn't otherwise hold. When false, both action
   * buttons are omitted entirely (not just disabled) - the same "don't
   * offer an action that will just fail" rule the Sessions list view
   * applies, since an UPDATE this session's RLS policy excludes matches
   * zero rows and reports success, not an error.
   */
  canManage: boolean;
  staffAvailability: AvailabilityRow[];
  clientAvailability: ClientAvailabilityRow[];
  clinicId: string;
  workStartHour: number;
  workEndHour: number;
  incrementMinutes: number;
  onClose: () => void;
  onCancelled: () => void;
  /** Fired after a successful "Mark no-show" write, same shape as
   *  onCancelled - see that callback's callers for what they do with it
   *  (close the modal, refresh the list, toast). */
  onNoShow: () => void;
  /** No slot: plain "Reschedule" click. With a slot: the dual-schedule panel
   *  proposed one - either way the caller opens RescheduleModal. */
  onReschedule: (proposedSlot?: { dateStr: string; hour: number; minute: number }) => void;
}

export function SessionDetail({
  session, clients, employees, locations, sessionTypes, typeColors, colorOverride, isDraft,
  staffAvailability, clientAvailability, clinicId, workStartHour, workEndHour, incrementMinutes,
  onClose, onCancelled, onNoShow, onReschedule, canManage,
}: SessionDetailProps) {
  useEscapeToClose(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [markingNoShow, setMarkingNoShow] = React.useState(false);
  const [noShowError, setNoShowError] = React.useState<string | null>(null);
  const [showSchedules, setShowSchedules] = React.useState(false);
  // Same this/following/all choice drag-to-reschedule and the Reschedule
  // modal already offer (RecurrenceScopeModal) - only shown when the session
  // being cancelled is part of a series (session.recurrence_id set); a
  // one-time session skips straight to executeCancel("this"), unchanged from
  // before this was added.
  const [showCancelScopePicker, setShowCancelScopePicker] = React.useState(false);
  const viewer = useAppUser();
  // `client` is undefined whenever the viewer may not see who this session
  // is with, not merely re-labelled - so everything downstream of here
  // (SessionSchedulesPanel, its own query) has nothing to leak even if a
  // future change forgets the `masked` checks below.
  const { client, name: clientName, masked } = visibleClient(viewer, session, clients);
  const emp = employees.find((e) => e.id === session.employee_id);
  const locationText = visibleLocation(viewer, session, locations).text;
  const color = colorOverride ?? (typeColors[session.type] || "#888");
  // Only offer "Mark no-show" for a session that has actually happened
  // (today or earlier - never a future session, since no one can know yet
  // that the client didn't show) and that hasn't already moved off
  // "scheduled" (matches handleCancel's implicit assumption that cancelling
  // an already-cancelled/completed/no-show session doesn't make sense).
  const canMarkNoShow = session.status === "scheduled" && session.session_date <= todayDateStr();

  function handleCancel() {
    if (session.recurrence_id) {
      setShowCancelScopePicker(true);
      return;
    }
    void executeCancel("this");
  }

  async function executeCancel(scope: "this" | "following" | "all") {
    const confirmMsg = scope === "this"
      ? "Cancel this session?"
      : scope === "following"
        ? "Cancel this and every future session in the series?"
        : "Cancel every session in the series?";
    if (!confirm(confirmMsg)) return;
    setCancelling(true);
    setCancelError(null);
    // Pure status-flip, no date-shift math needed (unlike the reschedule
    // case) - "following"/"all" widen which rows the same update touches,
    // scoped by recurrence_id and, for "following", session_date >= this
    // occurrence's own date.
    let q = supabase.from("sessions").update({ status: "cancelled" });
    if (scope === "this") {
      q = q.eq("id", session.id);
    } else if (scope === "following") {
      q = q.eq("recurrence_id", session.recurrence_id).gte("session_date", session.session_date);
    } else {
      q = q.eq("recurrence_id", session.recurrence_id);
    }
    const { error } = await q;
    setCancelling(false);
    if (error) { setCancelError("Cancel failed. Please try again."); return; }
    onCancelled();
  }

  async function handleNoShow() {
    if (!confirm("Mark this session as a no-show?")) return;
    setMarkingNoShow(true);
    setNoShowError(null);
    const { error } = await supabase.from("sessions").update({ status: "no_show" }).eq("id", session.id);
    setMarkingNoShow(false);
    if (error) { setNoShowError("Mark no-show failed. Please try again."); return; }
    onNoShow();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Session detail for ${clientName}`} style={{ ...modalStyle, borderLeft: `4px solid ${color}` }} onClick={(e) => e.stopPropagation()}>
        {isDraft && (
          <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: "#8A5E10", background: "#EF9F2722", borderRadius: 5, padding: "2px 8px", marginBottom: 8 }}>
            DRAFT — not yet on the confirmed calendar
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{clientName}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{emp?.name || "Unassigned"}</div>
        <DetailRow label="Date" value={session.session_date} />
        <DetailRow label="Time" value={`${String(session.hour).padStart(2, "0")}:${String(session.minute).padStart(2, "0")}`} />
        <DetailRow label="Location" value={locationText} />
        <DetailRow label="Type" value={session.type} />
        <DetailRow label="Recurrence" value={session.recurrence_id ? "Recurring" : "One-time"} />
        {cancelError && <div style={{ fontSize: 13, color: "#A33A3A", marginTop: 8 }}>{cancelError}</div>}
        {noShowError && <div style={{ fontSize: 13, color: "#8A5A1E", marginTop: 8 }}>{noShowError}</div>}

        {/* `masked` is redundant with `!client` today (visibleClient returns
            no client row when masked) and is stated anyway: it is the only
            thing left standing if someone later resolves `client`
            independently of the mask. The old copy blamed missing data for
            what is really a permission, which reads as a bug. */}
        <button
          onClick={() => setShowSchedules(true)}
          disabled={masked || !client || !emp}
          title={masked ? "Only available for your own sessions." : (!client || !emp) ? "Needs both a client and a clinician on file" : undefined}
          style={{ width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: (masked || !client || !emp) ? "not-allowed" : "pointer", opacity: (masked || !client || !emp) ? 0.5 : 1 }}
        >
          View both schedules
        </button>

        {/* flexWrap at every width, not just on a phone: this modal is a
            fixed 340px everywhere, and four buttons (Mark no-show renders
            for any past-dated still-scheduled session) already overflow
            that card on a desktop, since modalStyle sets no overflow. */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {canManage && (
            <>
              {canMarkNoShow && (
                <button onClick={handleNoShow} disabled={markingNoShow} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: markingNoShow ? "not-allowed" : "pointer", background: "#FDF0DC", color: "#8A5A1E" }}>
                  {markingNoShow ? "Marking..." : "Mark no-show"}
                </button>
              )}
              <button onClick={handleCancel} disabled={cancelling} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: cancelling ? "not-allowed" : "pointer", background: "#FCE8E8", color: "#A33A3A" }}>
                {cancelling ? "Cancelling..." : "Cancel session"}
              </button>
              <button onClick={() => onReschedule()} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", background: "#5DCAA5", color: "#fff" }}>
                Reschedule
              </button>
            </>
          )}
          <button onClick={onClose} style={navBtn}>Close</button>
        </div>
      </div>

      {showSchedules && !masked && client && emp && (
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
          canPropose={canManage}
        />
      )}

      {showCancelScopePicker && (
        <RecurrenceScopeModal
          title="Cancel recurring session"
          prompt="This session repeats. What should cancelling apply to?"
          onPick={(scope) => { setShowCancelScopePicker(false); void executeCancel(scope); }}
          onCancel={() => setShowCancelScopePicker(false)}
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
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2.8px)", WebkitBackdropFilter: "blur(2.8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  // The 16px gutter is on the MODAL, not on overlayStyle, on purpose:
  // SessionSchedulesPanel and RecurrenceScopeModal both render inside that
  // overlay, and its backdrop-filter makes it their fixed-positioning
  // containing block - padding there would silently shrink both nested
  // dialogs away from the screen edges too. A flat `width: 340` clipped
  // symmetrically below 340px (Fold cover screen, split-screen), and the
  // left half of that clip is unreachable.
  width: "min(340px, calc(100% - 32px))",
  background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};
const navBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};
