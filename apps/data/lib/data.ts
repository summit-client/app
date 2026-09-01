"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { ClinicalEvidencePacket, ReportBlock } from "@summit/clinical-ai";
import type {
  AbcIncident, CaseloadCalendarResult, ClientRow, PendingCountersign, Program, RunSession, ScheduledSession,
  SessionNoteDraft, SessionPlanDraft, SessionProgramSummary, TrialEvent,
} from "./types";
import { deriveProgramSummary } from "./mastery";
import { previewCaseloadSessions, previewClients, previewPrograms, previewSessions } from "./preview-data";

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

/**
 * Pull this client's real session history from `client_sessions` and merge
 * it into the local `mem.sessions` mirror that `runSessionsFor()`/
 * `getRunSession()`/`openSessionFor()` above serve from. Without this,
 * those three only ever returned sessions THIS BROWSER created — populated
 * exclusively by `createRunSession()`'s own push onto `mem.sessions` — so
 * the Sessions/Timeline/Graphs tabs, the client overview's session count,
 * and the "Resume session"/"last completed" badges in the client layout
 * all silently showed only a fraction of a client's real history (or none,
 * on a browser that never happened to run one), not an error a screen
 * could report — the same "RLS returns empty sets, not errors" shape of
 * trap as everywhere else in this app, just from a query that was never
 * actually made rather than one RLS filtered.
 *
 * Deliberately a merge into the existing synchronous cache rather than
 * converting `runSessionsFor`/`getRunSession`/`openSessionFor` themselves
 * to async: `app/clients/[id]/run/page.tsx` calls them many times over the
 * course of one active session (every tap can touch `getRunSession`
 * indirectly through `updateRunSession`), and needs that fast and
 * synchronous. Every caller that reads client history for display instead
 * of live in-session state awaits this once per client-id change, then
 * reads the (now-hydrated) synchronous accessors — see the callers for the
 * exact pattern.
 */
async function hydrateSessionRows(clientId: number): Promise<number[]> {
  const { data, error } = await sb()
    .from("client_sessions")
    .select(
      "id, client_id, clinician_id, status, start_time, end_time, planned_duration_min, " +
      "actual_duration_min, location, service_type, focus, plan, program_version_snapshot, created_at",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const byId = new Map(mem.sessions.map((s) => [s.id, s]));
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    byId.set(row.id as number, {
      id: row.id as number, clientId: row.client_id as number, clinicianId: (row.clinician_id as string | null) ?? null,
      status: row.status as RunSession["status"],
      startTime: (row.start_time as string | null) ?? null, endTime: (row.end_time as string | null) ?? null,
      plannedDurationMin: (row.planned_duration_min as number | null) ?? null,
      actualDurationMin: (row.actual_duration_min as number | null) ?? null,
      location: (row.location as string | null) ?? null, serviceType: (row.service_type as string | null) ?? null,
      focus: (row.focus as string | null) ?? null,
      plan: (row.plan as RunSession["plan"]) ?? null,
      programVersionSnapshot: (row.program_version_snapshot as RunSession["programVersionSnapshot"]) ?? [],
      createdAt: row.created_at as string,
    });
  }
  mem.sessions = [...byId.values()];
  return (data ?? []).map((r) => (r as unknown as { id: number }).id);
}

async function hydrateNoteRows(clientId: number): Promise<void> {
  const { data, error } = await sb()
    .from("session_notes")
    .select("session_id, client_id, body, billable_code, status")
    .eq("client_id", clientId);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const body = (row.body as Record<string, unknown>) ?? {};
    mem.notes.set(row.session_id as number, {
      sessionId: row.session_id as number,
      clientId: row.client_id as number | null,
      subjective: (body.subjective as string) ?? "",
      objective: (body.objective as string) ?? "",
      assessment: (body.assessment as string) ?? "",
      plan: (body.plan as string) ?? "",
      perProgram: (body.perProgram as SessionNoteDraft["perProgram"]) ?? [],
      abcNarrative: (body.abcNarrative as string) ?? "",
      billableCode: row.billable_code as SessionNoteDraft["billableCode"],
      status: row.status as SessionNoteDraft["status"],
    });
  }
}

