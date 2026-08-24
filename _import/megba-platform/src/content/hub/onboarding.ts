/**
 * Mount Etna Employee Hub, authoritative onboarding content (Beta 1).
 *
 * Derived directly from "Mount Etna New Team Member Onboarding Checklist, 2026".
 * External training URLs, week placement, sections, and the VSC rule come from
 * that document. Deadlines are taken from the checklist's own wording (Week 1 /
 * Week 2 / within 14 days / within 30 days), never guessed. Training hours are
 * intentionally left unset, employees log real time; admins can set hours.
 *
 * This module is the single source of truth for the seed (prisma/seed) and the
 * onboarding engine, so both stay in sync.
 */

export type HubDeadlineBucket =
  | "WEEK_1"
  | "WEEK_2"
  | "WITHIN_14_DAYS"
  | "WITHIN_30_DAYS"
  | "CUSTOM";

export type HubTaskCategory =
  | "HR_COMPLIANCE"
  | "SYSTEMS_TOOLS"
  | "ORIENTATION_POLICY"
  | "CLINICAL_LEARNING"
  | "PRACTICE_PREP"
  | "OBSERVATION"
  | "TEAM_PARTICIPATION"
  | "PRACTICE_FACILITATION"
  | "READINESS";

export type HubCourseKind = "COMPLIANCE" | "CLINICAL" | "SYSTEM";

export interface SeedLocation {
  name: string;
  order: number;
}

export interface SeedCourse {
  key: string;
  title: string;
  provider?: string;
  kind: HubCourseKind;
  category?: string;
  externalUrl?: string;
  deadlineBucket: HubDeadlineBucket;
  order: number;
  active?: boolean;
}

export interface SeedTask {
  key: string;
  week: 1 | 2;
  section: string;
  category: HubTaskCategory;
  title: string;
  description?: string;
  required?: boolean; // default true
  supervisorSignoffRequired?: boolean;
  evidenceRequired?: boolean;
  trainingUrl?: string; // for one-off links not modelled as a course
  courseKey?: string; // links to a SeedCourse when this is a training item
  deadlineBucket: HubDeadlineBucket;
  order: number;
}

/* ----------------------------- Configurable data ------------------------- */

/** Primary locations are configurable, not hard-coded in the UI. Edit in seed/admin. */
export const hubLocations: SeedLocation[] = [
  { name: "Main Clinic", order: 1 },
  { name: "Community / In-Home", order: 2 },
  { name: "Virtual", order: 3 },
];

/** Emails seeded with the ADMIN role. Everyone else is EMPLOYEE on first login. */
export const hubAdminEmails: string[] = ["office@mountetnachildservices.com"];

export const hubOnboardingTemplate = {
  name: "Mount Etna New Team Member Onboarding 2026",
  version: 1,
};

/* -------------------------------- Courses -------------------------------- */

const B_HR = "https://elearning.brighthr.com/ca";
const B_SAFE = "https://elearning.brightsafe.com/ca";
const TID = "?tid=2a856fee-a895-436b-89c6-96ade3116943";
const AIM = "https://autisminternetmodules.org/m";

