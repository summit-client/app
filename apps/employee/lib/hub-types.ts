"use client";

/** Shared hub types. Split out of hub.ts so lib/hub-backend.ts can import them
 *  without a cycle (hub.ts imports the backends). */

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "AWAITING_SIGNOFF" | "NOT_APPLICABLE";
export type VscStatus = "NOT_SUBMITTED" | "APPLIED" | "PENDING" | "CLEARED" | "REQUIRES_FOLLOWUP";
export type { HubRole } from "./session";
import type { HubRole } from "./session";

export interface EmployeeProfile {
  id: string;
  name: string;
  employeeNumber: string;
  jobTitle: string | null;
  location: string | null;
  /** Display only. Every gate reads profiles.role through lib/session.ts. */
  role: HubRole;
  startDate: string | null;        // ISO; drives every deadline
  vscStatus: VscStatus;
}

export interface TaskProgress { taskKey: string; status: TaskStatus; notes: string; applicable: boolean; completedAt: string | null }
export interface TrainingRecord { courseKey: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; completedAt: string | null }

/** One other person's task awaiting a supervisor/admin's sign-off. Unlike
 *  TaskProgress this is never part of the caller's own loaded snapshot - it
 *  comes from a clinic/team-wide query, so it carries the subject's id. */
export interface PendingSignoff { userId: string; taskKey: string; notes: string }

/** One other person's onboarding certificate that is earned but not yet
 *  issued. Same shape family as PendingSignoff - clinic/team-wide, never part
 *  of the caller's own snapshot. */
export interface PendingCertificate { userId: string; title: string; competency: string }

/** One other person's time-off request awaiting a decision. Same TimeOffRequest
 *  fields, plus the subject's id, for the same reason as PendingSignoff. */
export interface PendingTimeOff extends TimeOffRequest { userId: string }

/** One other person's PD record awaiting verification. */
export interface PendingPd extends PdRecord { userId: string }

/** One row of the admin console's clinic-wide Team Directory: onboarding %
 *  and training-due are computed from that person's own progress/training,
 *  not the caller's - see lib/hub-cert-logic.ts. */
export interface TeamMember {
  userId: string;
  employeeNumber: string;
  jobTitle: string | null;
  location: string | null;
  vscStatus: VscStatus;
  startDate: string | null;
  onboardingPercent: number;
  trainingDue: number;
}

export interface PdRecord {
  id: string; title: string; provider: string; hours: number; date: string; verified: boolean;
  category: "BACB_CEU" | "CPBAO_CE" | "IBAO_CEU" | "GENERAL_PD";
  ceuUnits: number | null;
  fileName: string | null;      // uploaded certificate PDF
  detection: string;            // what the reader detected (or why it fell back)
}

export interface Certificate {
  id: string;
  /** Empty for a self-reported certificate with no number of its own. Summit
   *  registry numbers are allocated by the database (migration 0008). */
  certNumber: string;
  title: string;
  competency: string;
  instructor: string;
  issuedDate: string;
  expiryDate: string | null;
  /** SELF_REPORTED is an outside certificate the employee uploaded;
   *  SUMMIT_ISSUED is one this clinic awarded and renders on letterhead. */
  source: "SELF_REPORTED" | "SUMMIT_ISSUED";
  verified: boolean;
  issuer: string | null;
}

export interface TimeOffRequest { id: string; type: "VACATION" | "SICK"; startDate: string; endDate: string; days: number; status: "REQUESTED" | "APPROVED" | "DENIED" | "CANCELLED"; note: string }
export interface AuditEvent { id: string; action: string; detail: string; at: string; who: string }
