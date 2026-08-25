/**
 * Shared prompt templates + JSON-output plumbing for real providers.
 * The model generates LANGUAGE from supplied evidence; it never calculates.
 */

import type {
  AuthorizedClinicalContext, ClinicalDecisionEvidence, ClinicalDecisionTree,
  ClinicalEvidencePacket, ClinicalQuery, ClinicalQueryResponse, GeneratedClinicalReport,
  NoteEvidenceInput, ReportGenerationOptions, StructuredNoteThemes,
  TreatmentPlanningEvidence, TreatmentPlanSuggestions,
} from "../types";
import { ClinicalAIUnavailableError } from "../types";

export const PROMPT_TEMPLATE_VERSION = "clinical-v1";

export const RULES = `You draft clinical language for behaviour services. Hard rules:
- Use ONLY the supplied evidence. Never invent facts, numbers, dates, names or events.
- All numbers in your output must appear verbatim in the evidence.
- Distinguish evidence types and never convert one into another: objective_data and derived_metric are measurements; clinician_observation is documented professional observation; caregiver_report is a third-party report and must be phrased as such ("The caregiver reported ..."); never state a caregiver report as a measured fact.
- No unsupported causal conclusions. Preserve uncertainty. Flag insufficient information explicitly.
- Objective clinical language; no praise inflation.
- Every clinically meaningful sentence cites the evidence ids it used.
Return ONLY valid JSON matching the requested schema. No markdown, no commentary.`;

export function reportPrompt(packet: ClinicalEvidencePacket, options: ReportGenerationOptions): string {
  return `${RULES}

TASK: Draft a ${options.tone.replace("_", "-")} ${options.length} progress report from this evidence packet. One block per section: "Service Summary", one per goal (section = goal name), "Behaviour", "Caregiver Involvement", and "Data Quality" if flags exist. Where consistency status is not CONSISTENT, state the discrepancy neutrally and recommend clinician review — do not resolve it.

SCHEMA: {"blocks":[{"section":string,"text":string,"evidenceIds":string[],"evidenceType":"objective_data"|"derived_metric"|"clinician_observation"|"caregiver_report"|"ai_inference","confidence":"high"|"moderate"|"low"}]}

EVIDENCE PACKET (the only permitted source):
${JSON.stringify(packet)}`;
}

export function themesPrompt(input: NoteEvidenceInput): string {
  return `${RULES}

TASK: Extract structured themes from these session-note excerpts. Every theme lists the source note ids it came from. Keep caregiver statements under caregiverReports only.

SCHEMA: {"documentedStrengths":[{"theme":string,"sourceNoteIds":string[]}],"documentedBarriers":[...],"environmentalChanges":[...],"caregiverReports":[...],"clinicianObservations":[...],"plannedChanges":[...],"repeatedThemes":[...]}

NOTES:
${JSON.stringify(input.notes)}`;
}

export function planningPrompt(ev: TreatmentPlanningEvidence): string {
  return `${RULES}

TASK: Suggest next treatment-planning steps. PRIORITY ORDER: (1) the client's existing programming, (2) the organization-approved Goal Bank options supplied, (3) approved pathways, (4) assessment relationships, (5) only then a general suggestion. Mark each suggestion's source honestly ("goal_bank" when it came from the supplied options). Consider documented history: do not re-suggest an approach whose treatmentChanges outcome shows it was discontinued.

SCHEMA: {"suggestions":[{"goalName":string,"source":"goal_bank"|"pathway"|"ai_generated","rationale":string,"evidenceIds":string[]}]}

EVIDENCE: ${JSON.stringify(ev)}`;
}

export function decisionTreePrompt(ev: ClinicalDecisionEvidence): string {
  return `${RULES}

TASK: Build a clinical decision tree for the detected pattern. Candidate causes get confidence percentages that must sum to <= 100. Actions are options for the clinician — the clinician decides. Include a measurement plan with a re-measure window and an escalation condition.

SCHEMA: {"pattern":string,"candidateCauses":[{"cause":string,"confidencePct":number,"rationale":string}],"actions":[{"option":string,"plan":string}],"measurementPlan":string,"escalation":string}

EVIDENCE: ${JSON.stringify(ev)}`;
}

export function queryPrompt(q: ClinicalQuery, ctx: AuthorizedClinicalContext): string {
  return `${RULES}

TASK: Map this natural-language caseload question to ONE of the deterministic filter ids if any fits: "plateau-high-integrity", "mastered-no-next", "sparse-data", "approaching-mastery", "notes-vs-data". If none fits, return filterId null and explain what deterministic data would be needed. Never answer with numbers yourself — the analytics engine computes results.

SCHEMA: {"filterId":string|null,"explanation":string}

QUESTION: ${JSON.stringify(q.question)}
AVAILABLE CONTEXT SUMMARY: ${JSON.stringify(ctx.packets.map((p) => ({ client: p.client.displayName, goals: p.goals.map((g) => g.goalName) })))}`;
}

/** Base class: providers implement chatJSON; workflows share everything else. */
export abstract class JsonChatProvider {
  abstract readonly name: string;
  abstract readonly phiApproved: boolean;
  abstract readonly model: string;
  protected abstract chatJSON(prompt: string): Promise<string>;

  protected async json<T>(prompt: string): Promise<T> {
    let raw: string;
    try {
      raw = await this.chatJSON(prompt);
    } catch {
      throw new ClinicalAIUnavailableError();
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new ClinicalAIUnavailableError("The AI response could not be parsed. Your data and calculated results remain available.");
    return JSON.parse(match[0]) as T;
  }

  async extractNoteThemes(input: NoteEvidenceInput): Promise<StructuredNoteThemes> {
    return this.json<StructuredNoteThemes>(themesPrompt(input));
  }

  async draftProgressReport(packet: ClinicalEvidencePacket, options: ReportGenerationOptions): Promise<GeneratedClinicalReport> {
    const out = await this.json<{ blocks: Omit<GeneratedClinicalReport["blocks"][number], "blockId" | "validation" | "reviewState">[] }>(
      reportPrompt(packet, options),
    );
    return {
      reportId: `rep-${Date.now().toString(36)}`,
      packetId: packet.packetId,
      modelNote: `${this.name} · ${this.model} · ${PROMPT_TEMPLATE_VERSION}`,
      blocks: (out.blocks ?? []).map((b, i) => ({
        ...b,
        blockId: `blk-${i}`,
        validation: { status: "verified", unsupportedValues: [] }, // overwritten by the validation pass
        reviewState: "pending",
      })),
    };
  }

  async generateTreatmentPlanSuggestions(ev: TreatmentPlanningEvidence): Promise<TreatmentPlanSuggestions> {
    return this.json<TreatmentPlanSuggestions>(planningPrompt(ev));
  }

  async generateDecisionTree(ev: ClinicalDecisionEvidence): Promise<ClinicalDecisionTree> {
    return this.json<ClinicalDecisionTree>(decisionTreePrompt(ev));
  }

  async answerClinicalQuery(q: ClinicalQuery, ctx: AuthorizedClinicalContext): Promise<ClinicalQueryResponse> {
    return this.json<ClinicalQueryResponse>(queryPrompt(q, ctx));
  }
}
