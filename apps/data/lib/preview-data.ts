import type { CaseloadSession, ClientRow, Program, ScheduledSession } from "./types";

/**
 * DEV PREVIEW fixtures — loaded when NEXT_PUBLIC_DEV_PREVIEW=1 so every screen
 * runs with no database. Shapes mirror the SQL schema exactly; names are the
 * Master Spec's demo personas (no real client data).
 */

export const previewClients: ClientRow[] = [
  { id: 101, name: "Arjun S.", age: 6, funding: "OAP-funded", serviceType: "Comprehensive ABA", status: "active", activeGoals: 4, masteredGoals: 7, nextSession: today(), supervisor: "Sherpa Doe", lastSession: daysAgo(3), interests: ["Trains", "Bubbles", "Sensory bin", "Tablet time"] },
  { id: 102, name: "Maya T.", age: 9, funding: "OAP-funded", serviceType: "Focused ABA", status: "active", activeGoals: 3, masteredGoals: 12, nextSession: today(), supervisor: "Sherpa Doe", lastSession: daysAgo(2), interests: ["Drawing", "Lego", "Music"] },
  { id: 103, name: "Leo K.", age: 5, funding: "Private pay", serviceType: "Comprehensive ABA", status: "intake", activeGoals: 1, masteredGoals: 0, nextSession: null, supervisor: "Sherpa Doe", lastSession: null, interests: ["Cars", "Playdough"] },
  { id: 104, name: "Sofia R.", age: 12, funding: "OAP-registered", serviceType: "Focused ABA", status: "maintenance", activeGoals: 2, masteredGoals: 19, nextSession: null, supervisor: "Sherpa Doe", lastSession: daysAgo(9), interests: ["Reading", "Board games"] },
];

export const previewSessions: ScheduledSession[] = [
  { id: 9001, clientId: 101, clientName: "Arjun S.", date: today(), time: "9:00 AM", type: "Direct Therapy", status: "scheduled", location: "Oshawa clinic" },
  { id: 9002, clientId: 102, clientName: "Maya T.", date: today(), time: "11:00 AM", type: "Direct Therapy", status: "scheduled", location: "Oshawa clinic" },
  { id: 9003, clientId: 101, clientName: "Arjun S.", date: today(), time: "2:00 PM", type: "Parent Coaching", status: "scheduled", location: "Virtual" },
];

