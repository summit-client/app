/**
 * @summit/clinical-ai — contract types for the Clinical Intelligence Engine.
 *
 * One engine, many workflows (progress reports, supervision briefs, case
 * review, treatment planning, decision trees, caseload queries). Every
 * workflow moves through the same stack (see ARCHITECTURE.md):
 *
 *   Atomic Data → Deterministic Analytics → Evidence Packet
 *   → Minimum Necessary Context → Approved Provider → Structured Output
 *   → Deterministic Validation → Clinician Review → Signed Documentation
 */

import type { Evidence } from "@summit/analytics";

/* ---- evidence typing (never merged, never converted) ----------------------- */

export type EvidenceType =
  | "objective_data"          // direct measurement
  | "derived_metric"          // calculated from observations
  | "clinician_observation"   // documented professional observation
  | "caregiver_report"        // third-party report
  | "ai_inference";           // algorithmically generated interpretation

export interface SourceRef {
  kind: "session_record" | "trial_batch" | "session_note" | "phase" | "treatment_modification"
      | "mastery_evaluation" | "behaviour_incident" | "integrity_check" | "clinical_decision"
      | "caregiver_goal" | "assessment" | "metric";
  id: string;
  label?: string;
}

/* ---- the canonical evidence packet ----------------------------------------- */

export interface GoalEvidence {
  goalId: string;
  programId: string;
  goalName: string;
  domain: string | null;

  baselinePct: number | null;
  currentMeanPct: number | null;
  trendSlopePerDay: number | null;
  variabilitySd: number | null;

  sessionsAnalyzed: number;
  opportunitiesAnalyzed: number;

  masteryStatus: "not_met" | "approaching" | "criterion_met" | "mastered" | "insufficient_data";
  masteryCriteria: string;
  masteryEvidence: Evidence;

  phases: { name: string; label: string | null; startedAt: string; endedAt: string | null }[];
  treatmentChanges: { date: string; kind: string; rationale: string; outcome: string | null; sourceId: string }[];

  soapThemes: StructuredNoteThemes | null;
  documentedBarriers: string[];
  caregiverReports: string[];             // verbatim-adjacent, always labelled caregiver_report

  treatmentIntegrityPct: number | null;
  notesAnalyzed: number;
  goalBankNextOptions: string[];          // approved "next" relations (organization Goal Bank)

  consistency: NoteDataConsistency;

  sourceReferences: SourceRef[];
}

export interface NoteDataConsistency {
  status: "CONSISTENT" | "POSSIBLE_DISCREPANCY" | "INSUFFICIENT_DATA"
        | "OBJECTIVE_PROGRESS_NOT_REFLECTED_IN_NOTES";
  detail: string;                          // deterministic explanation, never auto-resolved
}

export interface ClinicalEvidencePacket {
  packetId: string;
  packetHash: string;                      // stable hash for audit provenance
  client: { id: number; displayName: string };
  clinicId: string | null;
  reportingPeriod: { start: string; end: string };
  reportType: "progress_report" | "supervision_brief" | "case_review";

  serviceSummary: {
    sessionsHeld: number;
    sessionsAnalyzed: number;
    firstSessionDate: string | null;
    lastSessionDate: string | null;
  };

  goals: GoalEvidence[];

  behaviourSummary: {
    incidents: number;
    byFunction: Record<string, number>;
    sourceReferences: SourceRef[];
  };

  caregiverTraining: { goalsOpen: number; goalsAddressed: number; reports: string[] };

  clinicalEvents: { date: string; kind: string; description: string; sourceId: string }[];

  dataQualityFlags: string[];              // e.g. "Peer Initiation: 2 data points in 14 days"
  noteDataConsistencyFlags: string[];      // roll-up of per-goal discrepancies

  sources: SourceRef[];                    // everything retrieved, with IDs preserved
}

/* ---- note theme extraction --------------------------------------------------- */

export interface NoteEvidenceInput {
  clientDisplayName: string;               // minimum necessary; no identifiers beyond display label
  notes: { id: string; date: string; excerpts: string[] }[];
}

