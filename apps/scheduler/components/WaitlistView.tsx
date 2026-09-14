import { useState } from "react";
import { supabase } from "../lib/supabase";

// Same palette object as pages/index.jsx's module-level COLORS - not
// exported from there (see that file's own comment above PersonLink
// explaining why small display helpers stay local rather than growing an
// export surface on a 3000-line page file), so this view keeps its own
// copy rather than reaching into index.jsx.
const COLORS = {
  bg: "var(--color-background-primary)",
  bgS: "var(--color-background-secondary)",
  bgT: "var(--color-background-tertiary)",
  border: "var(--color-border-tertiary)",
  borderS: "var(--color-border-secondary)",
  text: "var(--color-text-primary)",
  textS: "var(--color-text-secondary)",
  textT: "var(--color-text-tertiary)",
};

// Minimal local re-implementations of index.jsx's Avatar/Badge - both are
// defined but not exported there, and re-implementing these ~10-line
// helpers here is less invasive than adding an export surface to that file
// for two components (see index.jsx CLAUDE task notes).
function Avatar({ name, color = "#5DCAA5" }: { name: string; color?: string }) {
  const initials = (name || "").split(" ").map(n => n[0]).join("").slice(0, 2);
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: color + "22", border: `1.5px solid ${color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 500, color, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 500, padding: "2px 10px", borderRadius: 20,
      background: color + "22", color, border: `1px solid ${color}44`,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

interface Client {
  id: number;
  name: string;
  status: string;
  location_id?: number | null;
  session_type?: string | null;
  created_at?: string | null;
}

interface Location {
  id: number;
  name: string;
}

interface WaitlistViewProps {
  clients: Client[];
  // Optional so this view degrades to "no optimistic update, just refetch
  // via the normal loadData() cadence" rather than crashing if it's ever
  // wired up without the setter - mirrors how showToast/onNavigate are
  // optional below.
  setClients?: (updater: (prev: Client[]) => Client[]) => void;
  locations?: Location[];
  showToast?: (message?: string) => void;
  // This view is rendered through pages/index.jsx's shared `views` lookup
  // (Scheduler()'s <ViewComp ... /> gets one large prop bag common to every
  // view - see that file's `views` object), so many more props than these
  // arrive at runtime. Only what's used here is declared.
  onNavigate?: (view: string) => void;
}

function daysWaiting(createdAt?: string | null): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const ms = Date.now() - created.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function WaitlistView({ clients, setClients, locations, showToast, onNavigate }: WaitlistViewProps) {
  const [promotingId, setPromotingId] = useState<number | null>(null);

  // Oldest-first (FIFO) - the obvious, defensible default for a clinical
  // waitlist. Deliberately no manual reordering/priority here; that's
  // explicitly out of scope for this pass.
  const waitlisted = (clients || [])
    .filter(c => c.status === "waitlist")
    .slice()
    .sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return at - bt;
    });

  // Same operation as the existing Assessment-booking auto-promotion in
  // pages/index.jsx (CreateView, "Auto-promote waitlist clients booked for
  // Assessment") - `.eq("status","waitlist")` guards against a stale row
  // that already moved (e.g. promoted by that auto-promotion path, or by
  // another admin, in the time since this list last loaded). Confirm +
  // loading + error + toast mirrors index.jsx's cancelSelected: a real
  // failure is surfaced rather than optimistically showing success.
  async function promote(client: Client) {
    if (!confirm(`Move ${client.name} to active?`)) return;
    setPromotingId(client.id);
    const { error } = await supabase
      .from("clients")
      .update({ status: "active" })
      .eq("id", client.id)
      .eq("status", "waitlist");
    setPromotingId(null);
    if (error) {
      showToast?.("Promote failed. Please try again.");
      return;
    }
    setClients?.(prev => prev.map(c => c.id === client.id ? { ...c, status: "active" } : c));
    showToast?.(`${client.name} moved to active`);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: COLORS.text, margin: 0 }}>Waitlist</h2>
          <p style={{ fontSize: 14, color: COLORS.textS, margin: "4px 0 0" }}>
            {waitlisted.length} client{waitlisted.length !== 1 ? "s" : ""} waiting
          </p>
        </div>
      </div>

      {waitlisted.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: COLORS.textT }}>
          No one is currently on the waitlist
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {waitlisted.map(client => {
            const loc = locations?.find(l => l.id === client.location_id);
            const wait = daysWaiting(client.created_at);
            const isPromoting = promotingId === client.id;
            return (
              <div key={client.id} style={{
                borderRadius: 10, background: COLORS.bgS,
                border: `0.5px solid ${COLORS.border}`, overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", flexWrap: "wrap" }}>
                  <Avatar name={client.name} color="#EF9F27" />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{client.name}</div>
                    <div style={{ fontSize: 13, color: COLORS.textS }}>{client.session_type || "Not specified"}</div>
                    {loc && <div style={{ fontSize: 12, color: COLORS.textT }}>{loc.name}</div>}
                  </div>
                  <Badge
                    label={wait === null ? "Waiting" : `${wait} day${wait !== 1 ? "s" : ""} waiting`}
                    color="#EF9F27"
                  />
                  <button
                    type="button"
                    onClick={() => onNavigate?.("create")}
                    style={{
                      padding: "5px 14px", borderRadius: 8, fontSize: 13,
                      border: `0.5px solid ${COLORS.border}`, background: COLORS.bg,
                      color: COLORS.textS, cursor: "pointer",
                    }}
                  >
                    Book a session
                  </button>
                  <button
                    type="button"
                    onClick={() => promote(client)}
                    disabled={isPromoting}
                    style={{
                      padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                      border: "none", background: "#5DCAA5", color: "#fff",
                      cursor: isPromoting ? "not-allowed" : "pointer",
                      opacity: isPromoting ? 0.7 : 1,
                    }}
                  >
                    {isPromoting ? "Promoting…" : "Promote to active"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
