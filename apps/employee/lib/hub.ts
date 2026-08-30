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

import { HUB_COURSES, HUB_TASKS, type DeadlineBucket, type HubTask } from "./content";
import { IS_PREVIEW, type HubRole, type Session } from "./session";
import { previewBackend, supabaseBackend, type HubBackend, type HubSnapshot } from "./hub-backend";

export { IS_PREVIEW };
export * from "./hub-types";
import type {
  AuditEvent, Certificate, EmployeeProfile, PdRecord, PendingSignoff, TaskProgress,
  TaskStatus, TimeOffRequest, TrainingRecord,
} from "./hub-types";

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

/**
 * Course-linked onboarding tasks derive from the training record: one
 * completion, recorded once, reflected everywhere. Manual status entry on
 * those tasks is disabled in the UI, so nothing is typed twice and nothing
 * is forgotten in one place.
 */
export function derivedTaskProgress(taskKey: string): TaskProgress | null {
  const task = HUB_TASKS.find((t) => t.key === taskKey);
  if (!task?.courseKey) return null;
  const rec = requireSnap().training.find((t) => t.courseKey === task.courseKey);
  const stored = requireSnap().progress.find((p) => p.taskKey === taskKey);
  const status: TaskStatus = rec?.status === "COMPLETED" ? "COMPLETED" : rec?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
  return {
    taskKey,
    status,
    notes: stored?.notes ?? "",
    applicable: stored?.applicable ?? true,
    completedAt: rec?.completedAt ?? null,
  };
}

/** Stored progress with course-linked tasks overlaid from training. */
export function effectiveProgress(progress: TaskProgress[] = requireSnap().progress): TaskProgress[] {
  const byKey = new Map(progress.map((p) => [p.taskKey, p]));
  return HUB_TASKS.map((t) => derivedTaskProgress(t.key) ?? byKey.get(t.key) ?? {
    taskKey: t.key, status: "NOT_STARTED" as TaskStatus, notes: "", applicable: true, completedAt: null,
  });
}

/** Onboarding %: required + applicable tasks only, course tasks derived. */
export function onboardingProgress(progress: TaskProgress[]) {
  progress = effectiveProgress(progress);
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

/* ---- the loaded snapshot --------------------------------------------------- */

/**
 * hub.ts keeps synchronous reads on purpose: 37 call sites across 14 screens
 * read getProgress() and friends inline during render, and making them async
 * would have meant rewriting all of them. Instead the provider loads once,
 * before any screen renders, and these read the loaded snapshot.
 *
 * Mutations are async because they now genuinely go somewhere.
 */

let backend: HubBackend | null = null;
let snap: HubSnapshot | null = null;
const listeners = new Set<() => void>();

function requireSnap(): HubSnapshot {
  if (!snap) throw new Error("hub read before loadHub() - screen is not inside <HubGate>");
  return snap;
}

function changed(): void {
  for (const l of listeners) l();
}

/** Subscribe to mutations, so a screen re-renders after a write. */
export function onHubChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Load everything for this session. Called by <HubProvider>. */
export async function loadHub(session: Session): Promise<void> {
  backend = IS_PREVIEW ? previewBackend(session) : supabaseBackend(session);
  snap = await backend.load();
  changed();
}

export function isHubLoaded(): boolean {
  return snap !== null;
}

function be(): HubBackend {
  if (!backend) throw new Error("hub mutation before loadHub()");
  return backend;
}

async function audit(action: string, detail: string): Promise<void> {
  const s = requireSnap();
  s.audit.unshift({
    id: `au-${Date.now().toString(36)}-${s.audit.length}`,
    action, detail, at: new Date().toISOString(), who: s.profile.name,
  });
  s.audit = s.audit.slice(0, 100);
  await be().audit(action, detail);
}

/* ---- reads/writes (preview now; live seam noted per function) ----------------- */

export function getProfile(): EmployeeProfile {
  return requireSnap().profile;
}

export async function saveProfile(patch: Partial<EmployeeProfile>): Promise<EmployeeProfile> {
  const s = requireSnap();
  const next = { ...s.profile, ...patch };
  await be().saveProfile(patch, next);
  s.profile = next;
  await audit("profile.updated", Object.keys(patch).join(", "));
  changed();
  return next;
}

export function getProgress(): TaskProgress[] {
  return requireSnap().progress;
}

/**
 * Update one onboarding task. Sign-off tasks route COMPLETED through
 * AWAITING_SIGNOFF (only an admin/supervisor completes them); finishing the
 * last required task auto-issues the Module 00 certificate.
 */
export async function updateTask(taskKey: string, patch: { status?: TaskStatus; notes?: string; applicable?: boolean }): Promise<TaskProgress> {
  const task = HUB_TASKS.find((t) => t.key === taskKey);
  if (!task) throw new Error(`Unknown task ${taskKey}`);
  if (task.courseKey && patch.status) {
    throw new Error("This item completes from Training; record it there once and it reflects here.");
  }
  const s = requireSnap();
  let row = s.progress.find((p) => p.taskKey === taskKey);
  if (!row) {
    row = { taskKey, status: "NOT_STARTED", notes: "", applicable: true, completedAt: null };
    s.progress.push(row);
  }
  if (patch.status) {
    // an employee cannot self-complete a sign-off task
    row.status = patch.status === "COMPLETED" && task.supervisorSignoffRequired && s.profile.role === "EMPLOYEE"
      ? "AWAITING_SIGNOFF"
      : patch.status;
    row.completedAt = row.status === "COMPLETED" ? new Date().toISOString() : null;
  }
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.applicable !== undefined) row.applicable = patch.applicable;
  await be().upsertTask(row);
  await audit("onboarding.updated", `${task.title} → ${row.status}`);
  changed();
  return row;
}

