"use client";

import { createBrowserClient } from "@supabase/ssr";
import type {
  AbcIncident, ClientRow, Program, RunSession, ScheduledSession,
  SessionNoteDraft, SessionPlanDraft, SessionProgramSummary, TrialEvent,
} from "./types";
import { deriveProgramSummary } from "./mastery";
import { previewClients, previewPrograms, previewSessions } from "./preview-data";

/**
 * Single data seam for the portal. With NEXT_PUBLIC_DEV_PREVIEW=1 everything is
 * served from in-memory fixtures (fully interactive, no database); otherwise
 * reads/writes go to Supabase under RLS. Screens never branch on the flag.
 *
 * Double-gated like proxy.ts's own PREVIEW_BYPASS: NEXT_PUBLIC_DEV_PREVIEW is
 * browser-readable, so on its own it isn't a safe switch for "skip the real
 * backend." Without the NODE_ENV check, a stray "1" left in production's
 * .env.local would silently route every write in this file to in-memory
 * fixtures instead of Supabase - real clinical documentation vanishing into
 * an unpersisted store, not just a preview-mode cosmetic issue.
 */
export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

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
  sessions: [] as RunSession[],
  summaries: [] as SessionProgramSummary[],
};

const MEM_KEY = "summit-session-mirror";
function persistMem(): void {
  try {
    sessionStorage.setItem(MEM_KEY, JSON.stringify({
      events: mem.events, incidents: mem.incidents, notes: [...mem.notes.entries()],
      sessions: mem.sessions, summaries: mem.summaries,
    }));
  } catch { /* storage full or unavailable — mirror stays in memory only */ }
}
function rehydrateMem(): void {
  try {
    const raw = sessionStorage.getItem(MEM_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as {
      events: TrialEvent[]; incidents: AbcIncident[]; notes: [number, SessionNoteDraft][];
      sessions?: RunSession[]; summaries?: SessionProgramSummary[];
    };
    mem.events = d.events ?? [];
    mem.incidents = d.incidents ?? [];
    mem.notes = new Map(d.notes ?? []);
    mem.sessions = d.sessions ?? [];
    mem.summaries = d.summaries ?? [];
  } catch { /* corrupt mirror — start clean */ }
}
if (typeof window !== "undefined") rehydrateMem();

let seq = 0;
const nextId = () => `ev-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

/* ---- active-session context ------------------------------------------------ */
const active = {
  sessionId: null as number | null,
  clientId: null as number | null,
  activityContext: null as string | null,
  recordIds: new Map<string, string>(), // programId -> session_records.id
};

/** The Run Session page calls this on load so events attach to the right session. */
export function setActiveSession(sessionId: number, clientId: number): void {
  if (active.sessionId !== sessionId) active.recordIds.clear();
  active.sessionId = sessionId;
  active.clientId = clientId;
}

/** Optional current activity ("Snack", "Play"…) stamped onto every observation. */
export function setActivityContext(ctx: string | null): void {
  active.activityContext = ctx;
}
export function activityContext(): string | null {
  return active.activityContext;
}

/* Current target exemplar per program — stamped onto observations so the same
   program can later graph by target without separate programming. */
const currentTargets = new Map<string, string | null>();
export function setCurrentTarget(programId: string, target: string | null): void {
  currentTargets.set(programId, target);
}
export function currentTarget(programId: string): string | null {
  return currentTargets.get(programId) ?? null;
}

/* ---- client-bound run sessions ---------------------------------------------
   A session is created FROM a client's record and stays bound to it. The
   status machine is planning → active → documentation → completed → locked. */

export function runSessionsFor(clientId: number): RunSession[] {
  return mem.sessions.filter((s) => s.clientId === clientId).sort((a, b) => b.id - a.id);
}

export function getRunSession(sessionId: number): RunSession | undefined {
  return mem.sessions.find((s) => s.id === sessionId);
}

/** The client's session still in flight (planning/active/documentation), if any. */
export function openSessionFor(clientId: number): RunSession | undefined {
  return runSessionsFor(clientId).find((s) => ["planning", "active", "documentation"].includes(s.status));
}

export async function createRunSession(
  clientId: number,
  init: { plannedDurationMin: number; location: string; serviceType: string; focus: string | null },
  programs: Program[],
): Promise<RunSession> {
  const id = Math.max(10_000, ...mem.sessions.map((s) => s.id + 1));
  const session: RunSession = {
    id, clientId, clinicianId: null, status: "planning",
    startTime: null, endTime: null,
    plannedDurationMin: init.plannedDurationMin, actualDurationMin: null,
    location: init.location, serviceType: init.serviceType, focus: init.focus,
    plan: null,
    programVersionSnapshot: programs
      .filter((p) => p.status === "active" || p.status === "maintenance")
      .map((p) => ({ programId: p.id, name: p.name, promptLevel: p.promptLevel, masteryCriteria: p.masteryCriteria })),
    createdAt: new Date().toISOString(),
  };
  mem.sessions.push(session);
  persistMem();
  if (!IS_PREVIEW) {
    const user = (await sb().auth.getUser()).data.user;
    const { data, error } = await sb().from("client_sessions").insert({
      client_id: clientId, clinician_id: user?.id, clinic_id: await myClinicId(),
      status: "planning", planned_duration_min: init.plannedDurationMin,
      location: init.location, service_type: init.serviceType, focus: init.focus,
      program_version_snapshot: session.programVersionSnapshot,
    }).select("id").single();
    if (error) throw error;
    session.id = data.id; // adopt the DB id so events/summaries attach to it
    persistMem();
  }
  return session;
}

export async function updateRunSession(sessionId: number, patch: Partial<RunSession>): Promise<RunSession> {
  const s = mem.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error(`Unknown session ${sessionId}`);
  Object.assign(s, patch);
  persistMem();
  if (!IS_PREVIEW) {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.startTime !== undefined) row.start_time = patch.startTime;
    if (patch.endTime !== undefined) row.end_time = patch.endTime;
    if (patch.actualDurationMin !== undefined) row.actual_duration_min = patch.actualDurationMin;
    if (patch.plan !== undefined) row.plan = patch.plan;
    if (Object.keys(row).length) {
      const { error } = await sb().from("client_sessions").update(row).eq("id", sessionId);
      if (error) throw error;
    }
  }
  return s;
}

export async function saveSessionPlan(sessionId: number, plan: SessionPlanDraft): Promise<RunSession> {
  return updateRunSession(sessionId, { plan });
}

/** planning → active. Starts the timer; the Session Tab takes over. */
export async function startRunSession(sessionId: number): Promise<RunSession> {
  const s = await updateRunSession(sessionId, { status: "active", startTime: new Date().toISOString() });
  setActiveSession(s.id, s.clientId);
  return s;
}

/**
 * active → documentation. Stamps end time and derives the per-program
 * summaries from this session's atomic observations. Raw events stay put —
 * the summary is recomputable, never authoritative.
 */
export async function endRunSession(sessionId: number, programs: Program[]): Promise<RunSession> {
  const s = getRunSession(sessionId);
  if (!s) throw new Error(`Unknown session ${sessionId}`);
  const end = new Date().toISOString();
  const mins = s.startTime ? Math.max(1, Math.round((Date.now() - new Date(s.startTime).getTime()) / 60_000)) : null;
  const elapsedHours = mins != null ? Math.max(mins / 60, 1 / 60) : 1;

  mem.summaries = mem.summaries.filter((x) => x.sessionId !== sessionId);
  for (const p of programs) {
    const summary = deriveProgramSummary(p, eventsFor(p.id, sessionId), sessionId, elapsedHours);
    if (summary) mem.summaries.push(summary);
  }
  const updated = await updateRunSession(sessionId, { status: "documentation", endTime: end, actualDurationMin: mins });

  if (!IS_PREVIEW) {
    const rows = mem.summaries.filter((x) => x.sessionId === sessionId).map((x) => ({
      client_session_id: sessionId, program_id: x.programId,
      raw_observation_count: x.rawObservationCount, numerator: x.numerator, denominator: x.denominator,
      calculated_value: x.calculatedValue, metric_type: x.metricType, clinic_id: null,
    }));
    if (rows.length) {
      const { error } = await sb().from("session_program_summaries").upsert(rows, { onConflict: "client_session_id,program_id" });
      if (error) throw error;
    }
    await closeSessionRecords(mem.summaries.filter((x) => x.sessionId === sessionId).map((x) => ({
      programId: x.programId,
      pct: x.metricType.startsWith("percent") ? x.calculatedValue : null,
      count: x.metricType === "count" || x.metricType === "rate_per_hour" ? x.numerator : null,
      seconds: x.metricType === "total_seconds" ? x.calculatedValue : null,
    })));
  }
  return updated;
}

/**
 * documentation → completed. The completed session feeds the whole client
 * record: percent summaries append to each program's session history so
 * graphs, mastery evaluation and Clinical Signals update with no extra entry.
 */
export async function completeRunSession(sessionId: number, programs: Program[]): Promise<RunSession> {
  for (const sum of summariesFor(sessionId)) {
    if (!sum.metricType.startsWith("percent") && sum.metricType !== "count") continue;
    const p = programs.find((x) => x.id === sum.programId);
    if (p && sum.calculatedValue != null) p.last5 = [...p.last5, sum.calculatedValue].slice(-8);
  }
  const s = await updateRunSession(sessionId, { status: "completed" });
  if (active.sessionId === sessionId) { active.sessionId = null; active.clientId = null; active.activityContext = null; }
  return s;
}

/** completed → locked, once the note is countersigned. Locked sessions are immutable. */
export async function lockRunSession(sessionId: number): Promise<void> {
  const s = getRunSession(sessionId);
  if (s && s.status === "completed") await updateRunSession(sessionId, { status: "locked" });
}

export function summariesFor(sessionId: number): SessionProgramSummary[] {
  return mem.summaries.filter((x) => x.sessionId === sessionId);
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
    supervisor: null, lastSession: null, interests: [],
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
    .select("*, program_steps(*), program_targets(*)")
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
/**
 * Every tap creates one of these — the atomic observation, immediately, with
 * the session/client/target/activity context stamped on. Counters, session
 * metrics, graphs and mastery are all DERIVED from these rows afterwards.
 */
export async function recordEvent(
  e: Omit<TrialEvent, "id" | "occurredAt" | "sessionId" | "clientId" | "activityContext" | "target"> &
    Partial<Pick<TrialEvent, "sessionId" | "clientId" | "activityContext" | "target">>,
  _ctx: Record<string, never> = {},
): Promise<TrialEvent> {
  const full: TrialEvent = {
    ...e,
    target: e.target !== undefined ? e.target : currentTargets.get(e.programId) ?? null,
    sessionId: e.sessionId ?? active.sessionId,
    clientId: e.clientId ?? active.clientId,
    activityContext: e.activityContext ?? active.activityContext,
    id: nextId(),
    occurredAt: new Date().toISOString(),
  };
  mem.events.push(full); // local mirror drives the UI in both modes
  persistMem();
  if (IS_PREVIEW) return full;
  const recordId = await ensureSessionRecord(e.programId);
  if (!recordId) return full;
  const { error } = await sb().from("trial_events").insert({
    session_record_id: recordId,
    client_session_id: full.sessionId,
    mode: e.mode, code: e.code, step_position: e.stepPosition,
    prompt_level: e.promptLevel, target: full.target, activity_context: full.activityContext,
    note: e.note,
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

/**
 * Observations for one program. Defaults to the session currently in flight so
 * live counters never bleed across sessions; pass a sessionId for history.
 */
export function eventsFor(programId: string, sessionId?: number): TrialEvent[] {
  const sid = sessionId ?? active.sessionId;
  return mem.events.filter((e) => e.programId === programId && (sid == null || e.sessionId === sid));
}

export function eventsForSession(sessionId: number): TrialEvent[] {
  return mem.events.filter((e) => e.sessionId === sessionId);
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
      client_id: note.clientId ?? 0,
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
    targets: ((row.program_targets as { name: string }[] | null) ?? []).map((t) => t.name),
    last5: [], // filled from session_records summaries by getPrograms
  };
}
