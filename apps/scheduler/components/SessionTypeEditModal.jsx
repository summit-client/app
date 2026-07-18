import { useState } from "react";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  border: "var(--color-border-tertiary)",
  borderS: "var(--color-border-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
  textT: "var(--color-text-tertiary)",
};

export default function SessionTypeEditModal({ sessionType, onSave, onClose, showToast }) {
  const [name, setName] = useState(sessionType.name);
  const [duration, setDuration] = useState(sessionType.duration_minutes ?? sessionType.duration ?? 60);
  const [cost, setCost] = useState(sessionType.cost ?? sessionType.price ?? "");
  const [maxClients, setMaxClients] = useState(sessionType.max_clients ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    console.log("SessionType =", sessionType);
  const { data, error: err } = await supabase
  .from("session_types")
  .update({
    name: name.trim(),
    duration: Number(duration),
    price: Number(cost),
    max_clients: Number(maxClients),
  })
  .eq("id", sessionType.id)
  .select()
  .single();
  console.log("Updated rows:", data);
console.log("Error:", err);
    setSaving(false);
    if (err) { setError("Save failed. Check console."); console.error(err); return; }
    onSave(data);
    showToast("Session type saved");
  }

  const fields = [
    { label: "TITLE", type: "text", value: name, setter: setName, placeholder: "e.g. Direct Therapy" },
    { label: "DURATION (min)", type: "number", value: duration, setter: setDuration, placeholder: "60" },
    { label: "COST ($)", type: "number", value: cost, setter: setCost, placeholder: "0.00" },
    { label: "CLIENT SLOTS", type: "number", value: maxClients, setter: setMaxClients, placeholder: "1" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: COLORS.bg, borderRadius: 14, padding: "28px 28px 24px", width: 360, border: `0.5px solid ${COLORS.borderS}`, boxShadow: "0 8px 32px rgba(0,0,0,0.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: COLORS.text }}>Edit session type</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textT, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
          {fields.map(({ label, type, value, setter, placeholder }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textT, marginBottom: 5 }}>{label}</div>
              <input
                type={type}
                value={value}
                onChange={e => setter(e.target.value)}
                placeholder={placeholder}
                min={type === "number" ? 1 : undefined}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${COLORS.borderS}`, background: COLORS.bgS, color: COLORS.text, fontSize: 14 }}
              />
            </div>
          ))}
        </div>
        {error && <div style={{ fontSize: 13, color: "#A32D2D", marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#5DCAA5", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            {saving ? "Saving…" : "Save changes"}
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