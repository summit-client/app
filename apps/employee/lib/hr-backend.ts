"use client";

/**
 * Where My HR data lives. Same two-implementations-of-one-interface shape as
 * lib/hub-backend.ts, and for the same reason.
 *
 * hr-store.ts previously claimed in its own header to use "Supabase tables
 * (migration 0007) in live mode" and contained no Supabase code at all - the
 * whole module was localStorage, unconditionally, while 0007 created 16 tables
 * nothing read or wrote.
 *
 * The snapshot keeps DISPLAY NAMES on recognition and peer feedback rather than
 * uuids, so the pure logic in ecosystem.ts (checkRecognition, reciprocalFlag,
 * computeEcosystem) keeps working untouched and stays unit-testable. Mapping
 * name <-> uuid happens here, against the directory, and nowhere else.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "./session";
import type { CreditAllocation, EmployeeCredential, PdActivity } from "./credentials";
import type { MetricResponse, Recognition } from "./ecosystem";
import type { ForumPost, Goal, HrAudit, PolicyAck, PolicyDoc, StaffMember } from "./hr-types";

/** A real person with a real account. Replaces the free-text staff list: the
 *  old admin form pushed a typed name into localStorage and marked it
 *  "INVITED", which invited nobody and created no account. */
export interface Person {
  id: string;
  name: string;
  jobTitle: string | null;
  accessLevel: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
  supervisorId: string | null;
}

export interface HrSnapshot {
  cycle: string;
  directory: Person[];
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
  /** Org configuration, not a 0007 table. Clinic scoreboard sites belong in
   *  @summit/settings; they stay local until moved there. */
  sites: { site: string; domains: Record<string, number> }[];
  peerScores: number[];
  /** Legacy free-text list, preview only. Live mode uses `directory`. */
  team: StaffMember[];
}

export interface HrBackend {
  load(): Promise<HrSnapshot>;
  addGoal(g: Goal): Promise<Goal>;
  setGoalStatus(id: string, status: Goal["status"]): Promise<void>;
  sendRecognition(toPersonId: string, r: Omit<Recognition, "id">): Promise<Recognition>;
  openPolicy(policyId: string, version: string): Promise<PolicyAck>;
  acknowledgePolicy(policyId: string, version: string): Promise<void>;
  addActivity(a: PdActivity, allocations: CreditAllocation[]): Promise<PdActivity>;
  rate(r: MetricResponse): Promise<void>;
  submitPeerFeedback(subjectPersonId: string, rows: MetricResponse[]): Promise<void>;
  addForumPost(p: ForumPost): Promise<ForumPost>;
  addForumComment(postId: string, body: string, author: string): Promise<void>;
  audit(a: HrAudit): Promise<void>;
  /** Local-only concerns that have no table yet. */
  saveLocal(snap: HrSnapshot): void;
}

export class HrWriteError extends Error {
  constructor(readonly operation: string, cause: unknown) {
    super(`Could not save (${operation}): ${describe(cause)}`);
    this.name = "HrWriteError";
  }
}
function describe(c: unknown): string {
  if (typeof c === "object" && c && "message" in c) return String((c as { message: unknown }).message);
  return String(c);
}
function ok(op: string, res: { error: unknown }): void {
  if (res.error) throw new HrWriteError(op, res.error);
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

export function thisCycle(): string {
  return new Date().toISOString().slice(0, 7);
}

/* ---- preview backend -------------------------------------------------------- */

const KEY = "summit-hr-store";

export function emptySnapshot(session: Session, seedPolicies: PolicyDoc[]): HrSnapshot {
  return {
    cycle: thisCycle(),
    directory: [{
      id: session.userId, name: session.fullName ?? "Sherpa Doe",
      jobTitle: "Behaviour Clinician", accessLevel: session.role, supervisorId: null,
    }],
    responses: [], history: [], recognition: [], goals: [],
    credentials: [], activities: [], allocations: [],
    policies: seedPolicies, acks: [], posts: [], audit: [],
    sites: [], peerScores: [], team: [],
  };
}

export function previewBackend(session: Session, seedPolicies: PolicyDoc[]): HrBackend {
  let snap = emptySnapshot(session, seedPolicies);
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* unavailable */ }
  };
  return {
    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) snap = { ...emptySnapshot(session, seedPolicies), ...(JSON.parse(raw) as HrSnapshot) };
      } catch { /* corrupt - start clean */ }
      snap.cycle = thisCycle();
      return snap;
    },
    async addGoal(g) { snap.goals.unshift(g); persist(); return g; },
    async setGoalStatus(id, status) {
      const g = snap.goals.find((x) => x.id === id);
      if (g) { g.status = status; persist(); }
    },
    async sendRecognition(_to, r) {
      const row = { ...r, id: `r-${Date.now().toString(36)}` };
      snap.recognition.unshift(row); persist(); return row;
    },
    async openPolicy(policyId, version) {
      let a = snap.acks.find((x) => x.policyId === policyId && x.version === version);
      if (!a) { a = { policyId, version, openedAt: new Date().toISOString(), acknowledgedAt: null }; snap.acks.push(a); }
      else if (!a.openedAt) a.openedAt = new Date().toISOString();
      persist(); return a;
    },
    async acknowledgePolicy(policyId, version) {
      const a = snap.acks.find((x) => x.policyId === policyId && x.version === version);
      if (a && !a.acknowledgedAt) { a.acknowledgedAt = new Date().toISOString(); persist(); }
    },
    async addActivity(a, allocations) {
      snap.activities.unshift(a);
      snap.allocations.push(...allocations);
      persist(); return a;
    },
    async rate(r) {
      const ex = snap.responses.find((x) => x.metricKey === r.metricKey && x.source === r.source && !x.subject);
      if (ex) Object.assign(ex, r); else snap.responses.push(r);
      persist();
    },
    async submitPeerFeedback(_subject, rows) { snap.responses.push(...rows); persist(); },
    async addForumPost(p) { snap.posts.unshift(p); persist(); return p; },
    async addForumComment(postId, body, author) {
      const post = snap.posts.find((x) => x.id === postId);
      if (post) { post.comments.push({ author, body, date: new Date().toISOString() }); persist(); }
    },
    async audit(a) { snap.audit.unshift(a); snap.audit = snap.audit.slice(0, 200); persist(); },
    saveLocal(s) { snap = s; persist(); },
  };
}

