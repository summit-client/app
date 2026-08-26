"use client";

/**
 * My HR module store. Same preview seam as the rest of the hub: a
 * localStorage-backed store in preview, Supabase tables (migration 0007) in
 * live mode. Every mutation writes an audit entry.
 */

import type { CreditAllocation, EmployeeCredential, PdActivity } from "./credentials";
import type { MetricResponse, Recognition } from "./ecosystem";

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
  required: boolean;
}

export interface PolicyAck { policyId: string; version: string; openedAt: string | null; acknowledgedAt: string | null }

export interface ForumPost {
  id: string; category: string; author: string; title: string; body: string; date: string;
  comments: { author: string; body: string; date: string }[];
}

export interface HrAudit { id: string; action: string; detail: string; who: string; at: string; previous?: string; next?: string }

interface HrStore {
  cycle: string;                     // YYYY-MM
  responses: MetricResponse[];
  history: { cycle: string; score: number }[];
  recognition: Recognition[];
  goals: Goal[];
  credentials: EmployeeCredential[];
  activities: PdActivity[];
  allocations: CreditAllocation[];
  policies: PolicyDoc[];
  acks: PolicyAck[];
  posts: ForumPost[];
  audit: HrAudit[];
  team: { name: string; role: string; team: string }[];
  sites: { site: string; domains: Record<string, number> }[];
  peerScores: number[];        // anonymous peer scores for the private percentile band
}

const KEY = "summit-hr-store";

function thisCycle(): string {
  return new Date().toISOString().slice(0, 7);
}

function seed(): HrStore {
  const y = new Date().getFullYear();
  return {
    cycle: thisCycle(),
    responses: [],
    history: [],
    recognition: [],
    goals: [],
    credentials: [
      { id: "cred-bcba", credential: "BCBA", number: "1-24-00000", cycleStart: `${y - 1}-11-01`, cycleEnd: `${y + 1}-10-31`, status: "GOOD_STANDING" },
      { id: "cred-rba", credential: "ONT_RBA", number: "RBA-0000", cycleStart: `${y - 1}-11-01`, cycleEnd: `${y + 1}-10-31`, status: "GOOD_STANDING" },
      { id: "cred-iba", credential: "IBA_RECERT", number: "IBA-0000", cycleStart: `${y - 1}-11-01`, cycleEnd: `${y + 1}-10-31`, status: "GOOD_STANDING" },
    ],
    activities: [],
    allocations: [],
    policies: [
      { id: "pol-handbook", name: "Employee Handbook", version: "2026.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: "https://drive.google.com/file/d/1fmV5zENVnM6ffkTYJDWL0w-4BwdEzoqB/view", required: true },
      { id: "pol-disconnect", name: "Right to Disconnect Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, required: true },
      { id: "pol-ai", name: "AI Use Policy", version: "1.0", effectiveDate: `${y}-03-01`, owner: "Clinical Director", url: null, required: true },
      { id: "pol-privacy", name: "Privacy and Confidentiality Policy", version: "2.0", effectiveDate: `${y}-02-01`, owner: "Privacy Officer", url: null, required: true },
      { id: "pol-violence", name: "Workplace Violence and Harassment Policy", version: "1.2", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, required: true },
      { id: "pol-conduct", name: "Code of Conduct", version: "1.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, required: true },
      { id: "pol-boundaries", name: "Professional Boundaries Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "Clinical Director", url: null, required: true },
      { id: "pol-incident", name: "Incident Reporting Policy", version: "1.3", effectiveDate: `${y}-04-01`, owner: "Health & Safety", url: null, required: true },
    ],
    acks: [],
    posts: [],
    audit: [],
    team: [],                   // populated from the clinician's Summit team membership
    sites: [],                  // configured by the organization in Settings
    peerScores: [],
  };
}

let mem: HrStore | null = null;

export function hr(): HrStore {
  if (mem) return mem;
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? { ...seed(), ...(JSON.parse(raw) as HrStore) } : seed();
  } catch {
    mem = seed();
  }
  return mem;
}

export function saveHr(): void {
  if (mem) localStorage.setItem(KEY, JSON.stringify(mem));
}

export function hrAudit(action: string, detail: string, extra: { previous?: string; next?: string } = {}): void {
  const s = hr();
  s.audit.unshift({ id: `a-${Date.now().toString(36)}-${s.audit.length}`, action, detail, who: "You", at: new Date().toISOString(), ...extra });
  s.audit = s.audit.slice(0, 200);
  saveHr();
}

export function currentCycle(): string {
  return thisCycle();
}
