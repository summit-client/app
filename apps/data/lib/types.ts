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

export interface TrialEvent {
  id: string;
  programId: string;
  mode: MeasurementMode;
  code: string;                 // Y|P|N · +|- · hit|miss · spont|prompted · yes|no|inc · start|stop
  stepPosition: number | null;
  promptLevel: PromptLevel | null;
  note: string | null;
  occurredAt: string;
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

export interface SessionNoteDraft {
  sessionId: number;
  summary: string;
  perProgram: { programName: string; narrative: string }[];
  abcNarrative: string;
  familyUpdate: string;
  planNext: string;
  billableCode: "97153" | "97155" | "97156";
  status: "draft" | "signed" | "awaiting_countersign" | "countersigned" | "returned";
}

export const FUNCTION_LABEL: Record<string, string> = {
  escape_avoidance: "Escape / avoidance",
  attention: "Attention",
  tangible: "Access to tangible",
  sensory_automatic: "Sensory / automatic",
  unclear: "Unclear — needs FBA",
};
