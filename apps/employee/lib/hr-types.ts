"use client";

/** Shared My HR types, split out so lib/hr-backend.ts can import them without
 *  a cycle (hr-store.ts imports the backends). */

export interface Goal {
  id: string;
  title: string;
  behaviour: string;      // observable behaviour
  target: string;
  due: string;
  measurement: string;
  status: "OPEN" | "IN_PROGRESS" | "MET" | "CARRIED_FORWARD";
  support: string;
}

export interface PolicyDoc {
  id: string;
  name: string;
  version: string;
  effectiveDate: string;
  owner: string;
  url: string | null;
  content: string | null;   // inline starter text, previewable in place
  required: boolean;
}

export interface PolicyAck { policyId: string; version: string; openedAt: string | null; acknowledgedAt: string | null }

export interface ForumPost {
  id: string; category: string; author: string; title: string; body: string; date: string;
  comments: { author: string; body: string; date: string }[];
}

export interface HrAudit { id: string; action: string; detail: string; who: string; at: string; previous?: string; next?: string }

/** The staff registry. The peer group, recognition list and scoreboard all
 * read from this one list; the admin portal is its only writer. */
export interface StaffMember {
  name: string;
  role: string;                 // job title, e.g. Lead Clinician
  team: string;
  email?: string;
  employeeNumber?: string;
  site?: string;
  accessLevel?: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
  supervisor?: string;
  permissions?: string[];       // module keys the person may manage
  status?: "ACTIVE" | "INVITED" | "DISABLED";
}
