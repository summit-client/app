/**
 * The real, dated calendar tab - replaces the old CalendarView in
 * pages/index.jsx, which rendered a fixed Mon-Sat/8am-6pm grid keyed by
 * weekday name only (no date arithmetic anywhere) filtered to one
 * "calendar" scheduling-term pill at a time.
 *
 * This owns its own date range, filters, and fetch - server-side and
 * date-range-scoped (`sessions_clinic_date_idx`, migration 0018) rather
 * than the old unfiltered `select("*")` that loaded every session ever
 * booked. Working hours come from @summit/settings (org-level,
 * calendar.workStart/workEnd/workDays) instead of the tab's own
 * never-persisted useState.
 *
 * Click-to-create here is a small, self-contained quick-create form
 * rather than a pref--filled hop into the multi-step CreateView wizard
 * (calendar terms, recurrence, batch staff/client matching) - that wizard
 * has no prefill seams today and hacking one in is a separate, riskier
 * change than this pass. This still inserts directly into `sessions` with
 * the same shape CreateView's own insert uses.
 */
import * as React from "react";
import { supabase } from "../../lib/supabase";
import { useAppUser } from "../../lib/UserContext";
import { getSetting, onSettingsChange } from "@summit/settings";
import {
  ViewMode, computeViewRange, shiftView, toDateStr, parseDateStr, addDays, parseTimeSetting, todayDateStr,
} from "./dateUtils";
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { FilterPanel, CalendarFilters, emptyFilters, activeFilterCount, matchesFilters } from "./FilterPanel";
import { RecurringIcon } from "./icons";
import type { CalSession, CalClient, CalEmployee, CalLocation, CalSessionType } from "./types";

const SPLIT_THRESHOLD = 8;

interface Props {
  clients: CalClient[];
  employees: CalEmployee[];
  locations: CalLocation[];
  sessionTypes: CalSessionType[];
  typeColors: Record<string, string>;
  showToast: (msg?: string) => void;
}

