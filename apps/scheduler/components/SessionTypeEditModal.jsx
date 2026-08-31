import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useFocusTrap } from "../lib/useFocusTrap";

const COLORS = {
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  border: "var(--color-border-tertiary)",
  borderS: "var(--color-border-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
  textT: "var(--color-text-tertiary)",
};

const PALETTE = ["#5DCAA5", "#378ADD", "#EF9F27", "#B57BE0", "#E2687B", "#9AA5B1", "#7C8CD8"];

export default function SessionTypeEditModal({ sessionType, clinicId, onSave, onClose, showToast }) {
  const isNew = !sessionType.id;
  const [name, setName] = useState(sessionType.name || "");
  const [duration, setDuration] = useState(sessionType.duration_minutes ?? sessionType.duration ?? 60);
  const [cost, setCost] = useState(sessionType.cost ?? sessionType.price ?? "");
  const [maxClients, setMaxClients] = useState(sessionType.max_clients ?? 1);
  const [gapBefore, setGapBefore] = useState(sessionType.gap_before_minutes ?? 0);
  const [gapAfter, setGapAfter] = useState(sessionType.gap_after_minutes ?? 0);
  const [gridIncrement, setGridIncrement] = useState(sessionType.grid_increment_minutes ?? "");
  const [clientOptional, setClientOptional] = useState(sessionType.is_client_optional ?? false);
  const [color, setColor] = useState(sessionType.color || PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // No Escape-to-close and no keyboard focus containment at all - closing
  // only worked via the outside-click handler already on the overlay div
  // below, or the close/Cancel buttons.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trapRef = useFocusTrap();

  async function handleSave() {
    if (!name.trim()) { setError("Session type name is required."); return; }
    if (Number(duration) <= 0) { setError("Duration must be greater than 0."); return; }
    if (Number(cost) < 0) { setError("Cost cannot be negative."); return; }
    if (Number(maxClients) < 1) { setError("Client slots must be at least 1."); return; }
    if (Number(gapBefore) < 0 || Number(gapAfter) < 0) { setError("Gap minutes cannot be negative."); return; }
    if (gridIncrement !== "" && Number(gridIncrement) <= 0) { setError("Scheduling increment must be greater than 0."); return; }

    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      duration: Number(duration),
      price: Number(cost),
      max_clients: Number(maxClients),
      color,
      gap_before_minutes: Number(gapBefore),
      gap_after_minutes: Number(gapAfter),
      grid_increment_minutes: gridIncrement === "" ? null : Number(gridIncrement),
      is_client_optional: clientOptional,
    };

    const { data, error: err } = isNew
      ? await supabase.from("session_types").insert({ ...payload, clinic_id: clinicId }).select().single()
      : await supabase.from("session_types").update(payload).eq("id", sessionType.id).select().single();

    setSaving(false);
    if (err) { setError("Save failed. Check console."); console.error(err); return; }
    onSave(data, isNew);
    showToast(isNew ? "Session type added" : "Session type saved");
  }

  const fields = [
    { label: "TITLE", type: "text", value: name, setter: setName, placeholder: "e.g. Direct Therapy" },
    { label: "DURATION (min)", type: "number", value: duration, setter: setDuration, placeholder: "60" },
    { label: "COST ($)", type: "number", value: cost, setter: setCost, placeholder: "0.00" },
    { label: "CLIENT SLOTS", type: "number", value: maxClients, setter: setMaxClients, placeholder: "1" },
    { label: "GAP BEFORE (min)", type: "number", value: gapBefore, setter: setGapBefore, placeholder: "0", min: 0 },
    { label: "GAP AFTER (min)", type: "number", value: gapAfter, setter: setGapAfter, placeholder: "0", min: 0 },
    { label: "SCHEDULING INCREMENT (min) — blank uses the org default", type: "number", value: gridIncrement, setter: setGridIncrement, placeholder: "org default", min: 1 },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={isNew ? "New session type" : "Edit session type"}
        style={{ background: COLORS.bg, borderRadius: 14, padding: "28px 28px 24px", width: 380, maxHeight: "85vh", overflowY: "auto", border: `0.5px solid ${COLORS.borderS}`, boxShadow: "0 8px 32px rgba(0,0,0,0.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: COLORS.text }}>{isNew ? "New session type" : "Edit session type"}</div>
          <button aria-label="Close edit session type modal" onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textT, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
          {fields.map(({ label, type, value, setter, placeholder, min }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textT, marginBottom: 5 }}>{label}</div>
              <input
                type={type}
                value={value}
                onChange={e => setter(e.target.value)}
                placeholder={placeholder}
                min={type === "number" ? min ?? 1 : undefined}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14 }}
              />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textT, marginBottom: 5 }}>COLOR</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)} aria-label={`Use color ${c}`}
                  style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid " + COLORS.text : "2px solid transparent", cursor: "pointer" }} />
              ))}
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COLORS.text, cursor: "pointer" }}>
            <input type="checkbox" checked={clientOptional} onChange={e => setClientOptional(e.target.checked)} style={{ accentColor: "#5DCAA5" }} />
            No client required (e.g. Break, Lunch, Meeting)
          </label>
        </div>
        {error && <div style={{ fontSize: 13, color: "#A32D2D", marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            {saving ? "Saving…" : isNew ? "Add session type" : "Save changes"}
          </button>
          <button onClick={onClose}
            style={{ padding: "9px 18px", borderRadius: 8, background: COLORS.bgS, color: COLORS.textS, border: `0.5px solid ${COLORS.border}`, cursor: "pointer", fontSize: 14 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
