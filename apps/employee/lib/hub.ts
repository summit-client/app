"use client";

/**
 * Employee Hub data layer. Same seam pattern as the clinician portal: with
 * NEXT_PUBLIC_DEV_PREVIEW=1 everything runs on a localStorage-backed store
 * (fully interactive, no database); otherwise reads/writes go to the Supabase
 * tables from migration 0006 under RLS. Screens never branch on the flag.
 *
 * Business rules ported intact from the Mount Etna Employee Hub:
 *  - the whole onboarding window is due 14 days from the start date;
 *  - onboarding % counts required + applicable tasks only;
 *  - completing every required applicable task auto-issues the Module 00
 *    certificate (idempotent), numbered <ORG>-<year>-<seq>;
 *  - VSC gate: no unsupervised in-person client work until Cleared;
 *  - time off: 10 vacation days (15 at 5 years of service, Ontario ESA) and
 *    5 sick/mental-health days per entitlement year, reset on the anniversary.
 */

import { createBrowserClient } from "@supabase/ssr";
import { HUB_COURSES, HUB_TASKS, type DeadlineBucket, type HubTask } from "./content";

export const IS_PREVIEW = process.env.NEXT_PUBLIC_DEV_PREVIEW === "1";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/* ---- types ------------------------------------------------------------------ */

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "AWAITING_SIGNOFF" | "NOT_APPLICABLE";
export type VscStatus = "NOT_SUBMITTED" | "APPLIED" | "PENDING" | "CLEARED" | "REQUIRES_FOLLOWUP";
export type HubRole = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";

export interface EmployeeProfile {
  id: string;
  name: string;
  employeeNumber: string;
  jobTitle: string | null;
  location: string | null;
  role: HubRole;
  startDate: string | null;        // ISO; drives every deadline
  vscStatus: VscStatus;
}

export interface TaskProgress { taskKey: string; status: TaskStatus; notes: string; applicable: boolean }
export interface TrainingRecord { courseKey: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; completedAt: string | null }
export interface PdRecord {
  id: string; title: string; provider: string; hours: number; date: string; verified: boolean;
  category: "BACB_CEU" | "CPBAO_CE" | "IBAO_CEU" | "GENERAL_PD";
  ceuUnits: number | null;
  fileName: string | null;      // uploaded certificate PDF
  detection: string;            // what the reader detected (or why it fell back)
}
export interface Certificate { id: string; certNumber: string; title: string; competency: string; instructor: string; issuedDate: string; expiryDate: string | null }
export interface TimeOffRequest { id: string; type: "VACATION" | "SICK"; startDate: string; endDate: string; days: number; status: "REQUESTED" | "APPROVED" | "DENIED" | "CANCELLED"; note: string }
export interface AuditEvent { id: string; action: string; detail: string; at: string; who: string }

export const ONBOARDING_CERT_TITLE = "New Team Member Onboarding";
export const ONBOARDING_CERT_COMPETENCY = "MODULE # 00";
export const PHASE1_CERT_TITLE = "Onboarding Phase 1: Week 1";
export const PHASE2_CERT_TITLE = "Onboarding Phase 2: Week 2";

/* ---- pure logic (ported) ----------------------------------------------------- */

/** Deadline bucket → day offset from the start date. The whole onboarding
 * window is due 14 days from the start date, so Week 1 and 2 share it. */
const DEADLINE_OFFSET_DAYS: Record<DeadlineBucket, number | null> = {
  WEEK_1: 14, WEEK_2: 14, WITHIN_14_DAYS: 14, WITHIN_30_DAYS: 30, CUSTOM: null,
};

