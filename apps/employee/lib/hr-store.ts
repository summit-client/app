"use client";

/**
 * My HR data layer.
 *
 * This module used to be a synchronous localStorage blob that screens mutated in
 * place - its own header claimed "Supabase tables (migration 0007) in live mode"
 * while containing no Supabase code at all. Migration 0007 created 16 tables
 * that nothing read or wrote.
 *
 * Now: lib/hr-backend.ts holds two implementations of one interface, hr() reads
 * a loaded snapshot, and every mutation is an explicit async function that goes
 * somewhere. Screens read synchronously, as before, because <HrGate> loads the
 * snapshot before they render.
 */

import type { CreditAllocation, EmployeeCredential, PdActivity } from "./credentials";
import type { MetricResponse, Recognition } from "./ecosystem";
import { IS_PREVIEW, type Session } from "./session";
import {
  previewBackend, supabaseBackend, thisCycle,
  type HrBackend, type HrSnapshot, type Person,
} from "./hr-backend";

export * from "./hr-types";
export type { HrSnapshot, Person } from "./hr-backend";
export { HrWriteError } from "./hr-backend";
import type { ForumPost, Goal, HrAudit, PolicyAck, PolicyDoc } from "./hr-types";

/** Starter policies, shown only until a clinic loads its own into hr_policies.
 *  Content, not configuration - an administrator's rows always win. */