async function hydrateIncidentRows(clientId: number): Promise<void> {
  const { data, error } = await sb()
    .from("behaviour_incidents")
    .select("id, client_id, occurred_at, antecedent, behaviour, consequence, suspected_function")
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  // Upsert by id (not "skip if already present") so a server-side edit to
  // an incident this device already knows about actually refreshes it,
  // matching how hydrateSessionRows/hydrateNoteRows treat their own rows.
  const byId = new Map(mem.incidents.map((i) => [i.id, i]));
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = row.id as string;
    byId.set(id, {
      id, clientId: row.client_id as number, occurredAt: row.occurred_at as string,
      antecedent: row.antecedent as string, behaviour: row.behaviour as string, consequence: row.consequence as string,
      suspectedFunction: (row.suspected_function as AbcIncident["suspectedFunction"]) ?? null,
    });
  }
  mem.incidents = [...byId.values()];
}

async function hydrateSummaryRows(sessionIds: number[]): Promise<void> {
  if (!sessionIds.length) return;
  const { data, error } = await sb()
    .from("session_program_summaries")
    .select("client_session_id, program_id, raw_observation_count, numerator, denominator, calculated_value, metric_type")
    .in("client_session_id", sessionIds);
  if (error) throw error;
  // Upsert by (sessionId, programId) rather than "skip if already present",
  // for the same reason as hydrateIncidentRows above.
  const byKey = new Map(mem.summaries.map((s) => [`${s.sessionId}:${s.programId}`, s]));
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = `${row.client_session_id}:${row.program_id}`;
    byKey.set(key, {
      sessionId: row.client_session_id as number, programId: row.program_id as string,
      rawObservationCount: (row.raw_observation_count as number) ?? 0,
      numerator: (row.numerator as number | null) ?? null, denominator: (row.denominator as number | null) ?? null,
      calculatedValue: (row.calculated_value as number | null) ?? null,
      metricType: row.metric_type as SessionProgramSummary["metricType"],
    });
  }
  mem.summaries = [...byKey.values()];
}

/**
 * Pull this client's real history — sessions, their SOAP notes, behaviour
 * incidents, and per-session program summaries — from Supabase and merge
 * it into the local `mem` mirror that `runSessionsFor()`/`getRunSession()`/
 * `openSessionFor()`/`getNote()`/`incidentsFor()`/`summariesFor()` above all
 * serve from. Without this, every one of those only ever returned what
 * THIS BROWSER had written — populated exclusively by this file's own
 * create/save calls — so the Sessions/Timeline/Graphs tabs, the client
 * overview's session count, and the "Resume session"/"last completed"
 * badges in the client layout all silently showed only a fraction of a
 * client's real history (or none, on a browser that never happened to run
 * one), not an error a screen could report — the same "RLS returns empty
 * sets, not errors" shape of trap as everywhere else in this app, just
 * from a query that was never actually made rather than one RLS filtered.
 *
 * Deliberately a merge into the existing synchronous mem cache rather than
 * converting every reader above to async: `app/clients/[id]/run/page.tsx`
 * calls them many times over the course of one active session and needs
 * that fast and synchronous. Every caller that reads client history for
 * display instead of live in-session state awaits this once per
 * client-id/route change, then reads the (now-hydrated) synchronous
 * accessors — see the callers for the exact pattern.
 *
 * Deliberately does NOT hydrate `trial_events` (`eventsForSession()`/
 * `eventsFor()`) — that table is one row per atomic observation, the
 * highest-volume table this app writes, and every current caller only
 * ever needs a count or a same-session live feed. Bulk-fetching a
 * client's entire raw observation history into the browser just to
 * display a number is a worse trade than the gap it would close; left as
 * a known, narrower remaining limitation (an observation count reads 0
 * for a session this browser didn't run) rather than attempted here.
 */