export const hubCourses: SeedCourse[] = [
  // Mandatory compliance (checklist Week 1, due within 14 days)
  { key: "cc-aoda-accessibility", title: "Accessibility for Ontarians with Disability", provider: "BrightHR", kind: "COMPLIANCE", category: "AODA", externalUrl: `${B_HR}/aodaawareness/${TID}`, deadlineBucket: "WITHIN_14_DAYS", order: 1 },
  { key: "cc-working-together", title: "Working Together: the Code and the AODA", provider: "BrightHR", kind: "COMPLIANCE", category: "AODA", externalUrl: `${B_HR}/workingtogether-the-code-the-aoda/${TID}`, deadlineBucket: "WITHIN_14_DAYS", order: 2 },
  { key: "cc-ohsa", title: "Occupational Health & Safety Act", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/getting-to-know-the-ohsa-in-ontario/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 3 },
  { key: "cc-whmis", title: "WHMIS", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/whmis-v2/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 4 },
  { key: "cc-violence-harassment", title: "Workplace Violence and Harassment", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/workplace-violence-and-harassment/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 5 },
  { key: "cc-hs-four-steps", title: "Health & Safety Awareness in 4 Steps", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/worker-health-safety-awareness-four-steps/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 6 },
  { key: "cc-hazardous-substances", title: "Hazardous Substances", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/hazardoussubstances/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 7 },
  { key: "cc-wellbeing", title: "Wellbeing at Work", provider: "BrightSafe", kind: "COMPLIANCE", category: "Wellbeing", externalUrl: `${B_SAFE}/wellbeing-at-work/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 8 },

  // Additional mandatory compliance referenced for the first 30 days (URLs set by admin)
  { key: "cc-duty-to-report", title: "Duty to Report (child abuse and neglect)", kind: "COMPLIANCE", category: "Safeguarding", deadlineBucket: "WITHIN_30_DAYS", order: 20 },
  { key: "cc-mental-health", title: "Mental Health Awareness", kind: "COMPLIANCE", category: "Wellbeing", deadlineBucket: "WITHIN_30_DAYS", order: 21 },
  { key: "cc-ipac", title: "Infection Prevention and Control (IPAC)", kind: "COMPLIANCE", category: "Health & Safety", deadlineBucket: "WITHIN_30_DAYS", order: 22 },
  { key: "cc-privacy-phipa", title: "Privacy and Confidentiality (PHIPA / PIPEDA)", kind: "COMPLIANCE", category: "Privacy", deadlineBucket: "WITHIN_30_DAYS", order: 23 },
  { key: "cc-safe-lifting", title: "Safe Lifting and Transfers", kind: "COMPLIANCE", category: "Health & Safety", deadlineBucket: "WITHIN_30_DAYS", order: 24 },
  { key: "cc-edi", title: "Equity, Diversity and Inclusion (EDI)", kind: "COMPLIANCE", category: "EDI", deadlineBucket: "WITHIN_30_DAYS", order: 25 },

  // Clinical learning, Autism Internet Modules (checklist Weeks 1–2)
  { key: "clin-m1-naturalistic", title: "Module 1: Naturalistic Intervention", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/1199`, deadlineBucket: "WEEK_1", order: 1 },
  { key: "clin-m2-peer-mediated", title: "Module 2: Peer Mediated Instruction & Intervention", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/473`, deadlineBucket: "WEEK_1", order: 2 },
  { key: "clin-m3-social-skills", title: "Module 3: Social Skills Training", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/511`, deadlineBucket: "WEEK_1", order: 3 },
  { key: "clin-m4-social-strategies", title: "Module 4: Social Skills & Intervention Strategies", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/529`, deadlineBucket: "WEEK_1", order: 4 },
  { key: "clin-m5-rules-routines", title: "Module 5: Rules & Routines", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/499`, deadlineBucket: "WEEK_2", order: 5 },
  { key: "clin-m6-transitioning", title: "Module 6: Transitioning Between Activities", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/472`, deadlineBucket: "WEEK_2", order: 6 },
  { key: "clin-m7-visual-supports", title: "Module 7: Visual Supports", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/1048`, deadlineBucket: "WEEK_2", order: 7 },

  // Role-assigned clinical (assigned by supervisors; optional catalog items)
  { key: "clin-cpi", title: "CPI (Crisis Prevention)", kind: "CLINICAL", category: "Role-assigned", deadlineBucket: "CUSTOM", order: 40, active: true },
  { key: "clin-ndbi", title: "NDBI for Autism", kind: "CLINICAL", category: "Role-assigned", deadlineBucket: "CUSTOM", order: 41, active: true },
  { key: "clin-caregiver-mediated", title: "Caregiver-Mediated Support", kind: "CLINICAL", category: "Role-assigned", deadlineBucket: "CUSTOM", order: 42, active: true },
  { key: "clin-social-thinking", title: "Social Thinking", kind: "CLINICAL", category: "Role-assigned", deadlineBucket: "CUSTOM", order: 43, active: true },
  { key: "clin-aac", title: "AAC Supports", kind: "CLINICAL", category: "Role-assigned", deadlineBucket: "CUSTOM", order: 44, active: true },
];

