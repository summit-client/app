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
  /** The service this child is waiting for. `session_type` is the label as
   *  it stood when the row was written; `session_type_id` (migration 0086) is
   *  the pointer, and is what the admin page writes now. Resolve the id, fall
   *  back to the text for a row written before 0086. */
  session_type?: string | null;
  session_type_id?: number | null;
  created_at?: string | null;
  // Migration 0071 - see that migration's header for why these live on
  // `clients` rather than a separate waitlist-entries table.
  contact_phone?: string | null;
  contact_email?: string | null;
  referral_source?: string | null;
  waitlist_notes?: string | null;
  waitlist_priority?: string | null; // 'high' | 'normal' | 'low', not null in the db (default 'normal')
}

const PRIORITIES = ["high", "normal", "low"] as const;
type Priority = typeof PRIORITIES[number];

// Lower number sorts first. Anything unrecognized (shouldn't happen - the
// db column is NOT NULL with a check constraint - but a stale client-side
// cache mid-migration is cheap to guard against) falls in with 'normal'.
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
const PRIORITY_COLORS: Record<string, string> = {
  high: "#DC2626",
  normal: "#6B7280",
  low: "#94A3B8",
};
const PRIORITY_LABELS: Record<string, string> = {
  high: "High priority",
  normal: "Normal priority",
  low: "Low priority",
};

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
  sessionTypes?: { id: number; name: string }[];
  showToast?: (message?: string) => void;
  // This view is rendered through pages/index.jsx's shared `views` lookup
  // (Scheduler()'s <ViewComp ... /> gets one large prop bag common to every
  // view - see that file's `views` object), so many more props than these
  // arrive at runtime. Only what's used here is declared.
  onNavigate?: (view: string) => void;
  // Opens the same popup the calendar's click-to-create uses, pre-seeded
  // with this client/location/session type - see CreateView's own
  // `waitlistPrefill` effect in pages/index.jsx. Falls back to a plain
  // navigation to the Create tab (the old behavior) if this isn't wired.
  onRequestBookFromWaitlist?: (client: Client) => void;
}

