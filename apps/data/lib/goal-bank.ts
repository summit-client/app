/**
 * The goal bank, and the generator that draws from it.
 *
 * Two ways to give a client a goal, which is the point of this module:
 *
 *   1. Find one in the bank. 578 entries with a code, a domain, a teaching
 *      procedure and a prompt-fading ladder.
 *   2. Write one from scratch. Migration 0057 contributes it back to the bank
 *      as a draft, so the bank grows with the work instead of only at import.
 *
 * Search is done here rather than in Postgres full-text, deliberately: the
 * catalogue is under a thousand rows, an ILIKE on one concatenated column
 * matches how clinicians actually search (a code fragment, a couple of words),
 * and a tsvector would rank "the" and "child" as signal across a corpus where
 * every row contains both.
 */
import { createBrowserClient } from "@supabase/ssr";

export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

export type PromptLevel = "physical" | "model" | "gestural" | "verbal" | "independent";

export type BankEntry = {
  id: string;
  code: string | null;
  name: string;
  domain: string;
  subDomain: string | null;
  operationalDefinition: string;
  masteryCriteria: string;
  measurementMode: string;
  promptLevel: PromptLevel | null;
  teachingProcedure: string | null;
  assessment: string | null;
  assessmentSource: "curriculum" | "internal" | "unknown";
  status: "draft" | "approved" | "retired";
  needsReview: boolean;
  reviewReason: string | null;
  stepCount: number;
};

export type BankStep = {
  id: string;
  stepNumber: number;
  description: string;
  promptLevel: PromptLevel | null;
};

/**
 * How a goal's provenance should read on screen.
 *
 * "Mount Etna internal goal bank" is not a citation and should not look like
 * one beside "Zones of Regulation (Kuypers)". The distinction is the whole
 * reason assessment_source exists.
 */
export function provenanceLabel(e: BankEntry): string {
  if (e.assessmentSource === "curriculum" && e.assessment) return e.assessment;
  if (e.assessmentSource === "internal") return "Written in-house";
  return "Source not recorded";
}

/** How a step's prompt level reads. "independent prompt" is a contradiction:
 *  independent is the absence of one. */
export function promptLabel(level: PromptLevel | null): string | null {
  if (!level) return null;
  return level === "independent" ? "independent" : `${level} prompt`;
}

/** Whether this entry can go on a client's program right now. */
export function assignable(e: BankEntry): boolean {
  return e.status === "approved";
}

export function whyNotAssignable(e: BankEntry): string | null {
  if (e.status === "approved") return null;
  if (e.status === "draft") {
    return "Draft — a supervisor has to approve it before it can go on a program.";
  }
  return "Retired — kept for the record, not for new programs.";
}

/**
 * Rank matches so a code or a name beats a mention buried in a definition.
 *
 * Without this, typing "break" puts every goal whose teaching procedure
 * mentions taking a break above the goal actually called "Requests a break".
 */
export function rankMatches(entries: BankEntry[], query: string): BankEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const score = (e: BankEntry) => {
    const code = (e.code ?? "").toLowerCase();
    const name = e.name.toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.includes(q)) return 3;
    if (e.domain.toLowerCase().includes(q)) return 4;
    return 5;
  };
  return [...entries].sort((a, b) => {
    const sa = score(a), sb = score(b);
    if (sa !== sb) return sa - sb;
    // Approved before draft: a clinician searching for something to use should
    // not lead with what they cannot use.
    if (assignable(a) !== assignable(b)) return assignable(a) ? -1 : 1;
    return (a.code ?? a.name).localeCompare(b.code ?? b.name);
  });
}

