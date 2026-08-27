"use client";

/**
 * Where hub data actually lives.
 *
 * Two implementations of one interface, chosen once at load. The previous code
 * put `if (!IS_PREVIEW) await sb()...` at the end of each mutation, which is how
 * the two paths drifted so far apart that the live one could never have worked:
 * it wrote `user_id: "preview-user"` into a uuid column, never read anything
 * back, and ignored every error it got. One interface makes a missing live
 * implementation a type error instead of a silent no-op.
 *
 * Both backends return the same snapshot shape, so screens never branch.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "./session";
import type {
  AuditEvent, Certificate, EmployeeProfile, PdRecord, TaskProgress,
  TaskStatus, TimeOffRequest, TrainingRecord,
} from "./hub-types";

export interface HubSnapshot {
  profile: EmployeeProfile;
  progress: TaskProgress[];
  training: TrainingRecord[];
  pd: PdRecord[];
  certificates: Certificate[];
  timeOff: TimeOffRequest[];
  audit: AuditEvent[];
}

export interface HubBackend {
  load(): Promise<HubSnapshot>;
  saveProfile(patch: Partial<EmployeeProfile>, next: EmployeeProfile): Promise<void>;
  upsertTask(row: TaskProgress): Promise<void>;
  signOffTask(taskKey: string, subjectId: string): Promise<void>;
  upsertTraining(rec: TrainingRecord): Promise<void>;
  addPd(entry: Omit<PdRecord, "id" | "verified">): Promise<PdRecord>;
  verifyPd(id: string): Promise<void>;
  /** Course certificates only. Onboarding certificates are issued by a manager
   *  through the admin queue - see migration 0008 for why. */
  issueCourseCertificate(courseKey: string, title: string, competency: string): Promise<Certificate | null>;
  /** Manager-issued: onboarding certificates and offline awards. */
  issueOnboardingCertificate(userId: string, title: string, competency: string): Promise<Certificate | null>;
  requestTimeOff(req: Omit<TimeOffRequest, "id" | "status" | "days">, days: number): Promise<TimeOffRequest>;
  decideTimeOff(id: string, decision: TimeOffRequest["status"]): Promise<void>;
  audit(action: string, detail: string): Promise<void>;
}

/** A write that failed. Surfaced, never swallowed: the old code awaited every
 *  Supabase call and discarded the result, so a rejected write looked exactly
 *  like a successful one on screen. */
export class HubWriteError extends Error {
  constructor(readonly operation: string, cause: unknown) {
    super(`Could not save (${operation}): ${describe(cause)}`);
    this.name = "HubWriteError";
  }
}

function describe(cause: unknown): string {
  if (typeof cause === "object" && cause && "message" in cause) return String((cause as { message: unknown }).message);
  return String(cause);
}

/* ---- preview backend: localStorage, unchanged behaviour --------------------- */

const KEY = "summit-hub-store";

function emptySnapshot(session: Session): HubSnapshot {
  return {
    profile: {
      id: session.userId,
      name: session.fullName ?? "Sherpa Doe",
      employeeNumber: "EMP-0001",
      jobTitle: "Behaviour Clinician",
      location: "Main Clinic",
      role: session.role,
      startDate: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
      vscStatus: "APPLIED",
    },
    progress: [], training: [], pd: [], certificates: [], timeOff: [], audit: [],
  };
}