export function CalendarView({ clients, employees, locations, sessionTypes, typeColors, showToast }: Props) {
  const appUser = useAppUser();
  const clinicId = appUser?.clinic_id || "";
  const [mode, setMode] = React.useState<ViewMode>("week");
  const [weekendsInView, setWeekendsInView] = React.useState(false);
  const [nDays, setNDays] = React.useState(3);
  const [anchor, setAnchor] = React.useState<Date>(() => parseDateStr(todayDateStr()));
  const [sessions, setSessions] = React.useState<CalSession[]>([]);
  const [filters, setFilters] = React.useState<CalendarFilters>(emptyFilters());
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<CalSession | null>(null);
  const [, forceTick] = React.useState(0);

  React.useEffect(() => onSettingsChange(() => forceTick((n) => n + 1)), []);

  const workStartHour = parseTimeSetting(String(getSetting("calendar.workStart")));
  const workEndHour = parseTimeSetting(String(getSetting("calendar.workEnd")));

  const range = React.useMemo(
    () => computeViewRange(mode, anchor, { nDays, showWeekends: weekendsInView }),
    [mode, anchor, nDays, weekendsInView],
  );

  const loadRange = React.useCallback(async () => {
    if (!clinicId) return;
    let q = supabase.from("sessions").select("*")
      .eq("clinic_id", clinicId)
      .gte("session_date", toDateStr(range.queryStart))
      .lte("session_date", toDateStr(range.queryEnd))
      .neq("status", "cancelled");
    if (filters.locationIds.size) q = q.in("location_id", [...filters.locationIds]);
    if (filters.typeNames.size) q = q.in("type", [...filters.typeNames]);
    if (filters.employeeIds.size) q = q.in("employee_id", [...filters.employeeIds]);
    if (filters.clientIds.size) q = q.in("client_id", [...filters.clientIds]);
    const { data } = await q;
    if (data) setSessions(data as CalSession[]);
  }, [clinicId, range.queryStart, range.queryEnd, filters]);

  React.useEffect(() => {
    const t = setTimeout(() => { void loadRange(); }, 120);
    return () => clearTimeout(t);
  }, [loadRange]);

  const visibleSessions = React.useMemo(
    () => sessions.filter((s) => matchesFilters(s as any, filters)),
    [sessions, filters],
  );

  const splitEmployeeIds = filters.employeeIds.size > 0 && filters.employeeIds.size <= SPLIT_THRESHOLD
    ? [...filters.employeeIds]
    : null;

  function go(direction: 1 | -1) {
    setAnchor((a) => shiftView(mode, a, direction, nDays));
  }
  function goToday() {
    setMode((m) => (m === "month" ? "month" : m));
    setAnchor(parseDateStr(todayDateStr()));
  }

  // ── Click-to-create ──────────────────────────────────────────────────
  const [createDraft, setCreateDraft] = React.useState<{ dateStr: string; hour: number; minute: number } | null>(null);

  function openCreate(dateStr: string, hour: number, minute: number) {
    setCreateDraft({ dateStr, hour, minute });
  }

  // ── Drag-to-reschedule ───────────────────────────────────────────────
  const [pendingDrag, setPendingDrag] = React.useState<{ session: CalSession; dateStr: string; hour: number; minute: number } | null>(null);

  function hasConflict(session: CalSession, dateStr: string, hour: number, minute: number): CalSession | undefined {
    return sessions.find(
      (b) => b.id !== session.id && b.employee_id === session.employee_id &&
        b.session_date === dateStr && b.hour === hour && b.minute === minute && b.status !== "cancelled",
    );
  }

  async function applyReschedule(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    if (scope === "this" || !session.recurrence_id) {
      await supabase.from("sessions").update({ session_date: dateStr, hour, minute }).eq("id", session.id);
    } else {
      const { data: rows } = await supabase.from("sessions").select("*").eq("recurrence_id", session.recurrence_id);
      const oldDate = parseDateStr(session.session_date);
      const newDate = parseDateStr(dateStr);
      const dayDelta = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
      const targets = (rows || []).filter((r: any) => scope === "all" || r.session_date >= session.session_date);
      await Promise.all(targets.map((r: any) => {
        const shifted = addDays(parseDateStr(r.session_date), dayDelta);
        return supabase.from("sessions").update({ session_date: toDateStr(shifted), hour, minute }).eq("id", r.id);
      }));
    }
    await loadRange();
    showToast("Session rescheduled");
  }

  async function confirmAndApply(session: CalSession, dateStr: string, hour: number, minute: number, scope: "this" | "following" | "all") {
    const conflict = hasConflict(session, dateStr, hour, minute);
    if (conflict) {
      const emp = employees.find((e) => e.id === conflict.employee_id);
      const cl = clients.find((c) => c.id === conflict.client_id);
      if (!confirm(`This overlaps with ${cl?.name || "another session"} for ${emp?.name || "this clinician"} at that time. Reschedule anyway?`)) return;
    }
    await applyReschedule(session, dateStr, hour, minute, scope);
  }

  function handleDropSession(session: CalSession, dateStr: string, hour: number, minute: number) {
    if (session.session_date === dateStr && session.hour === hour && session.minute === minute) return;
    if (session.recurrence_id) {
      setPendingDrag({ session, dateStr, hour, minute });
    } else {
      void confirmAndApply(session, dateStr, hour, minute, "this");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Calendar</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{range.label}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => go(-1)} style={navBtn}>‹</button>
          <button onClick={goToday} style={navBtn}>Today</button>
          <button onClick={() => go(1)} style={navBtn}>›</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {(["day", "week", "month"] as ViewMode[]).map((m) => (
            <ModeButton key={m} active={mode === m && !(m === "week" && weekendsInView)} label={m === "week" ? "Work week" : m[0].toUpperCase() + m.slice(1)}
              onClick={() => { setMode(m); if (m === "week") setWeekendsInView(false); }} />
          ))}
          <ModeButton active={mode === "week" && weekendsInView} label="Full week" onClick={() => { setMode("week"); setWeekendsInView(true); }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>Days:</span>
          <input
            type="number" min={1} max={7} value={nDays}
            onChange={(e) => { const v = Math.max(1, Math.min(7, Number(e.target.value) || 1)); setNDays(v); setMode("ndays"); setAnchor(parseDateStr(todayDateStr())); }}
            style={{ width: 44, padding: "5px 6px", borderRadius: 7, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13 }}
          />
        </div>

        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button onClick={() => setFilterOpen((v) => !v)} style={{ ...navBtn, display: "flex", alignItems: "center", gap: 6 }}>
            Filter {activeFilterCount(filters) > 0 && <span style={badgeStyle}>{activeFilterCount(filters)}</span>}
          </button>
          {filterOpen && (
            <FilterPanel
              locations={locations} sessionTypes={sessionTypes} employees={employees} clients={clients}
              filters={filters} onChange={setFilters} onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid
          days={range.days} anchorMonth={anchor} sessions={visibleSessions} clients={clients} sessionTypes={sessionTypes}
          typeColors={typeColors}
          onSelectDay={(dateStr) => { setMode("day"); setAnchor(parseDateStr(dateStr)); }}
          onSessionClick={setSelected}
        />
      ) : (
        <TimeGrid
          days={range.days} sessions={visibleSessions} clients={clients} employees={employees} locations={locations}
          sessionTypes={sessionTypes} typeColors={typeColors} workStartHour={workStartHour} workEndHour={workEndHour}
          splitEmployeeIds={splitEmployeeIds} onSlotClick={openCreate} onSessionClick={setSelected} onDropSession={handleDropSession}
        />
      )}

      {selected && (
        <SessionDetail
          session={selected} clients={clients} employees={employees} locations={locations} typeColors={typeColors}
          onClose={() => setSelected(null)}
          onCancelled={() => { setSelected(null); void loadRange(); showToast("Session cancelled"); }}
        />
      )}

      {createDraft && (
        <QuickCreateModal
          draft={createDraft} clients={clients} employees={employees} locations={locations} sessionTypes={sessionTypes}
          clinicId={clinicId} sessions={sessions}
          onClose={() => setCreateDraft(null)}
          onCreated={() => { setCreateDraft(null); void loadRange(); showToast("Session booked"); }}
        />
      )}

      {pendingDrag && (
        <RecurrenceScopeModal
          onPick={(scope) => { const p = pendingDrag; setPendingDrag(null); void confirmAndApply(p.session, p.dateStr, p.hour, p.minute, scope); }}
          onCancel={() => setPendingDrag(null)}
        />
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16,
  borderRadius: 8, background: "#5DCAA5", color: "#fff", fontSize: 10.5, padding: "0 4px",
};

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: active ? 500 : 400,
        border: `1px solid ${active ? "#5DCAA5" : "var(--color-border-tertiary)"}`,
        background: active ? "#5DCAA518" : "var(--color-background-primary)",
        color: active ? "#3f9c78" : "var(--color-text-primary)", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function RecurrenceScopeModal({ onPick, onCancel }: { onPick: (scope: "this" | "following" | "all") => void; onCancel: () => void }) {
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary)" }}>
          <RecurringIcon size={16} /> Move recurring session
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>This session repeats. What should the new time apply to?</p>
        {[
          { key: "this", label: "This session only" },
          { key: "following", label: "This and following sessions" },
          { key: "all", label: "All sessions in the series" },
        ].map((o) => (
          <button key={o.key} onClick={() => onPick(o.key as any)} style={{ ...navBtn, width: "100%", textAlign: "left", marginBottom: 6 }}>
            {o.label}
          </button>
        ))}
        <button onClick={onCancel} style={{ ...navBtn, width: "100%", marginTop: 4, color: "var(--color-text-secondary)" }}>Cancel</button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  width: 340, background: "var(--color-background-primary)", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};

function SessionDetail({
  session, clients, employees, locations, typeColors, onClose, onCancelled,
}: {
  session: CalSession; clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[];
  typeColors: Record<string, string>; onClose: () => void; onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = React.useState(false);
  const client = clients.find((c) => c.id === session.client_id);
  const emp = employees.find((e) => e.id === session.employee_id);
  const loc = locations.find((l) => l.id === session.location_id);
  const color = typeColors[session.type] || "#888";

  async function handleCancel() {
    if (!confirm("Cancel this session?")) return;
    setCancelling(true);
    await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session.id);
    setCancelling(false);
    onCancelled();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, borderLeft: `4px solid ${color}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{client?.name || "Unknown client"}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>{emp?.name || "Unassigned"}</div>
        <DetailRow label="Date" value={session.session_date} />
        <DetailRow label="Time" value={`${String(session.hour).padStart(2, "0")}:${String(session.minute).padStart(2, "0")}`} />
        <DetailRow label="Location" value={session.is_home_visit ? (session.home_address || "Client's home") : (loc?.name || "—")} />
        <DetailRow label="Type" value={session.type} />
        <DetailRow label="Recurrence" value={session.recurrence_id ? "Recurring" : "One-time"} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={handleCancel} disabled={cancelling} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, border: "none", cursor: cancelling ? "not-allowed" : "pointer", background: "#FCE8E8", color: "#A33A3A" }}>
            {cancelling ? "Cancelling..." : "Cancel session"}
          </button>
          <button onClick={onClose} style={navBtn}>Close</button>
        </div>
      </div>
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

function QuickCreateModal({
  draft, clients, employees, locations, sessionTypes, clinicId, sessions, onClose, onCreated,
}: {
  draft: { dateStr: string; hour: number; minute: number };
  clients: CalClient[]; employees: CalEmployee[]; locations: CalLocation[]; sessionTypes: CalSessionType[];
  clinicId: string; sessions: CalSession[];
  onClose: () => void; onCreated: () => void;
}) {
  const [clientId, setClientId] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [type, setType] = React.useState<string>(sessionTypes[0]?.name || "");
  const [isHome, setIsHome] = React.useState(false);
  const [locationId, setLocationId] = React.useState<string>("");
  const [homeAddress, setHomeAddress] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const emp = employees.find((e) => String(e.id) === employeeId);
    if (emp?.location_id != null) setLocationId(String(emp.location_id));
  }, [employeeId, employees]);

  React.useEffect(() => {
    const client = clients.find((c) => String(c.id) === clientId);
    if (isHome && client?.address) setHomeAddress(client.address);
  }, [isHome, clientId, clients]);

  async function handleSave() {
    if (!clientId || !employeeId || !type) return;
    const empIdNum = Number(employeeId);
    const conflict = sessions.find(
      (b) => b.employee_id === empIdNum && b.session_date === draft.dateStr && b.hour === draft.hour && b.minute === draft.minute && b.status !== "cancelled",
    );
    if (conflict) {
      const c = clients.find((cl) => cl.id === conflict.client_id);
      if (!confirm(`This clinician already has a session with ${c?.name || "another client"} at that time. Book anyway?`)) return;
    }
    setSaving(true);
    await supabase.from("sessions").insert({
      client_id: Number(clientId),
      employee_id: empIdNum,
      session_date: draft.dateStr,
      hour: draft.hour,
      minute: draft.minute,
      type,
      status: "scheduled",
      clinic_id: clinicId,
      location_id: isHome ? null : (locationId ? Number(locationId) : null),
      is_home_visit: isHome,
      home_address: isHome ? (homeAddress || null) : null,
    });
    setSaving(false);
    onCreated();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>New session</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>
          {draft.dateStr} · {String(draft.hour).padStart(2, "0")}:{String(draft.minute).padStart(2, "0")}
        </div>

        <Field label="Client">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={selectStyle}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Clinician">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={selectStyle}>
            <option value="">Select clinician…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Session type">
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            {sessionTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <div style={{ display: "flex", gap: 6, marginBottom: isHome ? 6 : 0 }}>
            <button type="button" onClick={() => setIsHome(false)} style={{ ...navBtn, flex: 1, borderColor: !isHome ? "#5DCAA5" : undefined }}>Clinic</button>
            <button type="button" onClick={() => setIsHome(true)} style={{ ...navBtn, flex: 1, borderColor: isHome ? "#5DCAA5" : undefined }}>Client's home</button>
          </div>
          {isHome ? (
            <input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Address" style={selectStyle} />
          ) : (
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={selectStyle}>
              <option value="">Select location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </Field>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={navBtn}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !clientId || !employeeId}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: "#5DCAA5", color: "#fff", opacity: saving || !clientId || !employeeId ? 0.6 : 1 }}
          >
            {saving ? "Booking..." : "Book session"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13,
};