const PREVIEW_ENTRIES: BankEntry[] = [
  {
    id: "gb-1", code: "RC1.01", name: "The child turns toward a sound source",
    domain: "Receptive Communication", subDomain: null,
    operationalDefinition: "The child turns toward and looks toward a sound source within 2 seconds.",
    masteryCriteria: "80% across 3 consecutive sessions, 2 settings, 2 people",
    measurementMode: "dtt", promptLevel: "physical",
    teachingProcedure: "Adult makes a sound with a toy or own voice and the child turns toward it.",
    assessment: "Mount Etna internal goal bank", assessmentSource: "internal",
    status: "approved", needsReview: false, reviewReason: null, stepCount: 3,
  },
  {
    id: "gb-2", code: "EFZ1.02", name: "Identifies their zone",
    domain: "Emotional Regulation", subDomain: "Zones of Regulation",
    operationalDefinition: "Given a check-in, the child names the zone they are in within 10 seconds.",
    masteryCriteria: "80% across 3 consecutive sessions, 2 settings, 2 people",
    measurementMode: "dtt", promptLevel: "gestural",
    teachingProcedure: "Check in at predictable points in the session, not only at escalation.",
    assessment: "Zones of Regulation (Kuypers)", assessmentSource: "curriculum",
    status: "approved", needsReview: false, reviewReason: null, stepCount: 4,
  },
  {
    id: "gb-3", code: "DRAFT-BX01", name: "Requests a break using a taught response",
    domain: "Behaviour", subDomain: null,
    operationalDefinition: "Given a task the child has previously escaped, the child requests a break using their taught response.",
    masteryCriteria: "80% across 3 consecutive sessions, 2 settings, 2 people",
    measurementMode: "dtt", promptLevel: "physical",
    teachingProcedure: "Prompt the break response at the earliest sign of escalation.",
    assessment: "Mount Etna internal goal bank", assessmentSource: "internal",
    status: "draft", needsReview: true,
    reviewReason: "drafted to fill a thin domain during the 2026 goal bank import; not written or approved by a BCBA",
    stepCount: 5,
  },
];

function toEntry(r: Record<string, unknown>): BankEntry {
  return {
    id: r.id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    domain: r.domain as string,
    subDomain: (r.sub_domain as string | null) ?? null,
    operationalDefinition: r.operational_definition as string,
    masteryCriteria: r.default_mastery_criteria as string,
    measurementMode: r.default_measurement_mode as string,
    promptLevel: (r.default_prompt_level as PromptLevel | null) ?? null,
    teachingProcedure: (r.teaching_procedure as string | null) ?? null,
    assessment: (r.assessment as string | null) ?? null,
    assessmentSource: (r.assessment_source as BankEntry["assessmentSource"]) ?? "unknown",
    status: (r.status as BankEntry["status"]) ?? "approved",
    needsReview: Boolean(r.needs_clinical_review),
    reviewReason: (r.review_reason as string | null) ?? null,
    stepCount: Number(r.step_count ?? 0),
  };
}

export async function searchBank(query: string, domain?: string): Promise<BankEntry[]> {
  if (IS_PREVIEW) {
    const q = query.trim().toLowerCase();
    return rankMatches(
      PREVIEW_ENTRIES.filter((e) =>
        (!domain || e.domain === domain)
        && (!q || `${e.code} ${e.name} ${e.domain} ${e.operationalDefinition}`.toLowerCase().includes(q))),
      query);
  }
  let req = sb().from("goal_bank_catalogue").select("*").limit(200);
  if (domain) req = req.eq("domain", domain);
  // One concatenated column, so the search box is a single filter rather than
  // four ORs that each have to be kept in step with the others.
  if (query.trim()) req = req.ilike("search_text", `%${query.trim()}%`);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return rankMatches((data ?? []).map(toEntry), query);
}

export async function listDomains(): Promise<string[]> {
  if (IS_PREVIEW) return [...new Set(PREVIEW_ENTRIES.map((e) => e.domain))].sort();
  const { data, error } = await sb()
    .from("goal_bank_catalogue").select("domain").limit(2000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r: { domain: string }) => r.domain))].sort();
}