/** Everything AWAITING_SIGNOFF across the caller's team/clinic - see
 *  HubBackend.listPendingSignoffs. Not part of the loaded snapshot: it names
 *  other people, so hub.ts's single-user requireSnap() shape doesn't fit it. */
export async function listPendingSignoffs(): Promise<PendingSignoff[]> {
  return be().listPendingSignoffs();
}

/**
 * Supervisor/admin sign-off: AWAITING_SIGNOFF → COMPLETED, recorded.
 *
 * The loaded snapshot (`s.progress`) is always the CALLER's own, never the
 * subject's - guarding on it before writing (the old behaviour) meant signing
 * off someone else's task found no matching local row and returned early
 * without ever calling the backend, so the button silently did nothing for
 * every cross-employee sign-off, which is the only kind the admin queue
 * produces. Now the write always happens; the local snapshot is only patched
 * when the caller happened to sign off their own task.
 */
export async function signOffTask(taskKey: string, subjectId?: string): Promise<void> {
  const s = requireSnap();
  const subject = subjectId ?? s.profile.id;
  await be().signOffTask(taskKey, subject);
  if (subject === s.profile.id) {
    const row = s.progress.find((p) => p.taskKey === taskKey);
    if (row && row.status === "AWAITING_SIGNOFF") {
      row.status = "COMPLETED";
      row.completedAt = new Date().toISOString();
    }
  }
  await audit("onboarding.signoff", HUB_TASKS.find((t) => t.key === taskKey)?.title ?? taskKey);
  changed();
}

export function getTraining(): TrainingRecord[] {
  return requireSnap().training;
}

export const REFRESH_DAYS = 365;

/** Completions refresh yearly: past the refresh date a course is due again. */
export function refreshDue(rec: TrainingRecord | undefined): { due: boolean; refreshOn: string | null } {
  if (!rec?.completedAt || rec.status !== "COMPLETED") return { due: false, refreshOn: null };
  const refreshOn = new Date(new Date(rec.completedAt).getTime() + REFRESH_DAYS * 86_400_000);
  return { due: refreshOn.getTime() < Date.now(), refreshOn: refreshOn.toISOString().slice(0, 10) };
}

/** Completing a course also completes the matching onboarding task (replica behaviour). */
export async function setCourseStatus(courseKey: string, status: TrainingRecord["status"]): Promise<void> {
  const s = requireSnap();
  let rec = s.training.find((t) => t.courseKey === courseKey);
  if (!rec) {
    rec = { courseKey, status: "NOT_STARTED", completedAt: null };
    s.training.push(rec);
  }
  rec.status = status;
  rec.completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
  const course = HUB_COURSES.find((c) => c.key === courseKey);
  // Persist the training record BEFORE asking for the certificate: the database
  // function checks for a COMPLETED row and would refuse otherwise.
  await be().upsertTraining(rec);
  await audit("training.updated", `${course?.title ?? courseKey} → ${status}`);
  // Every completed course earns its Summit credential. Numbered modules
  // carry their module number on the certificate, like the MEGBA program.
  if (course && status === "COMPLETED") {
    const competency = course.category === "Summit Module"
      ? `MODULE # ${String(course.order).padStart(2, "0")}`
      : `${course.kind} TRAINING${course.category ? ` · ${course.category.toUpperCase()}` : ""}`;
    const cert = await be().issueCourseCertificate(courseKey, course.title, competency);
    if (cert && !s.certificates.some((c) => c.id === cert.id)) s.certificates.unshift(cert);
  }
  changed();
}

