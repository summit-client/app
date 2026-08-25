"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { AbcIncident, ClientRow, Program, ScheduledSession, SessionNoteDraft, TrialEvent } from "./types";
import { previewClients, previewPrograms, previewSessions } from "./preview-data";

/**
 * Single data seam for the portal. With NEXT_PUBLIC_DEV_PREVIEW=1 everything is
 * served from in-memory fixtures (fully interactive, no database); otherwise
 * reads/writes go to Supabase under RLS. Screens never branch on the flag.
 */
export const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/* ---- in-memory store, persisted to sessionStorage so a mid-session page
   reload never loses the working set (DB rows are unaffected in live mode) --- */
const mem = {
  events: [] as TrialEvent[],
  incidents: [] as AbcIncident[],
  notes: new Map<number, SessionNoteDraft>(),
};

const MEM_KEY = "summit-session-mirror";
function persistMem(): void {
  try {
    sessionStorage.setItem(MEM_KEY, JSON.stringify({
      events: mem.events, incidents: mem.incidents, notes: [...mem.notes.entries()],
    }));
  } catch { /* storage full or unavailable — mirror stays in memory only */ }
}
function rehydrateMem(): void {
  try {
    const raw = sessionStorage.getItem(MEM_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { events: TrialEvent[]; incidents: AbcIncident[]; notes: [number, SessionNoteDraft][] };
    mem.events = d.events ?? [];
    mem.incidents = d.incidents ?? [];
    mem.notes = new Map(d.notes ?? []);
  } catch { /* corrupt mirror — start clean */ }
}
if (typeof window !== "undefined") rehydrateMem();

let seq = 0;
const nextId = () => `ev-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

/* ---- active-session context (live mode writes hang off this) --------------- */
const active = {
  sessionId: null as number | null,
  clientId: null as number | null,
  recordIds: new Map<string, string>(), // programId -> session_records.id
};

/** The Active Session page calls this on load so events attach to the right session. */
export function setActiveSession(sessionId: number, clientId: number): void {
  if (active.sessionId !== sessionId) active.recordIds.clear();
  active.sessionId = sessionId;
  active.clientId = clientId;
}

async function ensureSessionRecord(programId: string): Promise<string | null> {
  if (IS_PREVIEW) return null;
  const cached = active.recordIds.get(programId);
  if (cached) return cached;
  if (active.sessionId == null || active.clientId == null) return null;
  const user = (await sb().auth.getUser()).data.user;
  const { data, error } = await sb()
    .from("session_records")
    .upsert(
      {
        session_id: active.sessionId,
        client_id: active.clientId,
        program_id: programId,
        clinician_id: user?.id,
        clinic_id: await myClinicId(),
      },
      { onConflict: "session_id,program_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  active.recordIds.set(programId, data.id);
  return data.id;
}

/* ---- reads ---------------------------------------------------------------- */
export async function getClients(): Promise<ClientRow[]> {
  if (IS_PREVIEW) return previewClients;
  const { data, error } = await sb().from("clients").select("id,name,status").order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, name: c.name, age: null, funding: null, serviceType: null,
    status: c.status ?? "active", activeGoals: 0, masteredGoals: 0, nextSession: null,
  }));
}

export async function getTodaySessions(): Promise<ScheduledSession[]> {
  if (IS_PREVIEW) return previewSessions;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb()
    .from("sessions")
    .select("id,client_id,hour,minute,session_date,type,status, clients(name)")
    .eq("session_date", today)
    .order("hour");
  if (error) throw error;
  return (data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as number,
    clientId: s.client_id as number,
    clientName: ((s.clients as { name?: string } | null)?.name) ?? `Client ${s.client_id}`,
    date: s.session_date as string,
    time: fmtTime(s.hour as number, (s.minute as number) ?? 0),
    type: (s.type as string) ?? "Session",
    status: (s.status as string) ?? "scheduled",
    location: "Clinic",
  }));
}

export async function getPrograms(clientId: number): Promise<Program[]> {
  if (IS_PREVIEW) return previewPrograms.filter((p) => p.clientId === clientId);
  const { data, error } = await sb()
    .from("programs")
    .select("*, program_steps(*)")
    .eq("client_id", clientId)
    .neq("status", "archived")
    .order("created_at");
  if (error) throw error;
  const programs = (data ?? []).map(mapProgram);

  // last-5 session summaries per program, one query for the whole caseload page
  if (programs.length) {
    const { data: recs } = await sb()
      .from("session_records")
      .select("program_id, summary_pct, summary_count, started_at")
      .in("program_id", programs.map((p) => p.id))
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(programs.length * 5);
    for (const p of programs) {
      const mine = (recs ?? []).filter((r) => r.program_id === p.id).slice(0, 5).reverse();
      p.last5 = mine
        .map((r) => (r.summary_pct != null ? Number(r.summary_pct) : r.summary_count != null ? Number(r.summary_count) : null))
        .filter((x): x is number => x != null);
    }
  }
  return programs;
}

export async function getSession(sessionId: number): Promise<ScheduledSession | null> {
  const all = await getTodaySessions();
  return all.find((s) => s.id === sessionId) ?? null;
}

/* ---- writes --------------------------------------------------------------- */
export async function recordEvent(
  e: Omit<TrialEvent, "id" | "occurredAt">,
  _ctx: Record<string, never> = {},
): Promise<TrialEvent> {
  const full: TrialEvent = { ...e, id: nextId(), occurredAt: new Date().toISOString() };
  mem.events.push(full); // local mirror drives the UI in both modes
  persistMem();
  if (IS_PREVIEW) return full;
  const recordId = await ensureSessionRecord(e.programId);
  if (!recordId) return full;
  const { error } = await sb().from("trial_events").insert({
    session_record_id: recordId,
    mode: e.mode, code: e.code, step_position: e.stepPosition,
    prompt_level: e.promptLevel, note: e.note,
    clinic_id: await myClinicId(),
  });
  if (error) throw error;
  return full;
}

/**
 * Close out the session's records: stamp ended_at and the per-program summary
 * (percentage, count, seconds) computed from what was collected. Called by the
 * note page before signing; no-op in preview.
 */
export async function closeSessionRecords(
  summaries: { programId: string; pct: number | null; count: number | null; seconds: number | null }[],
): Promise<void> {
  if (IS_PREVIEW) return;
  const ended = new Date().toISOString();
  for (const s of summaries) {
    const recordId = active.recordIds.get(s.programId);
    if (!recordId) continue;
    const { error } = await sb()
      .from("session_records")
      .update({ ended_at: ended, summary_pct: s.pct, summary_count: s.count, summary_seconds: s.seconds })
      .eq("id", recordId);
    if (error) throw error;
  }
}

export async function undoLastEvent(programId: string): Promise<void> {
  if (IS_PREVIEW) {
    for (let i = mem.events.length - 1; i >= 0; i--) {
      if (mem.events[i].programId === programId) { mem.events.splice(i, 1); persistMem(); return; }
    }
  }
  // Live mode: deletion of trial rows is a supervisor amendment path, not inline undo.
}

export function eventsFor(programId: string): TrialEvent[] {
  return mem.events.filter((e) => e.programId === programId);
}

export async function recordIncident(i: Omit<AbcIncident, "id" | "occurredAt">): Promise<AbcIncident> {
  const full: AbcIncident = { ...i, id: nextId(), occurredAt: new Date().toISOString() };
  if (IS_PREVIEW) { mem.incidents.push(full); persistMem(); return full; }
  const { error } = await sb().from("behaviour_incidents").insert({
    client_id: i.clientId, antecedent: i.antecedent, behaviour: i.behaviour,
    consequence: i.consequence, suspected_function: i.suspectedFunction,
    clinic_id: await myClinicId(), clinician_id: (await sb().auth.getUser()).data.user?.id,
  });
  if (error) throw error;
  return full;
}

export function incidentsFor(clientId: number): AbcIncident[] {
  return mem.incidents.filter((x) => x.clientId === clientId);
}

export async function saveNote(note: SessionNoteDraft): Promise<void> {
  mem.notes.set(note.sessionId, note);
  persistMem();
  if (IS_PREVIEW) return;
  const user = (await sb().auth.getUser()).data.user;
  const { error } = await sb().from("session_notes").upsert(
    {
      session_id: note.sessionId,
      client_id: 0, // resolved server-side in live mode via the session row
      clinician_id: user?.id,
      clinic_id: await myClinicId(),
      body: note,
      billable_code: note.billableCode,
      status: note.status,
      signed_at: note.status === "signed" || note.status === "awaiting_countersign" ? new Date().toISOString() : null,
    },
    { onConflict: "session_id" },
  );
  if (error) throw error;
}

export function getNote(sessionId: number): SessionNoteDraft | undefined {
  return mem.notes.get(sessionId);
}

export function pendingNotes(): SessionNoteDraft[] {
  return [...mem.notes.values()].filter((n) => n.status === "awaiting_countersign");
}

/* ---- helpers -------------------------------------------------------------- */
async function myClinicId(): Promise<string | null> {
  const user = (await sb().auth.getUser()).data.user;
  if (!user) return null;
  const { data } = await sb().from("profiles").select("clinic_id").eq("id", user.id).single();
  return data?.clinic_id ?? null;
}

function fmtTime(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function mapProgram(row: Record<string, unknown>): Program {
  const steps = ((row.program_steps as Record<string, unknown>[]) ?? [])
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((s) => ({
      id: s.id as string, position: s.position as number,
      description: s.description as string,
      status: s.status as Program["steps"][number]["status"],
    }));
  return {
    id: row.id as string,
    clientId: row.client_id as number,
    name: row.name as string,
    domain: (row.domain as string) ?? null,
    mode: row.measurement_mode as Program["mode"],
    operationalDefinition: row.operational_definition as string,
    masteryCriteria: row.mastery_criteria as string,
    masteryPct: (row.mastery_pct as number) ?? 80,
    masteryConsecutive: (row.mastery_consecutive as number) ?? 3,
    promptLevel: row.prompt_level as Program["promptLevel"],
    reinforcementSchedule: (row.reinforcement_schedule as string) ?? "FR1",
    sd: (row.sd as string) ?? null,
    targetDirection: (row.target_direction as Program["targetDirection"]) ?? "increase",
    status: row.status as Program["status"],
    intervalSeconds: (row.interval_seconds as number) ?? 30,
    dailyTargetMinutes: (row.daily_target_minutes as number) ?? null,
    steps,
    last5: [], // filled from session_records summaries by getPrograms
  };
}