export function dueDate(startDate: string | null, bucket: DeadlineBucket): string | null {
  if (!startDate) return null;
  const offset = DEADLINE_OFFSET_DAYS[bucket];
  if (offset == null) return null;
  return new Date(new Date(startDate).getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

export type CertLifecycle = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
export function certLifecycle(expiryDate: string | null, now = new Date()): CertLifecycle {
  if (!expiryDate) return "ACTIVE";
  const days = (new Date(expiryDate).getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "ACTIVE";
}

/** Time-off policy: Ontario ESA vacation minimums + org sick policy. */
export const TIME_OFF_POLICY = { vacationBaseDays: 10, vacationSeniorDays: 15, seniorityYears: 5, sickDays: 5 } as const;

export interface Balance { entitled: number; used: number; pending: number; remaining: number }
export interface Entitlements { serviceYears: number; nextReset: string; vacation: Balance; sick: Balance }

export function computeEntitlements(startIso: string, requests: TimeOffRequest[], now = new Date()): Entitlements {
  const hire = new Date(startIso);
  const anniv = (y: number) => new Date(y, hire.getMonth(), hire.getDate());
  let yearStart = anniv(now.getFullYear());
  if (now < yearStart) yearStart = anniv(now.getFullYear() - 1);
  const yearEnd = new Date(yearStart.getFullYear() + 1, hire.getMonth(), hire.getDate());
  let years = now.getFullYear() - hire.getFullYear();
  if (now < anniv(now.getFullYear())) years -= 1;
  years = Math.max(0, years);

  const tally = (type: TimeOffRequest["type"]) => {
    let used = 0, pending = 0;
    for (const r of requests) {
      const s = new Date(r.startDate);
      if (r.type !== type || s < yearStart || s >= yearEnd) continue;
      if (r.status === "APPROVED") used += r.days;
      else if (r.status === "REQUESTED") pending += r.days;
    }
    return { used, pending };
  };
  const mk = (entitled: number, t: { used: number; pending: number }): Balance =>
    ({ entitled, used: t.used, pending: t.pending, remaining: Math.max(0, entitled - t.used - t.pending) });

  const vEnt = years >= TIME_OFF_POLICY.seniorityYears ? TIME_OFF_POLICY.vacationSeniorDays : TIME_OFF_POLICY.vacationBaseDays;
  return {
    serviceYears: years,
    nextReset: yearEnd.toISOString().slice(0, 10),
    vacation: mk(vEnt, tally("VACATION")),
    sick: mk(TIME_OFF_POLICY.sickDays, tally("SICK")),
  };
}

/** Inclusive calendar-day count (min 0.5). */
export function inclusiveDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return 0;
  return Math.max(0.5, Math.round(ms / 86_400_000) + 1);
}

/** Onboarding %: required + applicable tasks only. */
export function onboardingProgress(progress: TaskProgress[]) {
  const byKey = new Map(progress.map((p) => [p.taskKey, p]));
  const required = HUB_TASKS.filter((t) => t.required !== false);
  const applicable = required.filter((t) => {
    const p = byKey.get(t.key);
    return p?.status !== "NOT_APPLICABLE" && p?.applicable !== false;
  });
  const completed = applicable.filter((t) => byKey.get(t.key)?.status === "COMPLETED").length;
  const percent = applicable.length ? Math.round((completed / applicable.length) * 100) : 0;
  const nextTask = applicable.find((t) => byKey.get(t.key)?.status !== "COMPLETED") ?? null;
  return { applicable: applicable.length, completed, percent, nextTask };
}

export function isOnboardingComplete(progress: TaskProgress[]): boolean {
  const p = onboardingProgress(progress);
  return p.applicable > 0 && p.completed === p.applicable;
}

/* ---- preview store ----------------------------------------------------------- */

interface Store {
  profile: EmployeeProfile;
  progress: TaskProgress[];
  training: TrainingRecord[];
  pd: PdRecord[];
  certificates: Certificate[];
  timeOff: TimeOffRequest[];
  audit: AuditEvent[];
  certSeq: number;
}

const KEY = "summit-hub-store";

function defaultStore(): Store {
  return {
    profile: {
      id: "preview-user", name: "Preview Employee", employeeNumber: "EMP-0001",
      jobTitle: "Behaviour Clinician", location: "Main Clinic", role: "ADMIN",
      startDate: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), // day 4 of onboarding
      vscStatus: "APPLIED",
    },
    progress: [], training: [], pd: [], certificates: [], timeOff: [], audit: [], certSeq: 0,
  };
}

let mem: Store | null = null;

function store(): Store {
  if (mem) return mem;
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? { ...defaultStore(), ...(JSON.parse(raw) as Store) } : defaultStore();
  } catch {
    mem = defaultStore();
  }
  return mem;
}

function persist(): void {
  if (mem) localStorage.setItem(KEY, JSON.stringify(mem));
}

function audit(action: string, detail: string): void {
  const s = store();
  s.audit.unshift({ id: `au-${Date.now().toString(36)}-${s.audit.length}`, action, detail, at: new Date().toISOString(), who: s.profile.name });
  s.audit = s.audit.slice(0, 100);
  persist();
}

/* ---- reads/writes (preview now; live seam noted per function) ----------------- */

export function getProfile(): EmployeeProfile {
  return store().profile;
}