export function previewBackend(session: Session): HubBackend {
  let snap: HubSnapshot = emptySnapshot(session);

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* storage unavailable */ }
  };
  const note = (action: string, detail: string) => {
    snap.audit.unshift({
      id: `au-${Date.now().toString(36)}-${snap.audit.length}`,
      action, detail, at: new Date().toISOString(), who: snap.profile.name,
    });
    snap.audit = snap.audit.slice(0, 100);
    persist();
  };

  return {
    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) snap = { ...emptySnapshot(session), ...(JSON.parse(raw) as HubSnapshot) };
      } catch { /* corrupt store - start clean */ }
      // Role always follows the session, never the persisted blob: the preview
      // switcher is the only thing that sets it.
      snap.profile = { ...snap.profile, id: session.userId, role: session.role };
      return snap;
    },
    async saveProfile(_patch, next) { snap.profile = next; persist(); },
    async upsertTask(row) {
      const i = snap.progress.findIndex((p) => p.taskKey === row.taskKey);
      if (i >= 0) snap.progress[i] = row; else snap.progress.push(row);
      persist();
    },
    async signOffTask() { persist(); },
    async upsertTraining(rec) {
      const i = snap.training.findIndex((t) => t.courseKey === rec.courseKey);
      if (i >= 0) snap.training[i] = rec; else snap.training.push(rec);
      persist();
    },
    async addPd(entry) {
      const row: PdRecord = { ...entry, id: `pd-${Date.now().toString(36)}`, verified: false };
      snap.pd.unshift(row); persist(); return row;
    },
    async verifyPd(id) {
      const r = snap.pd.find((x) => x.id === id);
      if (r) { r.verified = true; persist(); }
    },
    async issueCourseCertificate(_courseKey, title, competency) {
      const existing = snap.certificates.find((c) => c.title === title);
      if (existing) return existing;
      const seq = snap.certificates.length + 1;
      const cert: Certificate = {
        id: `cert-${Date.now().toString(36)}-${seq}`,
        certNumber: `SUMMIT-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`,
        title, competency, instructor: "",
        issuedDate: new Date().toISOString().slice(0, 10),
        expiryDate: null, source: "SUMMIT_ISSUED", verified: true, issuer: null,
      };
      snap.certificates.unshift(cert); persist();
      note("certificate.issued", `${cert.title} · ${cert.certNumber}`);
      return cert;
    },
    async issueOnboardingCertificate(_userId, title, competency) {
      return this.issueCourseCertificate("", title, competency);
    },
    async requestTimeOff(req, days) {
      const row: TimeOffRequest = { ...req, id: `to-${Date.now().toString(36)}`, days, status: "REQUESTED" };
      snap.timeOff.unshift(row); persist(); return row;
    },
    async decideTimeOff(id, decision) {
      const r = snap.timeOff.find((x) => x.id === id);
      if (r) { r.status = decision; persist(); }
    },
    async audit(action, detail) { note(action, detail); },
  };
}

/* ---- Supabase backend ------------------------------------------------------ */

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/** Throw on a failed write instead of returning as if it worked. */
function ok(operation: string, res: { error: unknown }): void {
  if (res.error) throw new HubWriteError(operation, res.error);
}