function daysWaiting(createdAt?: string | null): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const ms = Date.now() - created.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function WaitlistView({ clients, setClients, locations, sessionTypes, showToast, onNavigate, onRequestBookFromWaitlist }: WaitlistViewProps) {
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [priorityUpdatingId, setPriorityUpdatingId] = useState<number | null>(null);
  // Which row's notes editor is expanded, and its in-progress draft text -
  // keyed by client id so switching rows doesn't clobber an unsaved draft
  // on another row still open (only one is rendered open at a time via the
  // UI below, but keeping the draft keyed avoids surprises if that changes).
  const [notesOpenId, setNotesOpenId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [savingNotesId, setSavingNotesId] = useState<number | null>(null);

  // Priority tier first (high, then normal, then low), oldest-created_at-
  // first as the tiebreaker within each tier. This replaces the previous
  // plain-FIFO sort - FIFO isn't gone, it's now the within-tier tiebreaker,
  // per the account owner's explicit ask ("priority tier first... FIFO
  // remains the tiebreaker, not replaced by it").
  const waitlisted = (clients || [])
    .filter(c => c.status === "waitlist")
    .slice()
    .sort((a, b) => {
      const ar = PRIORITY_RANK[a.waitlist_priority || "normal"] ?? 1;
      const br = PRIORITY_RANK[b.waitlist_priority || "normal"] ?? 1;
      if (ar !== br) return ar - br;
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return at - bt;
    });

  // .eq("status","waitlist") for the same reason promote() below guards on
  // it - a stale row that already moved (promoted elsewhere) shouldn't have
  // its priority silently rewritten by a screen that no longer applies to it.
  async function updatePriority(client: Client, priority: Priority) {
    const previous = client.waitlist_priority;
    setPriorityUpdatingId(client.id);
    // Optimistic - this is a low-stakes triage field editable inline on a
    // busy list, not a clinical write; roll back on error rather than
    // blocking the row on a round-trip.
    setClients?.(prev => prev.map(c => c.id === client.id ? { ...c, waitlist_priority: priority } : c));
    const { error } = await supabase
      .from("clients")
      .update({ waitlist_priority: priority })
      .eq("id", client.id)
      .eq("status", "waitlist");
    setPriorityUpdatingId(null);
    if (error) {
      setClients?.(prev => prev.map(c => c.id === client.id ? { ...c, waitlist_priority: previous } : c));
      showToast?.("Couldn't update priority. Please try again.");
      return;
    }
    showToast?.(`${client.name} marked ${priority} priority`);
  }

  function openNotes(client: Client) {
    setNotesOpenId(client.id);
    setNotesDraft(client.waitlist_notes || "");
  }

  async function saveNotes(client: Client) {
    setSavingNotesId(client.id);
    const { error } = await supabase
      .from("clients")
      .update({ waitlist_notes: notesDraft.trim() || null })
      .eq("id", client.id)
      .eq("status", "waitlist");
    setSavingNotesId(null);
    if (error) {
      showToast?.("Couldn't save notes. Please try again.");
      return;
    }
    setClients?.(prev => prev.map(c => c.id === client.id ? { ...c, waitlist_notes: notesDraft.trim() || null } : c));
    setNotesOpenId(null);
    showToast?.("Notes saved");
  }

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
            const priority = (client.waitlist_priority || "normal") as Priority;
            const isPriorityUpdating = priorityUpdatingId === client.id;
            const notesOpen = notesOpenId === client.id;
            const hasNotes = !!(client.waitlist_notes && client.waitlist_notes.trim());
            return (
              <div key={client.id} style={{
                borderRadius: 10, background: COLORS.bgS,
                border: `0.5px solid ${COLORS.border}`, overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", flexWrap: "wrap" }}>
                  <Avatar name={client.name} color="#EF9F27" />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{client.name}</span>
                      <Badge label={PRIORITY_LABELS[priority] || PRIORITY_LABELS.normal} color={PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal} />
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.textS }}>
                      {sessionTypes?.find((t) => t.id === client.session_type_id)?.name
                        || client.session_type
                        || "Not specified"}
                    </div>
                    {loc && <div style={{ fontSize: 12, color: COLORS.textT }}>{loc.name}</div>}
                    {(client.contact_phone || client.contact_email) && (
                      <div style={{ fontSize: 12, color: COLORS.textT, marginTop: 2 }}>
                        {client.contact_phone}
                        {client.contact_phone && client.contact_email ? " · " : ""}
                        {client.contact_email}
                      </div>
                    )}
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.textT }}>
                    Priority
                    <select
                      value={priority}
                      disabled={isPriorityUpdating}
                      onChange={e => updatePriority(client, e.target.value as Priority)}
                      style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 13,
                        border: `0.5px solid ${COLORS.border}`, background: COLORS.bg,
                        color: COLORS.text, cursor: isPriorityUpdating ? "not-allowed" : "pointer",
                        opacity: isPriorityUpdating ? 0.6 : 1,
                      }}
                    >
                      {PRIORITIES.map(p => (
                        <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </label>

                  <Badge
                    label={wait === null ? "Waiting" : `${wait} day${wait !== 1 ? "s" : ""} waiting`}
                    color="#EF9F27"
                  />

                  <button
                    type="button"
                    onClick={() => notesOpen ? setNotesOpenId(null) : openNotes(client)}
                    style={{
                      padding: "5px 14px", borderRadius: 8, fontSize: 13,
                      border: `0.5px solid ${hasNotes ? "#5DCAA5" : COLORS.border}`,
                      background: hasNotes ? "#5DCAA522" : COLORS.bg,
                      color: hasNotes ? "#3B8F6E" : COLORS.textS, cursor: "pointer",
                    }}
                  >
                    {notesOpen ? "Close notes" : hasNotes ? "Notes" : "Add note"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onRequestBookFromWaitlist ? onRequestBookFromWaitlist(client) : onNavigate?.("create")}
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

                {notesOpen && (
                  <div style={{
                    padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8,
                    borderTop: `0.5px solid ${COLORS.border}`, paddingTop: 12,
                  }}>
                    <textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Working notes for this waitlist entry - callback attempts, scheduling constraints, anything the next person on this screen should know."
                      rows={3}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
                        border: `0.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text,
                        fontSize: 13, fontFamily: "inherit", resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => setNotesOpenId(null)}
                        style={{
                          padding: "5px 14px", borderRadius: 8, fontSize: 13,
                          border: `0.5px solid ${COLORS.border}`, background: COLORS.bg,
                          color: COLORS.textS, cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveNotes(client)}
                        disabled={savingNotesId === client.id}
                        style={{
                          padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                          border: "none", background: "#5DCAA5", color: "#fff",
                          cursor: savingNotesId === client.id ? "not-allowed" : "pointer",
                          opacity: savingNotesId === client.id ? 0.7 : 1,
                        }}
                      >
                        {savingNotesId === client.id ? "Saving…" : "Save note"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