export interface ThemeWithSources { theme: string; sourceNoteIds: string[] }

export interface StructuredNoteThemes {
  documentedStrengths: ThemeWithSources[];
  documentedBarriers: ThemeWithSources[];
  environmentalChanges: ThemeWithSources[];
  caregiverReports: ThemeWithSources[];    // stays caregiver_report — never restated as measurement
  clinicianObservations: ThemeWithSources[];
  plannedChanges: ThemeWithSources[];
  repeatedThemes: ThemeWithSources[];
}

/* ---- generated report -------------------------------------------------------- */

export interface ReportBlock {
  blockId: string;
  section: string;                         // "Service Summary" | goal name | "Behaviour" | ...
  text: string;
  evidenceIds: string[];
  evidenceType: EvidenceType;
  confidence: "high" | "moderate" | "low";
  validation: { status: "verified" | "flagged"; unsupportedValues: string[] };
  reviewState: "pending" | "accepted" | "edited" | "flagged_for_review";
}

export interface GeneratedClinicalReport {
  reportId: string;
  packetId: string;
  blocks: ReportBlock[];
  modelNote: string;                       // provider + template version, for audit display
}

export interface ReportGenerationOptions {
  tone: "clinical" | "parent_friendly" | "funder_friendly";
  length: "standard" | "short";
  goalFilterIds?: string[];
}

/* ---- other engine workflows (same packet infrastructure) --------------------- */

export interface TreatmentPlanningEvidence { packet: ClinicalEvidencePacket; goalBankNextOptions: { goalId: string; options: string[] }[] }
export interface TreatmentPlanSuggestions { suggestions: { goalName: string; source: "goal_bank" | "pathway" | "ai_generated"; rationale: string; evidenceIds: string[] }[] }
export interface ClinicalDecisionEvidence { packet: ClinicalEvidencePacket; goalId: string; pattern: string; patternEvidence: Evidence }
export interface ClinicalDecisionTree { pattern: string; candidateCauses: { cause: string; confidencePct: number; rationale: string }[]; actions: { option: string; plan: string }[]; measurementPlan: string; escalation: string }
export interface ClinicalQuery { question: string }
export interface AuthorizedClinicalContext { packets: ClinicalEvidencePacket[] }
export interface ClinicalQueryResponse { filterId: string | null; explanation: string }

/* ---- provider contract -------------------------------------------------------- */

export interface ClinicalAIProvider {
  readonly name: string;
  readonly phiApproved: boolean;           // true only with BAA + retention controls in place

  extractNoteThemes(input: NoteEvidenceInput): Promise<StructuredNoteThemes>;
  draftProgressReport(evidence: ClinicalEvidencePacket, options: ReportGenerationOptions): Promise<GeneratedClinicalReport>;
  generateTreatmentPlanSuggestions(evidence: TreatmentPlanningEvidence): Promise<TreatmentPlanSuggestions>;
  generateDecisionTree(evidence: ClinicalDecisionEvidence): Promise<ClinicalDecisionTree>;
  answerClinicalQuery(query: ClinicalQuery, evidence: AuthorizedClinicalContext): Promise<ClinicalQueryResponse>;
}

/* ---- audit -------------------------------------------------------------------- */

export interface AIRequestAudit {
  clinicId: string | null;
  requestingUserId: string | null;
  clientId: number | null;
  feature: "note_themes" | "progress_report" | "treatment_planning" | "decision_tree" | "clinical_query" | "supervision_brief" | "case_review";
  provider: string;
  model: string;
  promptTemplateVersion: string;
  evidencePacketId: string;
  evidencePacketHash: string;
  outputId: string;
  accepted: boolean | null;
  clinicianModified: boolean | null;
  approvalStatus: "draft" | "reviewed" | "approved" | "signed" | null;
}

export class ClinicalAIUnavailableError extends Error {
  constructor(message = "AI assistance is temporarily unavailable. Your clinical data and calculated results remain available.") {
    super(message);
    this.name = "ClinicalAIUnavailableError";
  }
}