export function supabaseBackend(session: Session): HubBackend {
  const uid = session.userId;
  const clinic = session.clinicId;

  // clinic_id on every insert. Without it auth_clinic_id() has nothing to match
  // and the row is invisible to every supervisor and admin - the "portal loads
  // but every screen is empty" failure, written from the other side.
  const scoped = <T extends object>(row: T) => ({ ...row, user_id: uid, clinic_id: clinic });

  return {
    async load(): Promise<HubSnapshot> {
      const db = sb();
      const [prof, prog, train, pd, certs, timeOff, audit] = await Promise.all([
        db.from("hub_employee_profiles").select("*").eq("user_id", uid).maybeSingle(),
        db.from("hub_task_progress").select("*").eq("user_id", uid),
        db.from("hub_employee_training").select("*").eq("user_id", uid),
        db.from("hub_pd_records").select("*").eq("user_id", uid).order("date", { ascending: false }),
        db.from("hub_certificates").select("*").eq("user_id", uid).order("issued_date", { ascending: false }),
        db.from("hub_time_off_requests").select("*").eq("user_id", uid).order("start_date", { ascending: false }),
        db.from("hub_audit_events").select("*").eq("subject", uid).order("at", { ascending: false }).limit(100),
      ]);

      const p = prof.data;
      return {
        profile: {
          id: uid,
          name: session.fullName ?? "",
          employeeNumber: (p?.employee_number as string) ?? "",
          jobTitle: (p?.job_title as string | null) ?? null,
          location: (p?.location as string | null) ?? null,
          role: session.role,
          startDate: (p?.start_date as string | null) ?? null,
          vscStatus: (p?.vsc_status as EmployeeProfile["vscStatus"]) ?? "NOT_SUBMITTED",
        },
        progress: (prog.data ?? []).map((r) => ({
          taskKey: r.task_key as string,
          status: r.status as TaskStatus,
          notes: (r.notes as string) ?? "",
          applicable: (r.applicable as boolean) ?? true,
          completedAt: (r.signed_off_at as string | null) ?? null,
        })),
        training: (train.data ?? []).map((r) => ({
          courseKey: r.course_key as string,
          status: r.status as TrainingRecord["status"],
          completedAt: (r.completed_at as string | null) ?? null,
        })),
        pd: (pd.data ?? []).map((r) => ({
          id: r.id as string, title: r.title as string, provider: (r.provider as string) ?? "",
          hours: Number(r.hours), date: r.date as string, verified: Boolean(r.verified),
          category: r.category as PdRecord["category"],
          ceuUnits: r.ceu_units == null ? null : Number(r.ceu_units),
          fileName: (r.file_name as string | null) ?? null,
          detection: (r.detection as string) ?? "",
        })),
        certificates: (certs.data ?? []).map((r) => ({
          id: r.id as string, certNumber: (r.cert_number as string | null) ?? "",
          title: r.title as string, competency: (r.competency as string) ?? "",
          instructor: (r.instructor as string) ?? "",
          issuedDate: r.issued_date as string,
          expiryDate: (r.expiry_date as string | null) ?? null,
          source: r.source as Certificate["source"],
          verified: Boolean(r.verified),
          issuer: (r.issuer as string | null) ?? null,
        })),
        timeOff: (timeOff.data ?? []).map((r) => ({
          id: r.id as string, type: r.type as TimeOffRequest["type"],
          startDate: r.start_date as string, endDate: r.end_date as string,
          days: Number(r.days), status: r.status as TimeOffRequest["status"],
          note: (r.note as string) ?? "",
        })),
        audit: (audit.data ?? []).map((r) => ({
          id: String(r.id), action: r.action as string,
          // detail is jsonb; surface the note if there is one, else the object
          detail: typeof r.detail === "string"
            ? r.detail
            : (r.detail as { note?: string } | null)?.note ?? JSON.stringify(r.detail ?? {}),
          at: r.at as string,
          // The actor is a uuid. Resolve the caller's own name here; other
          // actors resolve through the HR directory, which the admin screen has.
          who: r.actor === uid ? session.fullName ?? "You" : "",
        })),
      };
    },

    async saveProfile(_patch, next) {
      ok("profile", await sb().from("hub_employee_profiles").upsert(scoped({
        employee_number: next.employeeNumber, job_title: next.jobTitle,
        location: next.location, start_date: next.startDate, vsc_status: next.vscStatus,
        updated_at: new Date().toISOString(),
      }), { onConflict: "user_id" }));
    },

    async upsertTask(row) {
      ok("onboarding task", await sb().from("hub_task_progress").upsert(scoped({
        task_key: row.taskKey, status: row.status, notes: row.notes,
        applicable: row.applicable, updated_at: new Date().toISOString(),
      }), { onConflict: "user_id,task_key" }));
    },

    async signOffTask(taskKey, subjectId) {
      // Scoped to the SUBJECT, not the caller. The old query filtered on
      // task_key alone, which under a supervisor's policy would have signed off
      // that task for everyone on their team at once.
      ok("sign-off", await sb().from("hub_task_progress")
        .update({ status: "COMPLETED", signed_off_by: uid, signed_off_at: new Date().toISOString() })
        .eq("task_key", taskKey).eq("user_id", subjectId));
    },

    async upsertTraining(rec) {
      ok("training", await sb().from("hub_employee_training").upsert(scoped({
        course_key: rec.courseKey, status: rec.status, completed_at: rec.completedAt,
      }), { onConflict: "user_id,course_key" }));
    },

    async addPd(entry) {
      const res = await sb().from("hub_pd_records").insert(scoped({
        title: entry.title, provider: entry.provider, hours: entry.hours, date: entry.date,
        category: entry.category, ceu_units: entry.ceuUnits,
        file_name: entry.fileName, detection: entry.detection,
      })).select().single();
      ok("professional development record", res);
      return { ...entry, id: res.data!.id as string, verified: false };
    },

    async verifyPd(id) {
      ok("PD verification", await sb().from("hub_pd_records")
        .update({ verified: true, verified_by: uid }).eq("id", id));
    },

    async issueCourseCertificate(courseKey, title, competency) {
      // Registry numbers are allocated in the database (migration 0008); the
      // client cannot mint one and does not try.
      const { data, error } = await sb().rpc("hub_issue_course_certificate", {
        p_course_key: courseKey, p_title: title, p_competency: competency,
      });
      if (error) throw new HubWriteError("certificate issuance", error);
      if (!data) return null;
      const row = await sb().from("hub_certificates").select("*").eq("id", data).single();
      if (row.error || !row.data) return null;
      const r = row.data;
      return {
        id: r.id as string, certNumber: (r.cert_number as string | null) ?? "",
        title: r.title as string, competency: (r.competency as string) ?? "",
        instructor: (r.instructor as string) ?? "",
        issuedDate: r.issued_date as string,
        expiryDate: (r.expiry_date as string | null) ?? null,
        source: r.source as Certificate["source"], verified: Boolean(r.verified),
        issuer: (r.issuer as string | null) ?? null,
      };
    },

    async issueOnboardingCertificate(userId, title, competency) {
      const { data, error } = await sb().rpc("hub_issue_certificate", {
        p_user: userId, p_title: title, p_competency: competency,
      });
      if (error) throw new HubWriteError("certificate issuance", error);
      if (!data) return null;
      const row = await sb().from("hub_certificates").select("*").eq("id", data).single();
      if (row.error || !row.data) return null;
      const r = row.data;
      return {
        id: r.id as string, certNumber: (r.cert_number as string | null) ?? "",
        title: r.title as string, competency: (r.competency as string) ?? "",
        instructor: (r.instructor as string) ?? "",
        issuedDate: r.issued_date as string,
        expiryDate: (r.expiry_date as string | null) ?? null,
        source: r.source as Certificate["source"], verified: Boolean(r.verified),
        issuer: (r.issuer as string | null) ?? null,
      };
    },
    async requestTimeOff(req, days) {
      const res = await sb().from("hub_time_off_requests").insert(scoped({
        type: req.type, start_date: req.startDate, end_date: req.endDate,
        days, note: req.note,
      })).select().single();
      ok("time-off request", res);
      return { ...req, id: res.data!.id as string, days, status: "REQUESTED" };
    },

    async decideTimeOff(id, decision) {
      ok("time-off decision", await sb().from("hub_time_off_requests")
        .update({ status: decision, decided_by: uid, decided_at: new Date().toISOString() })
        .eq("id", id));
    },

    async audit(action, detail) {
      // Audit is best-effort: losing an audit row must not lose the action that
      // produced it. It is still reported, just not thrown.
      const res = await sb().from("hub_audit_events").insert({
        clinic_id: clinic, actor: uid, subject: uid, action, detail: { note: detail },
      });
      if (res.error) console.warn("audit write failed", res.error);
    },
  };
}