/* --------------------------------- Tasks --------------------------------- */

let o = 0;
const next = () => (o += 1);

export const hubOnboardingTasks: SeedTask[] = [
  /* ---------------- WEEK 1, HR & Compliance ---------------- */
  { key: "w1-hr-newhire-paperwork", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Complete new-hire paperwork with the HR Lead", supervisorSignoffRequired: true, deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-direct-deposit", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Set up direct deposit and submit a void cheque in Wagepoint", description: "Complete this in Wagepoint. Do not enter banking details into this portal, confirm here once it is done in Wagepoint.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-payroll-access", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Confirm payroll and pay schedule access in Wagepoint", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-vsc-apply", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Apply for or submit the Vulnerable Sector Check", description: "Apply on the spot if needed. On-site client observation begins only once your VSC is cleared; until then, observation runs through approved video case studies.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-emergency-contact", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Provide updated emergency contact information to the HR Lead", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-handbook", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Read the Employee Handbook in full", description: "Includes code of conduct, PHIPA and confidentiality, and incident reporting.", deadlineBucket: "WEEK_1", order: next() },
  // 8 mandatory compliance trainings (within 14 days)
  { key: "w1-cc-aoda-accessibility", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Accessibility for Ontarians with Disability", courseKey: "cc-aoda-accessibility", evidenceRequired: false, deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-working-together", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Working Together: the Code and the AODA", courseKey: "cc-working-together", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-ohsa", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Occupational Health & Safety Act", courseKey: "cc-ohsa", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-whmis", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "WHMIS", courseKey: "cc-whmis", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-violence-harassment", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Workplace Violence and Harassment", courseKey: "cc-violence-harassment", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-hs-four-steps", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Health & Safety Awareness in 4 Steps", courseKey: "cc-hs-four-steps", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-hazardous-substances", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Hazardous Substances", courseKey: "cc-hazardous-substances", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-wellbeing", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Wellbeing at Work", courseKey: "cc-wellbeing", deadlineBucket: "WITHIN_14_DAYS", order: next() },

  /* ---------------- WEEK 1, Systems & Tools ---------------- */
  { key: "w1-sys-email-drive", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Set up Mount Etna email and Google Drive access; locate the shared team folders", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-janeapp-1", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Complete the JaneApp tutorial (part 1)", description: "Navigate your schedule, read client profiles, and understand how bookings and session notes connect.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-abadesk", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Complete the ABADesk tutorial", description: "Set up a session and record targets, trials and clean data.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-wagepoint", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Confirm Wagepoint access for pay, pay schedule and timesheets", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-igniteos", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Review the roadmap to IgniteOS", description: "The unified system SummitClient.io is building for the ecosystem.", required: false, deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1, Orientation & Policy ---------------- */
  { key: "w1-orient-welcome", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Attend the full-team welcome and meet the team", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-ecosystem", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Understand who we are: the four-pillar Mount Etna ecosystem and the MAEZ collective", description: "Mount Etna (clinical) · Embers for Access Foundation (access) · MEGBA (scale) · SummitClient.io (infrastructure).", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-policies", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Review policies, conduct, health and safety, safeguarding, and confidentiality essentials", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-service-overview", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Complete the service overview: daily clinic flow and where your role fits", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-incident-reporting", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Review behaviour incident documentation and the reporting workflow", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1, Clinical Learning (Modules 1–4) ---------------- */
  { key: "w1-clin-m1", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 1: Naturalistic Intervention", courseKey: "clin-m1-naturalistic", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m2", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 2: Peer Mediated Instruction & Intervention", courseKey: "clin-m2-peer-mediated", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m3", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 3: Social Skills Training", courseKey: "clin-m3-social-skills", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m4", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 4: Social Skills & Intervention Strategies", courseKey: "clin-m4-social-strategies", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1, Practice Prep & Observation ---------------- */
  { key: "w1-prep-sensory-spaces", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Help build sensory-friendly spaces, visual schedules and supports", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-prep-materials", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Complete program and materials prep for your caseload", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-prep-sample-programs", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Review sample client programs across the service streams you will support", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-obs-shadow", week: 1, section: "Practice prep and observation", category: "OBSERVATION", title: "Shadow across sites or streams as arranged by your supervisor", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-obs-begin", week: 1, section: "Practice prep and observation", category: "OBSERVATION", title: "Begin client observation: shadow a clinician on the ground or watch sample videos", description: "Shadow a supervising clinician on the ground once your VSC is clear, or watch sample videos until then.", trainingUrl: "https://www.youtube.com/watch?v=aBSeEkWWZac&list=PLoLLcVrTmL83AEXIw-TmnhjAsoAlTDi2a", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-team-checkins", week: 1, section: "Practice prep and observation", category: "TEAM_PARTICIPATION", title: "Take part in daily team check-ins, debriefs and case discussion", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 2, Clinical Learning (Modules 5–7) ---------------- */
  { key: "w2-clin-m5", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 5: Rules & Routines", courseKey: "clin-m5-rules-routines", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-m6", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 6: Transitioning Between Activities", courseKey: "clin-m6-transitioning", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-m7", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 7: Visual Supports", courseKey: "clin-m7-visual-supports", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2, Systems & Tools ---------------- */
  { key: "w2-sys-janeapp-2", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Complete JaneApp (part 2)", description: "Hands-on booking, arrivals, and finding your sessions day to day.", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-sys-abadesk-live", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Practise live data collection in ABADesk during a supervised session", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-sys-timesheets", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Confirm timesheets are submitted correctly in Wagepoint", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2, Practice & Facilitation ---------------- */
  { key: "w2-fac-group-runthrough", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Complete a group programming run-through", description: "For example Magma Movers and activity rotations.", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-mock-session", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Run a mock session and dry run of a session block", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-finalise-plans", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Finalise your program plans, materials and daily schedules", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-clinic-walkthrough", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Complete the final setup and a full clinic-day walkthrough", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2, Supervised client observation (sign-off) ---------------- */
  { key: "w2-obs-cofacilitate", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Co-facilitate a low-stakes group activity with a supervising clinician", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-assist-data", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Assist in a session with a supervising clinician, taking live data in ABADesk", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-lead-portion", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Lead a portion of a session with a supervising clinician and live feedback", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-final-practice", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Complete final supervised practice with a supervising clinician before you begin working with clients", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2, HR Sign-Off & Readiness ---------------- */
  { key: "w2-ready-timesheets", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm timesheets and scheduling in Wagepoint; close out any outstanding paperwork", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-vsc-clear", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm Vulnerable Sector Check clearance is on file", description: "Required before unsupervised, in-person client work.", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-systems-access", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm systems access is active: JaneApp, ABADesk, Wagepoint and Google Drive", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-competency", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Complete the competency check-in", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-handbook-ack", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Sign the Handbook Acknowledgement of Receipt (Chapter 12) and return it to management", evidenceRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-compliance-track", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm mandatory compliance training is on track for the 14-day deadline", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-role-assignments", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Receive your first-week role assignments and confirm the plan", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
];

/** Human-readable labels for deadline buckets. */
export const deadlineBucketLabels: Record<HubDeadlineBucket, string> = {
  WEEK_1: "Week 1",
  WEEK_2: "Week 2",
  WITHIN_14_DAYS: "Within 14 days",
  WITHIN_30_DAYS: "Within 30 days",
  CUSTOM: "Custom date",
};

export const taskCategoryLabels: Record<HubTaskCategory, string> = {
  HR_COMPLIANCE: "HR & Compliance",
  SYSTEMS_TOOLS: "Systems & Tools",
  ORIENTATION_POLICY: "Orientation & Policy",
  CLINICAL_LEARNING: "Clinical Learning",
  PRACTICE_PREP: "Practice Preparation",
  OBSERVATION: "Observation",
  TEAM_PARTICIPATION: "Team Participation",
  PRACTICE_FACILITATION: "Practice & Facilitation",
  READINESS: "Readiness",
};