/* ---- Supabase backend ------------------------------------------------------- */

const ACCESS: Record<string, Person["accessLevel"]> = {
  admin: "ADMIN", supervisor: "SUPERVISOR", clinician: "EMPLOYEE",
};

export function supabaseBackend(session: Session, seedPolicies: PolicyDoc[]): HrBackend {
  const uid = session.userId;
  const clinic = session.clinicId;
  const scoped = <T extends object>(row: T) => ({ ...row, clinic_id: clinic });

  let nameById = new Map<string, string>();
  let idByName = new Map<string, string>();
  let cycleId: string | null = null;

  const resolveName = (id: string | null): string => (id ? nameById.get(id) ?? "Unknown" : "Unknown");

  /** The person's cycle row, created on demand - scorecard_responses needs it. */
  async function ensureCycle(): Promise<string> {
    if (cycleId) return cycleId;
    const db = sb();
    const cycle = thisCycle();
    const found = await db.from("scorecard_cycles").select("id").eq("user_id", uid).eq("cycle", cycle).maybeSingle();
    if (found.data?.id) { cycleId = found.data.id as string; return cycleId; }
    const made = await db.from("scorecard_cycles").insert(scoped({ user_id: uid, cycle })).select("id").single();
    ok("scorecard cycle", made);
    cycleId = made.data!.id as string;
    return cycleId;
  }

  return {
    async load(): Promise<HrSnapshot> {
      const db = sb();
      const [people, goals, creds, acts, allocs, pols, acks, posts, comments, recog, cycles, audit] =
        await Promise.all([
          db.from("profiles").select("id, full_name, role, supervisor_id").eq("clinic_id", clinic),
          db.from("development_goals").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
          db.from("employee_credentials").select("*").eq("user_id", uid),
          db.from("pd_activities").select("*").eq("user_id", uid).order("completion_date", { ascending: false }),
          db.from("pd_credit_allocations").select("*"),
          db.from("hr_policies").select("*").eq("clinic_id", clinic).order("effective_date", { ascending: false }),
          db.from("policy_acknowledgements").select("*").eq("user_id", uid),
          db.from("forum_posts").select("*").order("created_at", { ascending: false }).limit(100),
          db.from("forum_comments").select("*").order("created_at", { ascending: true }),
          db.from("recognitions").select("*").order("created_at", { ascending: false }).limit(300),
          db.from("scorecard_cycles").select("*").eq("user_id", uid).order("cycle", { ascending: true }),
          db.from("hr_audit_log").select("*").order("at", { ascending: false }).limit(200),
        ]);

      const directory: Person[] = (people.data ?? []).map((r) => ({
        id: r.id as string,
        name: (r.full_name as string | null) ?? "Unnamed",
        jobTitle: null,
        accessLevel: ACCESS[(r.role as string) ?? ""] ?? "EMPLOYEE",
        supervisorId: (r.supervisor_id as string | null) ?? null,
      }));
      nameById = new Map(directory.map((p) => [p.id, p.name]));
      idByName = new Map(directory.map((p) => [p.name, p.id]));

      const current = (cycles.data ?? []).find((c) => c.cycle === thisCycle());
      cycleId = (current?.id as string | undefined) ?? null;

      let responses: MetricResponse[] = [];
      if (cycleId) {
        const rows = await db.from("scorecard_responses").select("*").eq("cycle_id", cycleId);
        responses = (rows.data ?? []).map((r) => ({
          metricKey: r.metric_key as string,
          source: r.source as MetricResponse["source"],
          rating: r.rating as MetricResponse["rating"],
          comment: (r.comment as string) ?? "",
          rater: r.anonymous ? "anonymous" : resolveName(r.rater as string | null),
        }));
      }

      const commentsByPost = new Map<string, { author: string; body: string; date: string }[]>();
      for (const c of comments.data ?? []) {
        const list = commentsByPost.get(c.post_id as string) ?? [];
        list.push({ author: resolveName(c.author as string), body: c.body as string, date: c.created_at as string });
        commentsByPost.set(c.post_id as string, list);
      }

      const activityIds = new Set((acts.data ?? []).map((a) => a.id as string));

      return {
        cycle: thisCycle(),
        directory,
        responses,
        history: (cycles.data ?? [])
          .filter((c) => c.score != null)
          .map((c) => ({ cycle: c.cycle as string, score: Number(c.score) })),
        recognition: (recog.data ?? []).map((r) => ({
          id: r.id as string,
          from: resolveName(r.from_user as string),
          to: resolveName(r.to_user as string),
          category: r.category as string,
          points: Number(r.points),
          message: (r.message as string) ?? "",
          date: r.created_at as string,
          flagged: (r.flagged as string | null) ?? null,
        })),
        goals: (goals.data ?? []).map((g) => ({
          id: g.id as string, title: g.title as string, behaviour: (g.behaviour as string) ?? "",
          target: (g.target as string) ?? "", due: (g.due_date as string) ?? "",
          measurement: (g.measurement as string) ?? "", support: (g.support as string) ?? "",
          status: g.status as Goal["status"],
        })),
        credentials: (creds.data ?? []).map((c) => ({
          id: c.id as string, credential: c.credential as EmployeeCredential["credential"],
          number: (c.credential_number as string) ?? "",
          cycleStart: c.cycle_start as string, cycleEnd: c.cycle_end as string,
          status: c.status as EmployeeCredential["status"],
        })),
        activities: (acts.data ?? []).map((a) => ({
          id: a.id as string, title: a.title as string, provider: (a.provider as string) ?? "",
          instructor: (a.instructor as string) ?? "", completionDate: a.completion_date as string,
          durationHours: Number(a.duration_hours), format: (a.format as string) ?? "",
          categories: (a.categories as PdActivity["categories"]) ?? [],
          aceProvider: (a.ace_provider as string | null) ?? null,
          certificateFile: (a.certificate_file as string | null) ?? null,
          verification: a.ace_provider ? "VERIFIED" : "VERIFICATION_REQUIRED",
          notes: "",
        })),
        allocations: (allocs.data ?? [])
          .filter((x) => activityIds.has(x.activity_id as string))
          .map((x) => ({
            activityId: x.activity_id as string,
            credentialId: x.employee_credential_id as string,
            amount: Number(x.amount),
            byCategory: (x.by_category as CreditAllocation["byCategory"]) ?? {},
          })),
        // Seeded starter policies are shown only when the clinic has none of its
        // own yet; an administrator's rows always win.
        policies: (pols.data ?? []).length
          ? (pols.data ?? []).map((p) => ({
              id: p.id as string, name: p.name as string, version: p.version as string,
              effectiveDate: p.effective_date as string, owner: (p.owner as string) ?? "",
              url: (p.document_url as string | null) ?? null, content: null,
              required: Boolean(p.required),
            }))
          : seedPolicies,
        acks: (acks.data ?? []).map((a) => ({
          policyId: a.policy_id as string, version: a.version as string,
          openedAt: (a.opened_at as string | null) ?? null,
          acknowledgedAt: (a.acknowledged_at as string | null) ?? null,
        })),
        posts: (posts.data ?? []).map((p) => ({
          id: p.id as string, category: p.category as string, author: resolveName(p.author as string),
          title: p.title as string, body: p.body as string, date: p.created_at as string,
          comments: commentsByPost.get(p.id as string) ?? [],
        })),
        audit: (audit.data ?? []).map((a) => ({
          id: String(a.id), action: a.action as string,
          detail: typeof a.detail === "string" ? a.detail : JSON.stringify(a.detail ?? {}),
          who: resolveName(a.actor as string | null), at: a.at as string,
        })),
        sites: [],
        peerScores: (cycles.data ?? []).filter((c) => c.score != null).map((c) => Number(c.score)),
        team: [],
      };
    },

    async addGoal(g) {
      const res = await sb().from("development_goals").insert(scoped({
        user_id: uid, title: g.title, behaviour: g.behaviour, target: g.target,
        measurement: g.measurement, support: g.support, due_date: g.due || null, status: g.status,
      })).select("id").single();
      ok("development goal", res);
      return { ...g, id: res.data!.id as string };
    },

    async setGoalStatus(id, status) {
      ok("goal status", await sb().from("development_goals").update({ status }).eq("id", id));
    },

    async sendRecognition(toPersonId, r) {
      // from_user <> to_user is enforced by a check constraint in 0007 as well.
      const res = await sb().from("recognitions").insert(scoped({
        from_user: uid, to_user: toPersonId, category: r.category,
        points: r.points, message: r.message, flagged: r.flagged,
      })).select("id, created_at").single();
      ok("recognition", res);
      return { ...r, id: res.data!.id as string, date: res.data!.created_at as string };
    },

    async openPolicy(policyId, version) {
      const now = new Date().toISOString();
      // The latch in 0007 allows this update only while acknowledged_at is null.
      const res = await sb().from("policy_acknowledgements")
        .upsert(scoped({ policy_id: policyId, user_id: uid, version, opened_at: now }),
                { onConflict: "policy_id,user_id,version", ignoreDuplicates: true });
      ok("policy opened", res);
      return { policyId, version, openedAt: now, acknowledgedAt: null };
    },

    async acknowledgePolicy(policyId, version) {
      ok("policy acknowledgement", await sb().from("policy_acknowledgements")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("policy_id", policyId).eq("user_id", uid).eq("version", version));
    },

    async addActivity(a, allocations) {
      const res = await sb().from("pd_activities").insert(scoped({
        user_id: uid, title: a.title, provider: a.provider, instructor: a.instructor,
        completion_date: a.completionDate, duration_hours: a.durationHours, format: a.format,
        categories: a.categories, ace_provider: a.aceProvider, certificate_file: a.certificateFile,
      })).select("id").single();
      ok("professional development activity", res);
      const id = res.data!.id as string;
      if (allocations.length) {
        ok("credit allocation", await sb().from("pd_credit_allocations").insert(
          allocations.map((al) => scoped({
            activity_id: id, employee_credential_id: al.credentialId,
            amount: al.amount, by_category: al.byCategory,
          })),
        ));
      }
      return { ...a, id };
    },

    async rate(r) {
      const cid = await ensureCycle();
      // scorecard_responses is append-only by policy: a rating is evidence that
      // it was given. A changed rating is a new row; the newest wins on read.
      ok("rating", await sb().from("scorecard_responses").insert(scoped({
        cycle_id: cid, metric_key: r.metricKey, source: r.source,
        rating: r.rating, comment: r.comment, rater: uid, anonymous: false,
      })));
    },

    async submitPeerFeedback(subjectPersonId, rows) {
      const db = sb();
      const found = await db.from("scorecard_cycles").select("id")
        .eq("user_id", subjectPersonId).eq("cycle", thisCycle()).maybeSingle();
      let cid = found.data?.id as string | undefined;
      if (!cid) {
        const made = await db.from("scorecard_cycles")
          .insert(scoped({ user_id: subjectPersonId, cycle: thisCycle() })).select("id").single();
        ok("peer cycle", made);
        cid = made.data!.id as string;
      }
      ok("peer feedback", await db.from("scorecard_responses").insert(
        rows.map((r) => scoped({
          cycle_id: cid, metric_key: r.metricKey, source: "PEER",
          rating: r.rating, comment: r.comment, rater: uid, anonymous: true,
        })),
      ));
    },

    async addForumPost(p) {
      const res = await sb().from("forum_posts").insert(scoped({
        author: uid, category: p.category, title: p.title, body: p.body,
      })).select("id, created_at").single();
      ok("forum post", res);
      return { ...p, id: res.data!.id as string, date: res.data!.created_at as string };
    },

    async addForumComment(postId, body) {
      ok("comment", await sb().from("forum_comments").insert(scoped({
        post_id: postId, author: uid, body,
      })));
    },

    async audit(a) {
      const res = await sb().from("hr_audit_log").insert(scoped({
        actor: uid, subject: uid, action: a.action,
        detail: { note: a.detail, previous: a.previous, next: a.next },
      }));
      if (res.error) console.warn("hr audit write failed", res.error);
    },

    saveLocal() { /* live mode has no local-only state to keep */ },
  };
}