export async function hydrateClientHistory(clientId: number): Promise<void> {
  if (IS_PREVIEW) return; // preview fixtures already model "this device's" full history
  const sessionIds = await hydrateSessionRows(clientId);
  await Promise.all([
    hydrateNoteRows(clientId),
    hydrateIncidentRows(clientId),
    hydrateSummaryRows(sessionIds),
  ]);
  persistMem();
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
    // session_program_summaries' RLS policies (migration 0004) are
    // `clinic_id = auth_clinic_id() and auth_is_staff()` with no `clinic_id
    // is null` fallback, unlike the shared-metric tables that deliberately
    // allow a null clinic_id (scorecard_metrics, credential_rule_versions).
    // A null clinic_id here doesn't leak cross-clinic - `null = auth_clinic_id()`
    // is never true in SQL - it makes the insert's own WITH CHECK fail, so
    // every session-end with a computed summary would have thrown here.
    const clinicId = await myClinicId();
    const rows = mem.summaries.filter((x) => x.sessionId === sessionId).map((x) => ({
      client_session_id: sessionId, program_id: x.programId,
      raw_observation_count: x.rawObservationCount, numerator: x.numerator, denominator: x.denominator,
      calculated_value: x.calculatedValue, metric_type: x.metricType, clinic_id: clinicId,
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

/**
 * The signed-in clinician's own `staff` resource id ("employee_id" on
 * `sessions`), resolved via `employment_records` — the only tracked link
 * between an auth login (`profiles`/`auth.users`) and a scheduler resource
 * (`staff`), added by migration 0026. `staff` itself carries no `user_id`;
 * see that migration's own header ("Nothing joins staff to the other two")
 * before assuming otherwise. `employment_records_read`'s RLS
 * (`auth_may_read_hr_of`) always admits reading your own row, so this needs
 * no new grant. A clinician with no live employment record linked to a
 * scheduler resource (never linked, or linked then unlinked) gets `null`
 * here — not an error, just nothing to look up sessions by.
 */
async function myEmployeeId(): Promise<number | null> {
  const user = (await sb().auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await sb()
    .from("employment_records")
    .select("staff_id")
    .eq("user_id", user.id)
    .is("end_date", null)
    .not("staff_id", "is", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.staff_id == null ? null : Number(data.staff_id);
}

/**
 * The signed-in clinician's own upcoming (and recent) sessions across every
 * client on their caseload, for the read-only caseload calendar
 * (app/caseload's Calendar view, components/caseload-calendar.tsx). Reuses
 * the same `sessions` table and the same clinic-wide staff read policy
 * (`sessions_clinical_staff_select`, migration 0014) apps/scheduler and this
 * file's own `getTodaySessions()` already read under — confirmed via
 * `auth_is_staff()` (migration 0009) admitting `clinician`, so no new RLS
 * grant is needed here. That policy is clinic-wide, not scoped to "mine," so
 * the `.eq("employee_id", ...)` below is what actually narrows the read to
 * this clinician's own bookings rather than the whole clinic's — an
 * app-level scope on top of a broader grant, the same shape as every other
 * "clinic-wide read, narrowed in the query" case in this file.
 *
 * Cancelled sessions are excluded (matches apps/scheduler's own live
 * calendar) — a cancelled booking isn't part of "what's on my schedule."
 */
export async function getMyCaseloadSessions(startDate: string, endDate: string): Promise<CaseloadCalendarResult> {
  if (IS_PREVIEW) {
    return { status: "ok", sessions: previewCaseloadSessions.filter((s) => s.date >= startDate && s.date <= endDate) };
  }
  const employeeId = await myEmployeeId();
  if (employeeId == null) return { status: "not_linked" };

  const { data, error } = await sb()
    .from("sessions")
    .select("id,client_id,session_date,hour,minute,type,status, clients(name)")
    .eq("employee_id", employeeId)
    .gte("session_date", startDate)
    .lte("session_date", endDate)
    .neq("status", "cancelled")
    .order("session_date")
    .order("hour")
    .order("minute");
  if (error) throw error;

  const sessions = (data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as number,
    clientId: s.client_id as number,
    clientName: ((s.clients as { name?: string } | null)?.name) ?? `Client ${s.client_id}`,
    date: s.session_date as string,
    hour: s.hour as number,
    minute: (s.minute as number) ?? 0,
    time: fmtTime(s.hour as number, (s.minute as number) ?? 0),
    type: (s.type as string) ?? "Session",
    status: (s.status as string) ?? "scheduled",
  }));
  return { status: "ok", sessions };
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

/**
 * Create a new goal. Previously "Save goal (pending supervisor sign-off)"
 * (app/clients/[id]/programs/page.tsx's NewGoalForm) built a plain local
 * object and never called Supabase at all — the whole "pending supervisor
 * sign-off" claim was cosmetic, since nothing was ever saved anywhere a
 * supervisor could see it. Now writes a real `programs` row with
 * `status: 'pending_signoff'`.
 */
export async function createProgram(input: {
  clientId: number; name: string; domain: string | null; mode: Program["mode"];
  operationalDefinition: string; masteryPct: number; promptLevel: Program["promptLevel"];
  reinforcementSchedule: string; sd: string | null; targetDirection: Program["targetDirection"];
}): Promise<Program> {
  const masteryCriteria = `${input.masteryPct}% across 3 consecutive sessions, 2 settings, 2 people`;
  if (IS_PREVIEW) {
    return {
      id: `p-${Date.now()}`, clientId: input.clientId, name: input.name, domain: input.domain,
      mode: input.mode, operationalDefinition: input.operationalDefinition, masteryCriteria,
      masteryPct: input.masteryPct, masteryConsecutive: 3, promptLevel: input.promptLevel,
      reinforcementSchedule: input.reinforcementSchedule, sd: input.sd,
      targetDirection: input.targetDirection, status: "pending_signoff",
      intervalSeconds: 30, dailyTargetMinutes: null, steps: [], targets: [], last5: [],
    };
  }
  const user = (await sb().auth.getUser()).data.user;
  const { data, error } = await sb()
    .from("programs")
    .insert({
      clinic_id: await myClinicId(), client_id: input.clientId, name: input.name, domain: input.domain,
      measurement_mode: input.mode, operational_definition: input.operationalDefinition,
      mastery_criteria: masteryCriteria, mastery_pct: input.masteryPct,
      prompt_level: input.promptLevel, reinforcement_schedule: input.reinforcementSchedule,
      sd: input.sd, target_direction: input.targetDirection, status: "pending_signoff",
      created_by: user?.id,
    })
    .select("*, program_steps(*), program_targets(*)")
    .single();
  if (error) throw error;
  return mapProgram(data);
}

/**
 * The supervisor sign-off action: pending_signoff -> active. App-layer gated
 * only (see ProgramsPage) — `programs`' RLS update policy
 * (`clinic_id = auth_clinic_id() and auth_is_staff()`, migration 0001) admits
 * clinician, supervisor and admin identically, the same shape of gap as
 * `session_notes`' countersign policy. Logged in BLOCKED-data.md; the
 * `.eq("status", "pending_signoff")` at least keeps this call a no-op
 * against a program that already moved on.
 */
export async function activateProgram(programId: string): Promise<void> {
  if (IS_PREVIEW) return; // nothing server-side to flip; the caller updates its own local list
  const { error } = await sb().from("programs").update({ status: "active" }).eq("id", programId).eq("status", "pending_signoff");
  if (error) throw error;
}

/* ---- clinical reports (progress-report sign/lock persistence) ------------- */
/**
 * `app/clients/[id]/report/page.tsx`'s draft → reviewed → approved → signed
 * flow used to be pure React state: `useState<Status>("draft")` with no
 * write to Supabase anywhere. The `clinical_reports` table already exists
 * with exactly this status flow and its own immutability trigger
 * (`forbid_signed_report_update`, migration 0003 — a signed/locked row can
 * only ever move to 'superseded', never be edited further), built for
 * precisely this workflow. A "signed, locked, immutable" report that isn't
 * persisted anywhere satisfies none of that — it's just a page that
 * happens to say "locked" until the next reload wipes it. This wires the
 * page onto the real table, including resuming an in-progress or already
 * signed report on load instead of always starting from a blank draft.
 */

export type ClinicalReportStatus = "draft" | "reviewed" | "approved" | "signed" | "locked" | "superseded";

export interface ClinicalReportRecord {
  reportGroup: string;
  version: number;
  status: ClinicalReportStatus;
  periodStart: string;
  periodEnd: string;
  packetId: string | null;
  blocks: ReportBlock[];
  modelNote: string | null;
  packet: ClinicalEvidencePacket | null;
}

/** The latest non-superseded version of this client's progress report, if any. */
export async function getLatestClinicalReport(
  clientId: number,
  reportType = "progress_report",
): Promise<ClinicalReportRecord | null> {
  if (IS_PREVIEW) return null; // preview keeps its existing from-scratch-each-visit behaviour
  const { data, error } = await sb()
    .from("clinical_reports")
    .select("report_group, version, status, period_start, period_end, packet_id, blocks, model_note")
    .eq("client_id", clientId)
    .eq("report_type", reportType)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let packet: ClinicalEvidencePacket | null = null;
  if (data.packet_id) {
    const { data: pkt } = await sb().from("evidence_packets").select("packet").eq("id", data.packet_id).maybeSingle();
    packet = (pkt?.packet as ClinicalEvidencePacket) ?? null;
  }

  return {
    reportGroup: data.report_group as string,
    version: data.version as number,
    status: data.status as ClinicalReportStatus,
    periodStart: data.period_start as string,
    periodEnd: data.period_end as string,
    packetId: (data.packet_id as string | null) ?? null,
    blocks: (data.blocks as ReportBlock[]) ?? [],
    modelNote: (data.model_note as string | null) ?? null,
    packet,
  };
}

/**
 * Upsert the current version's status and blocks. Called after generation
 * (status: 'draft') and after every review-flow transition. Upserting the
 * same (report_group, version) is what keeps this idempotent through
 * "Mark reviewed" -> "Approve" -> "Sign & lock" without creating extra rows;
 * once a row is actually 'signed'/'locked', the table's own trigger rejects
 * any further update here that isn't a move to 'superseded' — this
 * function doesn't need to duplicate that check, the write will just fail
 * with a clear Postgres error if a stale client tries it.
 */
export async function saveClinicalReportProgress(input: {
  reportGroup: string;
  version: number;
  clientId: number;
  reportType?: string;
  periodStart: string;
  periodEnd: string;
  packetId: string | null;
  blocks: ReportBlock[];
  modelNote: string | null;
  status: ClinicalReportStatus;
}): Promise<void> {
  if (IS_PREVIEW) return;
  const user = (await sb().auth.getUser()).data.user;
  const row: Record<string, unknown> = {
    clinic_id: await myClinicId(), client_id: input.clientId,
    report_group: input.reportGroup, version: input.version,
    report_type: input.reportType ?? "progress_report",
    period_start: input.periodStart, period_end: input.periodEnd,
    packet_id: input.packetId, blocks: input.blocks, model_note: input.modelNote,
    status: input.status, created_by: user?.id,
  };
  if (input.status === "signed") row.signed_by = user?.id;
  if (input.status === "signed") row.signed_at = new Date().toISOString();
  const { error } = await sb().from("clinical_reports").upsert(row, { onConflict: "report_group,version" });
  if (error) throw error;
}

/**
 * "Create revision": supersede the current signed/locked version (the only
 * transition the immutability trigger allows on it) and hand back the next
 * version number for the caller's next `saveClinicalReportProgress()` call,
 * which inserts a brand-new row rather than updating the old one.
 */
export async function reviseClinicalReport(reportGroup: string, currentVersion: number): Promise<number> {
  if (IS_PREVIEW) return currentVersion + 1;
  const { error } = await sb()
    .from("clinical_reports")
    .update({ status: "superseded" })
    .eq("report_group", reportGroup)
    .eq("version", currentVersion);
  if (error) throw error;
  return currentVersion + 1;
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

/**
 * The supervisor Review Queue, for real: every session note awaiting
 * countersign across the WHOLE CLINIC, not just the ones this browser
 * happened to write. `pendingNotes()` above only ever reads the local
 * `mem.notes` mirror — populated exclusively by this same browser's own
 * `saveNote()` calls — so a supervisor opening the Review Queue on their
 * own device saw an empty queue no matter how many real clinicians had
 * real notes awaiting countersign, unless they personally happened to be
 * the one who wrote it. RLS already grants clinic-wide staff read on
 * `session_notes` (`clinic_id = auth_clinic_id() and auth_is_staff()`,
 * migration 0001), the same policy shape apps/employee's
 * `listPendingSignoffs()` already relies on for its own clinic-wide queue —
 * this just actually calls it.
 */
export async function getPendingCountersigns(): Promise<PendingCountersign[]> {
  if (IS_PREVIEW) {
    return pendingNotes().map((n) => ({
      id: `preview-${n.sessionId}`,
      sessionId: n.sessionId,
      clientId: n.clientId ?? 0,
      clientName: previewClients.find((c) => c.id === n.clientId)?.name ?? `Client ${n.clientId}`,
      clinicianId: null,
      clinicianName: "You (preview)",
      createdAt: new Date().toISOString(),
      note: n,
    }));
  }
  const { data, error } = await sb()
    .from("session_notes")
    .select("id, session_id, client_id, clinician_id, body, billable_code, status, created_at, clients(name), profiles!clinician_id(full_name)")
    .eq("status", "awaiting_countersign")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const body = (row.body as Record<string, unknown>) ?? {};
    const note: SessionNoteDraft = {
      sessionId: row.session_id as number,
      clientId: row.client_id as number | null,
      subjective: (body.subjective as string) ?? "",
      objective: (body.objective as string) ?? "",
      assessment: (body.assessment as string) ?? "",
      plan: (body.plan as string) ?? "",
      perProgram: (body.perProgram as SessionNoteDraft["perProgram"]) ?? [],
      abcNarrative: (body.abcNarrative as string) ?? "",
      billableCode: row.billable_code as SessionNoteDraft["billableCode"],
      status: row.status as SessionNoteDraft["status"],
    };
    return {
      id: row.id as string,
      sessionId: row.session_id as number,
      clientId: row.client_id as number,
      clientName: ((row.clients as { name?: string } | null)?.name) ?? `Client ${row.client_id}`,
      clinicianId: row.clinician_id as string | null,
      clinicianName: ((row.profiles as { full_name?: string } | null)?.full_name) ?? "Unknown clinician",
      createdAt: row.created_at as string,
      note,
    };
  });
}

/**
 * Countersign or return a note by its real `session_notes.id`, regardless of
 * which browser originally wrote it — unlike `saveNote()`/`lockRunSession()`,
 * which only ever operate on this browser's own `mem` mirror and would
 * silently no-op (nothing matches) for a note someone else drafted.
 */
export async function countersignNote(
  item: PendingCountersign,
  decision: "countersigned" | "returned",
  returnNote?: string,
): Promise<void> {
  if (IS_PREVIEW) {
    await saveNote({ ...item.note, status: decision });
    if (decision === "countersigned") await lockRunSession(item.sessionId);
    return;
  }
  const user = (await sb().auth.getUser()).data.user;
  const patch: Record<string, unknown> = { status: decision };
  if (decision === "countersigned") {
    patch.countersigned_by = user?.id ?? null;
    patch.countersigned_at = new Date().toISOString();
  } else {
    patch.return_note = returnNote ?? null;
  }
  const { error } = await sb().from("session_notes").update(patch).eq("id", item.id);
  if (error) throw error;

  if (decision === "countersigned") {
    // Only from 'completed' -> 'locked': the forbid_locked_session_update
    // trigger (migration 0004) rejects any other transition, and this
    // write may be racing a session that never reached 'completed' at all.
    const { error: lockErr } = await sb()
      .from("client_sessions")
      .update({ status: "locked" })
      .eq("id", item.sessionId)
      .eq("status", "completed");
    if (lockErr) throw lockErr;
  }
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
