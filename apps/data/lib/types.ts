export type MeasurementMode =
  | "dtt" | "task_analysis" | "frequency" | "duration"
  | "interval" | "abc" | "net" | "yni";

export type PromptLevel = "physical" | "model" | "gestural" | "verbal" | "independent";

export const MODE_LABEL: Record<MeasurementMode, string> = {
  dtt: "DTT",
  task_analysis: "Task Analysis",
  frequency: "Frequency",
  duration: "Duration",
  interval: "Interval",
  abc: "ABC",
  net: "NET",
  yni: "Yes / No / Inc",
};

export const PROMPT_ORDER: PromptLevel[] = ["physical", "model", "gestural", "verbal", "independent"];

export interface ClientRow {
  id: number;
  name: string;
  age: number | null;
  funding: string | null;      // OAP-funded · private pay
  serviceType: string | null;  // Comprehensive ABA · Focused ABA
  status: string;              // active · intake · maintenance
  activeGoals: number;
  masteredGoals: number;
  nextSession: string | null;  // ISO date
  supervisor: string | null;   // supervising clinician display name
  lastSession: string | null;  // ISO date of most recent completed session
  interests: string[];         // preferred items/activities, used by session planning
}

export interface Program {
  id: string;
  clientId: number;
  name: string;
  domain: string | null;
  mode: MeasurementMode;
  operationalDefinition: string;
  masteryCriteria: string;
  masteryPct: number;
  masteryConsecutive: number;
  promptLevel: PromptLevel;
  reinforcementSchedule: string;
  sd: string | null;
  targetDirection: "increase" | "decrease";
  status: "draft" | "pending_signoff" | "active" | "on_hold" | "mastered" | "maintenance" | "archived";
  intervalSeconds: number;
  dailyTargetMinutes: number | null;
  steps: ProgramStep[];        // task_analysis / yni chains
  targets: string[];           // specific exemplars within the program (target-level graphing)
  last5: number[];             // most-recent-last session percentages
}

export interface ProgramStep {
  id: string;
  position: number;
  description: string;
  status: "teaching" | "independent" | "mastered";
}

export interface ScheduledSession {
  id: number;
  clientId: number;
  clientName: string;
  date: string;      // ISO
  time: string;      // "9:00 AM"
  type: string;      // Direct Therapy
  status: string;    // scheduled · completed
  location: string;
}

/**
 * The atomic observation. Every tap creates one of these immediately — it is
 * the source of truth; session metrics, graphs, mastery and Clinical Signals
 * are all derived from these rows and never stored without them.
 */
export interface TrialEvent {
  id: string;
  sessionId: number | null;      // the client-bound run session this belongs to
  clientId: number | null;
  programId: string;
  mode: MeasurementMode;
  code: string;                 // Y|P|N · +|- · hit|miss · spont|prompted · yes|no|inc · start|stop
  stepPosition: number | null;
  promptLevel: PromptLevel | null;
  target: string | null;         // exemplar within the program, when selected
  activityContext: string | null; // e.g. "Snack", "Structured teaching", "Play"
  note: string | null;
  occurredAt: string;
}

/* ---- client-bound run sessions -------------------------------------------- */

export type RunSessionStatus = "planning" | "active" | "documentation" | "completed" | "locked";

export interface SessionPlanDraft {
  priorityProgramIds: string[];   // ordered; pinned at the top of the Session Tab
  maintenanceProgramIds: string[];
  activities: { name: string; programIds: string[] }[];
  materials: string[];
  generalization: string[];
  behaviourNotes: string[];
  flow: string[];                 // approximate activity flow
  rationale: string;              // why the engine suggested this shape
}

/**
 * A session is created from — and permanently bound to — one client's record.
 * The clinician never re-selects the client after launch.
 */
export interface RunSession {
  id: number;
  clientId: number;
  clinicianId: string | null;
  status: RunSessionStatus;       // planning → active → documentation → completed → locked
  startTime: string | null;
  endTime: string | null;
  plannedDurationMin: number | null;
  actualDurationMin: number | null;
  location: string | null;
  serviceType: string | null;
  focus: string | null;
  plan: SessionPlanDraft | null;
  programVersionSnapshot: { programId: string; name: string; promptLevel: PromptLevel; masteryCriteria: string }[];
  createdAt: string;
}

/**
 * Derived per-program rollup written when a session ends. The raw TrialEvents
 * remain authoritative — this row is recomputable from them at any time.
 */
export interface SessionProgramSummary {
  sessionId: number;
  programId: string;
  rawObservationCount: number;
  numerator: number | null;
  denominator: number | null;
  calculatedValue: number | null; // % for trial-based modes, count for frequency, seconds for duration
  metricType: "percent_independent" | "count" | "rate_per_hour" | "total_seconds" | "percent_intervals" | "observations";
}

export interface AbcIncident {
  id: string;
  clientId: number;
  occurredAt: string;
  antecedent: string;
  behaviour: string;
  consequence: string;
  suspectedFunction:
    | "escape_avoidance" | "attention" | "tangible" | "sensory_automatic" | "unclear" | null;
}

/** SOAP note, drafted from the session's own atomic observations. */
export interface SessionNoteDraft {
  sessionId: number;
  clientId: number | null;
  subjective: string;            // clinician/caregiver context — never auto-filled from data
  objective: string;             // derived from atomic observations; numbers come from the engine
  assessment: string;
  plan: string;
  perProgram: { programName: string; narrative: string }[];
  abcNarrative: string;
  billableCode: "97153" | "97155" | "97156";
  status: "draft" | "signed" | "awaiting_countersign" | "countersigned" | "returned";
}

/**
 * One clinic-wide row in the supervisor Review Queue. Distinct from
 * SessionNoteDraft because the queue needs to identify the note (its real
 * `session_notes.id`, for the countersign/return write) and who wrote it —
 * neither of which the local draft the clinician was editing carries.
 */
export interface PendingCountersign {
  id: string;              // session_notes.id
  sessionId: number;       // client_sessions.id / session_notes.session_id
  clientId: number;
  clientName: string;
  clinicianId: string | null;
  clinicianName: string;
  createdAt: string;
  note: SessionNoteDraft;
}

export const FUNCTION_LABEL: Record<string, string> = {
  escape_avoidance: "Escape / avoidance",
  attention: "Attention",
  tangible: "Access to tangible",
  sensory_automatic: "Sensory / automatic",
  unclear: "Unclear — needs FBA",
};