export const STARTER_POLICIES: PolicyDoc[] = (() => {
  const y = new Date().getFullYear();
  return [
      { id: "pol-handbook", name: "Employee Handbook", version: "2026.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: "https://drive.google.com/file/d/1fmV5zENVnM6ffkTYJDWL0w-4BwdEzoqB/view", content: null, required: true },
      { id: "pol-disconnect", name: "Right to Disconnect Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Staff are not expected to read or respond to work communication outside scheduled hours, except during an on-call assignment. Sending a message after hours carries no expectation of a reply before the next scheduled shift. Urgent clinical matters follow the on-call procedure, never general chat.", required: true },
      { id: "pol-ai", name: "AI Use Policy", version: "1.0", effectiveDate: `${y}-03-01`, owner: "Clinical Director", url: null, content: "AI tools may support drafting, scheduling and analysis. A clinician reviews and approves anything AI-drafted before it enters a clinical record, and AI never makes a clinical or compensation decision. Client information goes only into organization-approved tools configured for that purpose.", required: true },
      { id: "pol-privacy", name: "Privacy and Confidentiality Policy", version: "2.0", effectiveDate: `${y}-02-01`, owner: "Privacy Officer", url: null, content: "Client information is collected, used and disclosed only for care, with consent, under PHIPA. Access follows the minimum necessary rule. Records stay inside approved systems; client details never appear in team chat, the forum, personal devices or personal email. Suspected privacy breaches are reported to the Privacy Officer the same day.", required: true },
      { id: "pol-violence", name: "Workplace Violence and Harassment Policy", version: "1.2", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Everyone is entitled to a workplace free of violence and harassment. Report incidents to your supervisor or the HR Lead; reports are investigated promptly and confidentially, and reprisal for reporting is itself a violation. Risk assessments and this policy are reviewed annually.", required: true },
      { id: "pol-conduct", name: "Code of Conduct", version: "1.1", effectiveDate: `${y}-01-15`, owner: "HR Lead", url: null, content: "Treat clients, families and colleagues with respect. Arrive prepared, follow programming as written, document honestly, and raise concerns through your supervisor. Conflicts of interest are disclosed. Gifts beyond token value are declined.", required: true },
      { id: "pol-boundaries", name: "Professional Boundaries Policy", version: "1.0", effectiveDate: `${y}-01-15`, owner: "Clinical Director", url: null, content: "Relationships with clients and families stay professional: no personal social media connections, no private arrangements outside service agreements, no exchange of personal contact information without approval. Concerns about boundaries, yours or a colleague's, go to your supervisor early.", required: true },
      { id: "pol-incident", name: "Incident Reporting Policy", version: "1.3", effectiveDate: `${y}-04-01`, owner: "Health & Safety", url: null, content: "Any incident involving injury, a behavioural emergency, a medication event, or property damage is documented before the end of the shift and reported to the supervisor on duty. Serious incidents are escalated to the clinical director the same day. Debriefs follow every significant incident.", required: true },
    ];
})();

let backend: HrBackend | null = null;
let snap: HrSnapshot | null = null;
const listeners = new Set<() => void>();

function be(): HrBackend {
  if (!backend) throw new Error("HR mutation before loadHr()");
  return backend;
}
function changed(): void { for (const l of listeners) l(); }

export function onHrChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function loadHr(session: Session): Promise<void> {
  backend = IS_PREVIEW
    ? previewBackend(session, STARTER_POLICIES)
    : supabaseBackend(session, STARTER_POLICIES);
  snap = await backend.load();
  changed();
}

export function isHrLoaded(): boolean { return snap !== null; }

/** The loaded snapshot. Read-only in spirit: mutate through the functions below,
 *  never by assigning into the arrays, or the change will not be persisted. */
export function hr(): HrSnapshot {
  if (!snap) throw new Error("hr() read before loadHr() - screen is not inside <HrGate>");
  return snap;
}

export function currentCycle(): string { return thisCycle(); }

/** Everyone in the clinic with an account. Empty in preview beyond yourself. */
export function directory(): Person[] { return hr().directory; }

export function personId(name: string): string | null {
  return hr().directory.find((p) => p.name === name)?.id ?? null;
}

export async function hrAudit(action: string, detail: string, extra: { previous?: string; next?: string } = {}): Promise<void> {
  const s = hr();
  const row: HrAudit = {
    id: `a-${Date.now().toString(36)}-${s.audit.length}`,
    action, detail, who: "You", at: new Date().toISOString(), ...extra,
  };
  s.audit.unshift(row);
  s.audit = s.audit.slice(0, 200);
  await be().audit(row);
}

/* ---- mutations -------------------------------------------------------------- */

export async function addGoal(draft: Omit<Goal, "id" | "status">): Promise<void> {
  const s = hr();
  const saved = await be().addGoal({ ...draft, id: `g-${Date.now().toString(36)}`, status: "OPEN" });
  s.goals.unshift(saved);
  await hrAudit("goal.created", saved.title);
  changed();
}

export async function setGoalStatus(id: string, status: Goal["status"]): Promise<void> {
  const s = hr();
  const g = s.goals.find((x) => x.id === id);
  if (!g) return;
  const prev = g.status;
  await be().setGoalStatus(id, status);
  g.status = status;
  await hrAudit("goal.status", `${g.title}: ${prev} to ${status}`, { previous: prev, next: status });
  changed();
}

export async function sendRecognition(draft: Omit<Recognition, "id" | "date">): Promise<void> {
  const s = hr();
  const toId = personId(draft.to);
  if (!toId) throw new Error(`${draft.to} does not have a Summit account yet.`);
  const saved = await be().sendRecognition(toId, { ...draft, date: new Date().toISOString() });
  s.recognition.unshift(saved);
  await hrAudit("recognition.sent", `${draft.points} ${draft.category} to ${draft.to}`);
  changed();
}

export async function openPolicy(policyId: string, version: string, name: string): Promise<void> {
  const s = hr();
  const saved = await be().openPolicy(policyId, version);
  if (!s.acks.some((a) => a.policyId === policyId && a.version === version)) s.acks.push(saved);
  await hrAudit("policy.opened", `${name} version ${version}`);
  changed();
}

export async function acknowledgePolicy(policyId: string, version: string, name: string): Promise<void> {
  const s = hr();
  await be().acknowledgePolicy(policyId, version);
  const a = s.acks.find((x) => x.policyId === policyId && x.version === version);
  if (a) a.acknowledgedAt = new Date().toISOString();
  await hrAudit("policy.acknowledged", `${name} version ${version}`, { next: version });
  changed();
}

export async function addActivity(a: PdActivity, allocations: CreditAllocation[]): Promise<void> {
  const s = hr();
  const saved = await be().addActivity(a, allocations);
  s.activities.unshift(saved);
  s.allocations.push(...allocations.map((x) => ({ ...x, activityId: saved.id })));
  await hrAudit("pd.activity_added",
    `${saved.title} (${saved.durationHours}h) allocated across ${allocations.length} credential(s)`);
  changed();
}

/**
 * Record or update one of the employee's credentials, including the
 * registration number the college or certifying body issued. The number is
 * what appears on reports and what an auditor checks, so it is stored on the
 * credential itself rather than typed into a note.
 */
export async function saveCredential(c: EmployeeCredential): Promise<void> {
  const s = hr();
  const saved = await be().saveCredential(c);
  const i = s.credentials.findIndex((x) => x.id === c.id);
  if (i >= 0) s.credentials[i] = saved;
  else s.credentials.push(saved);
  await hrAudit("credential.saved", `${saved.credential}${saved.number ? ` (${saved.number})` : ""}`);
  changed();
}

export async function removeCredential(id: string): Promise<void> {
  const s = hr();
  const c = s.credentials.find((x) => x.id === id);
  await be().removeCredential(id);
  s.credentials = s.credentials.filter((x) => x.id !== id);
  if (c) await hrAudit("credential.removed", `${c.credential}${c.number ? ` (${c.number})` : ""}`);
  changed();
}

export async function rate(metricKey: string, source: MetricResponse["source"], rating: MetricResponse["rating"], comment = ""): Promise<void> {
  const s = hr();
  const ex = s.responses.find((r) => r.metricKey === metricKey && r.source === source && !r.subject);
  const prev = ex?.rating;
  const row: MetricResponse = { metricKey, source, rating, comment: comment || ex?.comment || "" };
  await be().rate(row);
  if (ex) Object.assign(ex, row); else s.responses.push(row);
  await hrAudit("scorecard.rating", `${metricKey} = ${rating}`,
    { previous: prev ? String(prev) : undefined, next: String(rating) });
  changed();
}

export async function submitPeerFeedback(subjectName: string, rows: MetricResponse[]): Promise<void> {
  const s = hr();
  const subjectId = personId(subjectName);
  if (!subjectId) throw new Error(`${subjectName} does not have a Summit account yet.`);
  const stamped = rows.map((r) => ({ ...r, subject: subjectName, rater: "anonymous" }));
  await be().submitPeerFeedback(subjectId, stamped);
  s.responses.push(...stamped);
  await hrAudit("peer_feedback.submitted", `Feedback for ${subjectName}`);
  changed();
}

export async function addForumPost(draft: Omit<ForumPost, "id" | "date" | "comments">): Promise<void> {
  const s = hr();
  const saved = await be().addForumPost({
    ...draft, id: `p-${Date.now().toString(36)}`, date: new Date().toISOString(), comments: [],
  });
  s.posts.unshift(saved);
  await hrAudit("forum.posted", saved.title);
  changed();
}

export async function addForumComment(postId: string, body: string, author: string): Promise<void> {
  const s = hr();
  await be().addForumComment(postId, body, author);
  const post = s.posts.find((p) => p.id === postId);
  if (post) post.comments.push({ author, body, date: new Date().toISOString() });
  changed();
}

/** Clinic scoreboard sites are org configuration with no table in 0007. They
 *  stay local until they move into @summit/settings, and are marked as such on
 *  the screen so nobody assumes they are shared. */
export function saveLocal(): void {
  if (snap) be().saveLocal(snap);
  changed();
}