export async function saveProfile(patch: Partial<EmployeeProfile>): Promise<EmployeeProfile> {
  const s = store();
  s.profile = { ...s.profile, ...patch };
  persist();
  audit("profile.updated", Object.keys(patch).join(", "));
  if (!IS_PREVIEW) {
    await sb().from("hub_employee_profiles").upsert({
      user_id: s.profile.id, employee_number: s.profile.employeeNumber, job_title: s.profile.jobTitle,
      location: s.profile.location, start_date: s.profile.startDate, vsc_status: s.profile.vscStatus,
    }, { onConflict: "user_id" });
  }
  return s.profile;
}

export function getProgress(): TaskProgress[] {
  return store().progress;
}

/**
 * Update one onboarding task. Sign-off tasks route COMPLETED through
 * AWAITING_SIGNOFF (only an admin/supervisor completes them); finishing the
 * last required task auto-issues the Module 00 certificate.
 */
export async function updateTask(taskKey: string, patch: { status?: TaskStatus; notes?: string; applicable?: boolean }): Promise<TaskProgress> {
  const task = HUB_TASKS.find((t) => t.key === taskKey);
  if (!task) throw new Error(`Unknown task ${taskKey}`);
  const s = store();
  let row = s.progress.find((p) => p.taskKey === taskKey);
  if (!row) {
    row = { taskKey, status: "NOT_STARTED", notes: "", applicable: true };
    s.progress.push(row);
  }
  if (patch.status) {
    // an employee cannot self-complete a sign-off task
    row.status = patch.status === "COMPLETED" && task.supervisorSignoffRequired && s.profile.role === "EMPLOYEE"
      ? "AWAITING_SIGNOFF"
      : patch.status;
  }
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.applicable !== undefined) row.applicable = patch.applicable;
  persist();
  audit("onboarding.updated", `${task.title} → ${row.status}`);
  maybeIssueOnboardingCertificate();
  if (!IS_PREVIEW) {
    await sb().from("hub_task_progress").upsert({
      user_id: s.profile.id, task_key: taskKey, status: row.status, notes: row.notes, applicable: row.applicable,
    }, { onConflict: "user_id,task_key" });
  }
  return row;
}

/** Supervisor/admin sign-off: AWAITING_SIGNOFF → COMPLETED, recorded. */
export async function signOffTask(taskKey: string): Promise<void> {
  const s = store();
  const row = s.progress.find((p) => p.taskKey === taskKey);
  if (!row || row.status !== "AWAITING_SIGNOFF") return;
  row.status = "COMPLETED";
  persist();
  audit("onboarding.signoff", HUB_TASKS.find((t) => t.key === taskKey)?.title ?? taskKey);
  maybeIssueOnboardingCertificate();
  if (!IS_PREVIEW) {
    await sb().from("hub_task_progress").update({ status: "COMPLETED", signed_off_by: s.profile.id, signed_off_at: new Date().toISOString() })
      .eq("task_key", taskKey);
  }
}

export function getTraining(): TrainingRecord[] {
  return store().training;
}

/** Completing a course also completes the matching onboarding task (replica behaviour). */
export async function setCourseStatus(courseKey: string, status: TrainingRecord["status"]): Promise<void> {
  const s = store();
  let rec = s.training.find((t) => t.courseKey === courseKey);
  if (!rec) {
    rec = { courseKey, status: "NOT_STARTED", completedAt: null };
    s.training.push(rec);
  }
  rec.status = status;
  rec.completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
  persist();
  const course = HUB_COURSES.find((c) => c.key === courseKey);
  audit("training.updated", `${course?.title ?? courseKey} → ${status}`);
  // Every completed course earns its Summit credential.
  if (course && status === "COMPLETED") {
    issueCertificate(course.title, `${course.kind} TRAINING${course.category ? ` · ${course.category.toUpperCase()}` : ""}`);
  }
  const linked = HUB_TASKS.find((t) => t.courseKey === courseKey);
  if (linked && status === "COMPLETED") await updateTask(linked.key, { status: "COMPLETED" });
  if (!IS_PREVIEW) {
    await sb().from("hub_employee_training").upsert({
      user_id: s.profile.id, course_key: courseKey, status, completed_at: rec.completedAt,
    }, { onConflict: "user_id,course_key" });
  }
}

export function getPd(): PdRecord[] {
  return store().pd;
}