export async function getSteps(entryId: string): Promise<BankStep[]> {
  if (IS_PREVIEW) {
    return [
      { id: "s1", stepNumber: 1, description: "Full physical prompt.", promptLevel: "physical" },
      { id: "s2", stepNumber: 2, description: "Partial physical prompt.", promptLevel: "physical" },
      { id: "s3", stepNumber: 3, description: "Independently.", promptLevel: "independent" },
    ];
  }
  const { data, error } = await sb()
    .from("goal_bank_steps")
    .select("id, step_number, description, prompt_level")
    .eq("entry_id", entryId)
    .order("step_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    stepNumber: Number(r.step_number),
    description: r.description as string,
    promptLevel: (r.prompt_level as PromptLevel | null) ?? null,
  }));
}

/**
 * Put a bank goal on a client's program.
 *
 * The bank entry's values are copied rather than referenced, and that is
 * deliberate: a program is what this child is working on now. If it read
 * through to the bank, editing a bank entry would silently change the
 * definition of a goal a clinician has been taking data against for weeks, and
 * the data would no longer measure what it says it measures. `goal_bank_id`
 * records where it came from; nothing else is shared.
 */
export async function assignFromBank(
  entry: BankEntry, clientId: number, startStep?: number,
): Promise<void> {
  if (!assignable(entry)) {
    throw new Error(whyNotAssignable(entry) ?? "This goal cannot be assigned.");
  }
  if (IS_PREVIEW) return;
  const client = sb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await client
    .from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!profile?.clinic_id) throw new Error("Couldn't resolve your clinic.");

  const { error } = await client.from("programs").insert({
    clinic_id: profile.clinic_id,
    client_id: clientId,
    name: entry.name,
    domain: entry.domain,
    measurement_mode: entry.measurementMode,
    operational_definition: entry.operationalDefinition,
    mastery_criteria: entry.masteryCriteria,
    prompt_level: entry.promptLevel ?? "independent",
    goal_bank_id: entry.id,
    goal_bank_step: startStep ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
}

export type NewGoal = {
  name: string;
  domain: string;
  operationalDefinition: string;
  masteryCriteria: string;
  measurementMode: string;
  promptLevel: PromptLevel;
};

/**
 * Why this goal cannot be saved yet, per field.
 *
 * The same two checks the import applies to the bank, for the same reason: a
 * definition built on "understands" is not a behaviour anyone can count, and
 * one too short to act on cannot be run by a second therapist. Everything else
 * about GETACAB is a clinical judgement this cannot make.
 */
const VAGUE = /\b(understand|understands|know|knows|learn about|be aware|appreciate|enjoy)\b/i;

export function goalProblems(g: NewGoal): Record<string, string> {
  const p: Record<string, string> = {};
  if (!g.name.trim()) p.name = "Give the goal a short name.";
  if (!g.domain.trim()) p.domain = "Choose a domain.";
  const def = g.operationalDefinition.trim();
  if (!def) p.operationalDefinition = "Describe the behaviour.";
  else if (def.length < 25) {
    p.operationalDefinition =
      "Too short for another therapist to run. Say what the child does, and when.";
  } else if (VAGUE.test(def)) {
    p.operationalDefinition =
      "Describes a state rather than a behaviour. Replace “understands” or “knows” with what the child actually does.";
  }
  if (!g.masteryCriteria.trim()) p.masteryCriteria = "Say how you will know it is mastered.";
  return p;
}

export async function createGoal(g: NewGoal, clientId: number): Promise<void> {
  const problems = goalProblems(g);
  if (Object.keys(problems).length) throw new Error(Object.values(problems)[0]);
  if (IS_PREVIEW) return;
  const client = sb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await client
    .from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!profile?.clinic_id) throw new Error("Couldn't resolve your clinic.");

  // No goal_bank_id: that is what tells 0057's trigger this is a new goal, and
  // what makes it contribute a draft entry back to the bank.
  const { error } = await client.from("programs").insert({
    clinic_id: profile.clinic_id,
    client_id: clientId,
    name: g.name.trim(),
    domain: g.domain.trim(),
    measurement_mode: g.measurementMode,
    operational_definition: g.operationalDefinition.trim(),
    mastery_criteria: g.masteryCriteria.trim(),
    prompt_level: g.promptLevel,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
}