export const previewPrograms: Program[] = [
  {
    id: "p-mand", clientId: 101, name: "Mand for break", domain: "Expressive communication",
    mode: "dtt", operationalDefinition: "When presented with a non-preferred task, Arjun says or signs 'break, please' without physical guidance.",
    masteryCriteria: "80% across 3 consecutive sessions, 2 settings, 2 people", masteryPct: 80, masteryConsecutive: 3,
    promptLevel: "gestural", reinforcementSchedule: "VR2", sd: "Non-preferred task presented",
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    steps: [], targets: ["Open container", "Missing item", "Difficult toy", "Assistance with task"], last5: [58, 64, 71, 78, 63],
  },
  {
    id: "p-handwash", clientId: 101, name: "Hand-washing", domain: "Self-help / daily living",
    mode: "task_analysis", operationalDefinition: "Completes each step of the 6-step hand-washing chain at the sink.",
    masteryCriteria: "Independent on all 6 steps across 3 consecutive sessions, 2 settings", masteryPct: 100, masteryConsecutive: 3,
    promptLevel: "model", reinforcementSchedule: "FR1", sd: "'Time to wash hands'",
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    steps: [
      { id: "s1", position: 1, description: "Turn on tap", status: "mastered" },
      { id: "s2", position: 2, description: "Wet hands", status: "mastered" },
      { id: "s3", position: 3, description: "Apply soap", status: "independent" },
      { id: "s4", position: 4, description: "Scrub 20 seconds", status: "independent" },
      { id: "s5", position: 5, description: "Rinse", status: "teaching" },
      { id: "s6", position: 6, description: "Dry with towel", status: "teaching" },
    ],
    targets: [],
    last5: [66, 74, 83, 83, 91],
  },
  {
    id: "p-vocal", clientId: 101, name: "Vocal protest (reduction)", domain: "Behaviour reduction",
    mode: "frequency", operationalDefinition: "Screaming above conversation level for 3+ seconds during a demand.",
    masteryCriteria: "At or below 1 per hour across 3 consecutive sessions", masteryPct: 80, masteryConsecutive: 3,
    promptLevel: "independent", reinforcementSchedule: "DRO 5 min", sd: null,
    targetDirection: "decrease", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    last5: [12, 9, 7, 5, 4], steps: [], targets: [],
  },
  {
    id: "p-ontask", clientId: 101, name: "On-task duration", domain: "Academic readiness",
    mode: "duration", operationalDefinition: "Remains seated and engaged with table-top task materials.",
    masteryCriteria: "10 minutes in one block across 3 consecutive sessions", masteryPct: 80, masteryConsecutive: 3,
    promptLevel: "verbal", reinforcementSchedule: "VR3", sd: null,
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: 10,
    last5: [45, 52, 60, 71, 68], steps: [], targets: [],
  },
  {
    id: "p-engage", clientId: 102, name: "Group engagement (interval)", domain: "Social engagement",
    mode: "interval", operationalDefinition: "Oriented toward the activity or peers during circle time (partial interval).",
    masteryCriteria: "80% of intervals across 3 consecutive sessions", masteryPct: 80, masteryConsecutive: 3,
    promptLevel: "gestural", reinforcementSchedule: "FR1", sd: null,
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    last5: [55, 63, 70, 74, 77], steps: [], targets: [],
  },
  {
    id: "p-spont", clientId: 102, name: "Spontaneous requesting (NET)", domain: "Expressive communication",
    mode: "net", operationalDefinition: "Initiates a request during play without a prompt within the natural context.",
    masteryCriteria: "70% spontaneous across 3 consecutive sessions", masteryPct: 70, masteryConsecutive: 3,
    promptLevel: "verbal", reinforcementSchedule: "Natural", sd: null,
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    last5: [40, 48, 55, 61, 66], steps: [], targets: [],
  },
  {
    id: "p-abc", clientId: 102, name: "Transition behaviour (ABC)", domain: "Behaviour reduction",
    mode: "abc", operationalDefinition: "Drops to floor or leaves area when a transition is announced.",
    masteryCriteria: "Function identified; BSP drafted after 3 observations", masteryPct: 80, masteryConsecutive: 3,
    promptLevel: "independent", reinforcementSchedule: "Per BSP", sd: null,
    targetDirection: "decrease", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    last5: [], steps: [], targets: [],
  },
  {
    id: "p-shoes", clientId: 102, name: "Shoe tying (chain)", domain: "Self-help / daily living",
    mode: "yni", operationalDefinition: "Completes the current step of the shoe-tying chain when asked.",
    masteryCriteria: "3 consecutive Yes sessions auto-advance to the next step", masteryPct: 100, masteryConsecutive: 3,
    promptLevel: "model", reinforcementSchedule: "FR1", sd: "'Tie your shoe'",
    targetDirection: "increase", status: "active", intervalSeconds: 30, dailyTargetMinutes: null,
    steps: [
      { id: "t1", position: 1, description: "Cross laces", status: "mastered" },
      { id: "t2", position: 2, description: "Tuck and pull", status: "independent" },
      { id: "t3", position: 3, description: "Make first loop", status: "teaching" },
      { id: "t4", position: 4, description: "Wrap and pull through", status: "teaching" },
    ],
    targets: [],
    last5: [100, 100, 0, 100, 100],
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A wider fixture than `previewSessions` above (which the "Today" tile deck
 * intentionally keeps to one day's worth of rows) — the caseload calendar
 * needs a full week/month of sessions across more than one client to
 * demonstrate it's actually reading a caseload, not one client's schedule.
 * Spans last week through next month so every mode (week, month) has
 * something to show regardless of what day this is run on. Times are on the
 * grid; clientId/type reuse previewClients/previewSessions' own values so a
 * click-through to a client record (if ever added) resolves to a real
 * preview client.
 */
export const previewCaseloadSessions: CaseloadSession[] = [
  { id: 9001, clientId: 101, clientName: "Arjun S.", date: today(), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9002, clientId: 102, clientName: "Maya T.", date: today(), hour: 11, minute: 0, time: "11:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9003, clientId: 101, clientName: "Arjun S.", date: today(), hour: 14, minute: 0, time: "2:00 PM", type: "Parent Coaching", status: "scheduled" },
  { id: 9004, clientId: 103, clientName: "Leo K.", date: daysAgo(2), hour: 10, minute: 30, time: "10:30 AM", type: "Direct Therapy", status: "completed" },
  { id: 9005, clientId: 102, clientName: "Maya T.", date: daysAgo(1), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "completed" },
  { id: 9006, clientId: 104, clientName: "Sofia R.", date: daysAgo(1), hour: 13, minute: 0, time: "1:00 PM", type: "Caregiver Training", status: "no_show" },
  { id: 9007, clientId: 101, clientName: "Arjun S.", date: daysFromNow(1), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9008, clientId: 103, clientName: "Leo K.", date: daysFromNow(1), hour: 11, minute: 0, time: "11:00 AM", type: "Intake Assessment", status: "scheduled" },
  { id: 9009, clientId: 102, clientName: "Maya T.", date: daysFromNow(2), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9010, clientId: 104, clientName: "Sofia R.", date: daysFromNow(2), hour: 15, minute: 30, time: "3:30 PM", type: "Direct Therapy", status: "scheduled" },
  { id: 9011, clientId: 101, clientName: "Arjun S.", date: daysFromNow(3), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9012, clientId: 102, clientName: "Maya T.", date: daysFromNow(3), hour: 13, minute: 0, time: "1:00 PM", type: "Parent Coaching", status: "scheduled" },
  { id: 9013, clientId: 103, clientName: "Leo K.", date: daysFromNow(4), hour: 10, minute: 0, time: "10:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9014, clientId: 101, clientName: "Arjun S.", date: daysFromNow(4), hour: 14, minute: 30, time: "2:30 PM", type: "Direct Therapy", status: "scheduled" },
  { id: 9015, clientId: 104, clientName: "Sofia R.", date: daysFromNow(7), hour: 9, minute: 0, time: "9:00 AM", type: "Caregiver Training", status: "scheduled" },
  { id: 9016, clientId: 102, clientName: "Maya T.", date: daysFromNow(10), hour: 11, minute: 0, time: "11:00 AM", type: "Direct Therapy", status: "scheduled" },
  { id: 9017, clientId: 101, clientName: "Arjun S.", date: daysFromNow(14), hour: 9, minute: 0, time: "9:00 AM", type: "Direct Therapy", status: "scheduled" },
];
