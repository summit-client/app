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

/* ---- in-memory store (preview) ------------------------------------------- */
const mem = {
  events: [] as TrialEvent[],
  incidents: [] as AbcIncident[],
  notes: new Map<number, SessionNoteDraft>(),
};

let seq = 0;
const nextId = () => `ev-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

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
  return (data ?? []).map(mapProgram);
}

export async function getSession(sessionId: number): Promise<ScheduledSession | null> {
  const all = await getTodaySessions();
  return all.find((s) => s.id === sessionId) ?? null;
}

/* ---- writes --------------------------------------------------------------- */
export async function recordEvent(
  e: Omit<TrialEvent, "id" | "occurredAt">,
  ctx: { sessionRecordId?: string },
): Promise<TrialEvent> {
  const full: TrialEvent = { ...e, id: nextId(), occurredAt: new Date().toISOString() };
  if (IS_PREVIEW) {
    mem.events.push(full);
    return full;
  }
  const { error } = await sb().from("trial_events").insert({
    session_record_id: ctx.sessionRecordId,
    mode: e.mode, code: e.code, step_position: e.stepPosition,
    prompt_level: e.promptLevel, note: e.note,
    clinic_id: await myClinicId(),
  });
  if (error) throw error;
  return full;
}

export async function undoLastEvent(programId: string): Promise<void> {
  if (IS_PREVIEW) {
    for (let i = mem.events.length - 1; i >= 0; i--) {
      if (mem.events[i].programId === programId) { mem.events.splice(i, 1); return; }
    }
  }
  // Live mode: deletion of trial rows is a supervisor amendment path, not inline undo.
}

export function eventsFor(programId: string): TrialEvent[] {
  return mem.events.filter((e) => e.programId === programId);
}

export async function recordIncident(i: Omit<AbcIncident, "id" | "occurredAt">): Promise<AbcIncident> {
  const full: AbcIncident = { ...i, id: nextId(), occurredAt: new Date().toISOString() };
  if (IS_PREVIEW) { mem.incidents.push(full); return full; }
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
  if (IS_PREVIEW) { mem.notes.set(note.sessionId, note); return; }
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
    last5: [], // live mode: computed from session_records summaries (follow-up query)
  };
}