export async function addPd(entry: Omit<PdRecord, "id" | "verified">): Promise<void> {
  const s = store();
  s.pd.unshift({ ...entry, id: `pd-${Date.now().toString(36)}`, verified: false });
  persist();
  audit("pd.added", `${entry.title} (${entry.hours}h · ${entry.category})`);
  if (!IS_PREVIEW) {
    await sb().from("hub_pd_records").insert({
      user_id: s.profile.id, title: entry.title, provider: entry.provider, hours: entry.hours, date: entry.date,
      category: entry.category, ceu_units: entry.ceuUnits, file_name: entry.fileName, detection: entry.detection,
    });
  }
}

export async function verifyPd(id: string): Promise<void> {
  const s = store();
  const r = s.pd.find((x) => x.id === id);
  if (r) { r.verified = true; persist(); audit("pd.verified", r.title); }
  if (!IS_PREVIEW) await sb().from("hub_pd_records").update({ verified: true }).eq("id", id);
}

export function getCertificates(): Certificate[] {
  return store().certificates;
}

/** Idempotent issuance by title, numbered SUMMIT-<year>-<seq> (sequential registry). */
export function issueCertificate(title: string, competency: string): Certificate {
  const s = store();
  const existing = s.certificates.find((c) => c.title === title);
  if (existing) return existing;
  s.certSeq += 1;
  const cert: Certificate = {
    id: `cert-${Date.now().toString(36)}-${s.certSeq}`,
    certNumber: `SUMMIT-${new Date().getFullYear()}-${String(s.certSeq).padStart(6, "0")}`,
    title,
    competency,
    instructor: "", // unsigned Summit credential; the issuing organization renders from Settings
    issuedDate: new Date().toISOString().slice(0, 10),
    expiryDate: null,
  };
  s.certificates.unshift(cert);
  persist();
  audit("certificate.issued", `${cert.title} · ${cert.certNumber}`);
  return cert;
}

/** Phase progress: required + applicable tasks of one week only. */
function weekComplete(week: 1 | 2, progress: TaskProgress[]): boolean {
  const byKey = new Map(progress.map((p) => [p.taskKey, p]));
  const required = HUB_TASKS.filter((t) => t.week === week && t.required !== false);
  const applicable = required.filter((t) => {
    const p = byKey.get(t.key);
    return p?.status !== "NOT_APPLICABLE" && p?.applicable !== false;
  });
  return applicable.length > 0 && applicable.every((t) => byKey.get(t.key)?.status === "COMPLETED");
}

/**
 * Certificate cascade: every completed phase earns its credential, up to full
 * completion: Phase 1 (Week 1) → Phase 2 (Week 2) → Module 00. Each is
 * idempotent; called after every task change.
 */
export function maybeIssueOnboardingCertificate(): Certificate | null {
  const s = store();
  if (weekComplete(1, s.progress)) issueCertificate(PHASE1_CERT_TITLE, "ONBOARDING · PHASE 1");
  if (weekComplete(2, s.progress)) issueCertificate(PHASE2_CERT_TITLE, "ONBOARDING · PHASE 2");
  if (isOnboardingComplete(s.progress)) return issueCertificate(ONBOARDING_CERT_TITLE, ONBOARDING_CERT_COMPETENCY);
  return null;
}

export function getTimeOff(): TimeOffRequest[] {
  return store().timeOff;
}

export async function requestTimeOff(req: Omit<TimeOffRequest, "id" | "status" | "days">): Promise<void> {
  const s = store();
  const days = inclusiveDays(req.startDate, req.endDate);
  s.timeOff.unshift({ ...req, id: `to-${Date.now().toString(36)}`, days, status: "REQUESTED" });
  persist();
  audit("timeoff.requested", `${req.type} ${req.startDate} → ${req.endDate} (${days}d)`);
  if (!IS_PREVIEW) {
    await sb().from("hub_time_off_requests").insert({
      user_id: s.profile.id, type: req.type, start_date: req.startDate, end_date: req.endDate, days, note: req.note,
    });
  }
}

export async function decideTimeOff(id: string, decision: "APPROVED" | "DENIED" | "CANCELLED"): Promise<void> {
  const s = store();
  const r = s.timeOff.find((x) => x.id === id);
  if (r) { r.status = decision; persist(); audit("timeoff.decided", `${r.type} ${r.startDate} → ${decision}`); }
  if (!IS_PREVIEW) await sb().from("hub_time_off_requests").update({ status: decision, decided_at: new Date().toISOString() }).eq("id", id);
}

export function getAudit(): AuditEvent[] {
  return store().audit;
}

/** Preview helper: switch the acting role to demo the admin/supervisor views. */
export async function setRole(role: HubRole): Promise<void> {
  await saveProfile({ role });
}
