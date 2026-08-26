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
  team: StaffMember[];
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
      { id: "pol-handbook", name: "Employee Handbook", version: "2026.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: "https://drive.google.com/file/d/1fmV5zENVnM6ffkTYJDWL0w-4BwdEzoqB/view", content: null, required: true },
      { id: "pol-disconnect", name: "Right to Disconnect Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Staff are not expected to read or respond to work communication outside scheduled hours, except during an on-call assignment. Sending a message after hours carries no expectation of a reply before the next scheduled shift. Urgent clinical matters follow the on-call procedure, never general chat.", required: true },
      { id: "pol-ai", name: "AI Use Policy", version: "1.0", effectiveDate: `${y}-03-01`, owner: "Clinical Director", url: null, content: "AI tools may support drafting, scheduling and analysis. A clinician reviews and approves anything AI-drafted before it enters a clinical record, and AI never makes a clinical or compensation decision. Client information goes only into organization-approved tools configured for that purpose.", required: true },
      { id: "pol-privacy", name: "Privacy and Confidentiality Policy", version: "2.0", effectiveDate: `${y}-02-01`, owner: "Privacy Officer", url: null, content: "Client information is collected, used and disclosed only for care, with consent, under PHIPA. Access follows the minimum necessary rule. Records stay inside approved systems; client details never appear in team chat, the forum, personal devices or personal email. Suspected privacy breaches are reported to the Privacy Officer the same day.", required: true },
      { id: "pol-violence", name: "Workplace Violence and Harassment Policy", version: "1.2", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Everyone is entitled to a workplace free of violence and harassment. Report incidents to your supervisor or the HR Lead; reports are investigated promptly and confidentially, and reprisal for reporting is itself a violation. Risk assessments and this policy are reviewed annually.", required: true },
      { id: "pol-conduct", name: "Code of Conduct", version: "1.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Treat clients, families and colleagues with respect. Arrive prepared, follow programming as written, document honestly, and raise concerns through your supervisor. Conflicts of interest are disclosed. Gifts beyond token value are declined.", required: true },
      { id: "pol-boundaries", name: "Professional Boundaries Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "Clinical Director", url: null, content: "Relationships with clients and families stay professional: no personal social media connections, no private arrangements outside service agreements, no exchange of personal contact information without approval. Concerns about boundaries, yours or a colleague's, go to your supervisor early.", required: true },
      { id: "pol-incident", name: "Incident Reporting Policy", version: "1.3", effectiveDate: `${y}-04-01`, owner: "Health & Safety", url: null, content: "Any incident involving injury, a behavioural emergency, a medication event, or property damage is documented before the end of the shift and reported to the supervisor on duty. Serious incidents are escalated to the clinical director the same day. Debriefs follow every significant incident.", required: true },
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