export function getPd(): PdRecord[] {
  return requireSnap().pd;
}

export async function addPd(entry: Omit<PdRecord, "id" | "verified">): Promise<void> {
  const s = requireSnap();
  const row = await be().addPd(entry);
  s.pd.unshift(row);
  await audit("pd.added", `${entry.title} (${entry.hours}h · ${entry.category})`);
  changed();
}

export async function verifyPd(id: string): Promise<void> {
  const s = requireSnap();
  const r = s.pd.find((x) => x.id === id);
  if (!r) return;
  await be().verifyPd(id);
  r.verified = true;
  await audit("pd.verified", r.title);
  changed();
}

export function getCertificates(): Certificate[] {
  return requireSnap().certificates;
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
 * Which onboarding credentials this person has EARNED but has not been issued.
 *
 * The client used to mint these itself, with a registry number from a counter in
 * localStorage. It cannot any more and should not: nothing here can verify "all
 * required tasks are complete" in a way the person completing them cannot edit,
 * and while the task template lives in code the database cannot verify it
 * either. So a supervisor issues them, and this is what puts them in the queue.
 * Migration 0008 has the full reasoning.
 */
export function pendingOnboardingCertificates(
  // effectiveProgress(), not raw progress. 12 of the 36 required Week 1 tasks
  // and 3 of Week 2's are course-linked, and since course-linked tasks were made
  // to DERIVE from the training record rather than store their own row, they are
  // never COMPLETED in raw progress. weekComplete() read raw progress, so Week 1
  // could never complete and the certificate cascade was unreachable - it had
  // been dead since the single-source-of-truth commit.
  progress: TaskProgress[] = effectiveProgress(),
): { title: string; competency: string }[] {
  const held = new Set(requireSnap().certificates.map((c) => c.title));
  const earned: { title: string; competency: string }[] = [];
  if (weekComplete(1, progress)) earned.push({ title: PHASE1_CERT_TITLE, competency: "ONBOARDING · PHASE 1" });
  if (weekComplete(2, progress)) earned.push({ title: PHASE2_CERT_TITLE, competency: "ONBOARDING · PHASE 2" });
  if (isOnboardingComplete(progress)) earned.push({ title: ONBOARDING_CERT_TITLE, competency: ONBOARDING_CERT_COMPETENCY });
  return earned.filter((e) => !held.has(e.title));
}

/** Issue an earned onboarding certificate. Manager-only, enforced in the
 *  database by hub_issue_certificate() -> hub_can_manage(); the button that
 *  calls this is inside a HubGate that already requires SUPERVISOR or ADMIN,
 *  but the gate that matters is the one the browser cannot reach past. */
export async function issueOnboardingCertificate(title: string, competency: string): Promise<void> {
  const s = requireSnap();
  const cert = await be().issueOnboardingCertificate(s.profile.id, title, competency);
  if (cert && !s.certificates.some((c) => c.id === cert.id)) s.certificates.unshift(cert);
  await audit("certificate.issued", title);
  changed();
}

export function getTimeOff(): TimeOffRequest[] {
  return requireSnap().timeOff;
}

export async function requestTimeOff(req: Omit<TimeOffRequest, "id" | "status" | "days">): Promise<void> {
  const s = requireSnap();
  const days = inclusiveDays(req.startDate, req.endDate);
  const row = await be().requestTimeOff(req, days);
  s.timeOff.unshift(row);
  await audit("timeoff.requested", `${req.type} ${req.startDate} → ${req.endDate} (${days}d)`);
  changed();
}

export async function decideTimeOff(id: string, decision: "APPROVED" | "DENIED" | "CANCELLED"): Promise<void> {
  const s = requireSnap();
  const r = s.timeOff.find((x) => x.id === id);
  if (!r) return;
  await be().decideTimeOff(id, decision);
  r.status = decision;
  await audit("timeoff.decided", `${r.type} ${r.startDate} → ${decision}`);
  changed();
}

export function getAudit(): AuditEvent[] {
  return requireSnap().audit;
}

/* setRole() removed. The acting role is no longer something the browser can
   write: it comes from profiles.role through lib/session.ts, and the preview
   switcher lives in setPreviewRole(), which is a no-op outside preview. */
