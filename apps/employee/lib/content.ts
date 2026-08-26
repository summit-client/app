/**
 * Employee Hub authoritative content, ported intact from the Mount Etna
 * Employee Hub ("Mount Etna New Team Member Onboarding Checklist, 2026").
 * External training URLs, week placement, sections and the VSC rule come from
 * that document; deadlines use the checklist's own wording, never guessed.
 *
 * Summit divergence from the MEGBA original: the template lives in code
 * (versioned with the app) rather than in template tables. Only per-employee
 * PROGRESS is stored in the database (migration 0006). Organizations will edit
 * this through Settings in a later phase.
 */

export type DeadlineBucket = "WEEK_1" | "WEEK_2" | "WITHIN_14_DAYS" | "WITHIN_30_DAYS" | "CUSTOM";

export type TaskCategory =
  | "HR_COMPLIANCE" | "SYSTEMS_TOOLS" | "ORIENTATION_POLICY" | "CLINICAL_LEARNING"
  | "PRACTICE_PREP" | "OBSERVATION" | "TEAM_PARTICIPATION" | "PRACTICE_FACILITATION" | "READINESS";

export type CourseKind = "COMPLIANCE" | "CLINICAL" | "SYSTEM";

export interface HubCourse {
  key: string;
  title: string;
  provider?: string;
  kind: CourseKind;
  category?: string;
  externalUrl?: string;
  deadlineBucket: DeadlineBucket;
  order: number;
}

export interface HubTask {
  key: string;
  week: 1 | 2;
  section: string;
  category: TaskCategory;
  title: string;
  description?: string;
  required?: boolean;              // default true
  supervisorSignoffRequired?: boolean;
  evidenceRequired?: boolean;
  trainingUrl?: string;
  courseKey?: string;
  deadlineBucket: DeadlineBucket;
  order: number;
}

export const HUB_TEMPLATE = { name: "New Team Member Onboarding 2026", version: 1 };

export const WEEK_SUBTITLES: Record<number, string> = {
  1: "Paperwork, systems, orientation, first clinical learning and observation.",
  2: "Deeper clinical learning, supervised practice and readiness sign-off.",
};

const B_HR = "https://elearning.brighthr.com/ca";
const B_SAFE = "https://elearning.brightsafe.com/ca";
const TID = "?tid=2a856fee-a895-436b-89c6-96ade3116943";
const AIM = "https://autisminternetmodules.org/m";

export const HUB_COURSES: HubCourse[] = [
  // In-house 22-module clinical competency program (shipped with this app).
  { key: "megba-clinical-competency", title: "Clinical Competency Training Program", provider: "Mount Etna Global Behaviour Academy", kind: "CLINICAL", category: "MEGBA", externalUrl: "/clinical-training.html", deadlineBucket: "CUSTOM", order: 0 },
  // Mandatory compliance (Week 1, due within 14 days)
  { key: "cc-aoda-accessibility", title: "Accessibility for Ontarians with Disability", provider: "BrightHR", kind: "COMPLIANCE", category: "AODA", externalUrl: `${B_HR}/aoda-awareness/${TID}`, deadlineBucket: "WITHIN_14_DAYS", order: 1 },
  { key: "cc-working-together", title: "Working Together: the Code and the AODA", provider: "BrightHR", kind: "COMPLIANCE", category: "AODA", externalUrl: `${B_HR}/workingtogether-the-code-the-aoda/${TID}`, deadlineBucket: "WITHIN_14_DAYS", order: 2 },
  { key: "cc-ohsa", title: "Occupational Health & Safety Act", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/getting-to-know-the-ohsa-in-ontario/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 3 },
  { key: "cc-whmis", title: "WHMIS", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/whmis-v2/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 4 },
  { key: "cc-violence-harassment", title: "Workplace Violence and Harassment", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/workplace-violence-and-harassment/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 5 },
  { key: "cc-hs-four-steps", title: "Health & Safety Awareness in 4 Steps", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/worker-health-safety-awareness-four-steps/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 6 },
  { key: "cc-hazardous-substances", title: "Hazardous Substances", provider: "BrightSafe", kind: "COMPLIANCE", category: "Health & Safety", externalUrl: `${B_SAFE}/hazardoussubstances/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 7 },
  { key: "cc-wellbeing", title: "Wellbeing at Work", provider: "BrightSafe", kind: "COMPLIANCE", category: "Wellbeing", externalUrl: `${B_SAFE}/wellbeing-at-work/${TID}#/`, deadlineBucket: "WITHIN_14_DAYS", order: 8 },
  // Additional mandatory compliance for the first 30 days (URLs set by admin)
  { key: "cc-duty-to-report", title: "Duty to Report (child abuse and neglect)", kind: "COMPLIANCE", category: "Safeguarding", deadlineBucket: "WITHIN_30_DAYS", order: 20 },
  { key: "cc-mental-health", title: "Mental Health Awareness", kind: "COMPLIANCE", category: "Wellbeing", deadlineBucket: "WITHIN_30_DAYS", order: 21 },
  { key: "cc-ipac", title: "Infection Prevention and Control (IPAC)", kind: "COMPLIANCE", category: "Health & Safety", deadlineBucket: "WITHIN_30_DAYS", order: 22 },
  { key: "cc-privacy-phipa", title: "Privacy and Confidentiality (PHIPA / PIPEDA)", kind: "COMPLIANCE", category: "Privacy", deadlineBucket: "WITHIN_30_DAYS", order: 23 },
  { key: "cc-safe-lifting", title: "Safe Lifting and Transfers", kind: "COMPLIANCE", category: "Health & Safety", deadlineBucket: "WITHIN_30_DAYS", order: 24 },
  { key: "cc-edi", title: "Equity, Diversity and Inclusion (EDI)", kind: "COMPLIANCE", category: "EDI", deadlineBucket: "WITHIN_30_DAYS", order: 25 },
  // Clinical learning: Autism Internet Modules (Weeks 1 and 2)
  { key: "clin-m1-naturalistic", title: "Module 1: Naturalistic Intervention", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/1199`, deadlineBucket: "WEEK_1", order: 1 },
  { key: "clin-m2-peer-mediated", title: "Module 2: Peer Mediated Instruction & Intervention", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/473`, deadlineBucket: "WEEK_1", order: 2 },
  { key: "clin-m3-social-skills", title: "Module 3: Social Skills Training", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/511`, deadlineBucket: "WEEK_1", order: 3 },
  { key: "clin-m4-social-strategies", title: "Module 4: Social Skills & Intervention Strategies", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/529`, deadlineBucket: "WEEK_1", order: 4 },
  { key: "clin-m5-rules-routines", title: "Module 5: Rules & Routines", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/499`, deadlineBucket: "WEEK_2", order: 5 },
  { key: "clin-m6-transitioning", title: "Module 6: Transitioning Between Activities", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/472`, deadlineBucket: "WEEK_2", order: 6 },
  { key: "clin-m7-visual-supports", title: "Module 7: Visual Supports", provider: "Autism Internet Modules", kind: "CLINICAL", externalUrl: `${AIM}/1048`, deadlineBucket: "WEEK_2", order: 7 },
  // Summit modules 8 to 13: resource + competency check, certificate on pass.
  { key: "mod-8-cpi", title: "Module 8: CPI (Crisis Prevention)", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://youtube.com/playlist?list=PLLcEhzcGwl2e9RbHrotqlgFaSzZnhT62r&si=9PTK_SgEEd6L7wM0", deadlineBucket: "CUSTOM", order: 8 },
  { key: "mod-9-ndbi", title: "Module 9: Naturalistic Developmental Behaviour Interventions", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://drive.google.com/file/d/1_dxvkVsRR9mbbv1IVRRltiLrQdwvWFRN/view?usp=drive_link", deadlineBucket: "CUSTOM", order: 9 },
  { key: "mod-10-social-thinking", title: "Module 10: Social Thinking", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://drive.google.com/file/d/1-4CE3Ro9ya0vgEW1vxh8O0SFw0ghoNBy/view?usp=drive_link", deadlineBucket: "CUSTOM", order: 10 },
  { key: "mod-11-caregiver", title: "Module 11: Caregiver-Mediated Support", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://drive.google.com/file/d/1sjfTnMpwjnTaaErj3Tb0RsLkAS2G1Y7q/view?usp=sharing", deadlineBucket: "CUSTOM", order: 11 },
  { key: "mod-12-coughdrop", title: "Module 12: CoughDrop AAC", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://drive.google.com/file/d/1gCjkvJ506WscSEI0tgx2si6PN8PxXbVi/view?usp=drive_link", deadlineBucket: "CUSTOM", order: 12 },
  { key: "mod-13-lamp", title: "Module 13: LAMP AAC", kind: "CLINICAL", category: "Summit Module", externalUrl: "https://drive.google.com/file/d/1wd0B5P1A1tZ5iOiv67qbQ4N0DROdPaPP/view?usp=drive_link", deadlineBucket: "CUSTOM", order: 13 },
];

/** The digital binder with all module resources and additional videos. */
export const BINDER_URL = "https://drive.google.com/drive/folders/1srSLI9XH_N58f_3YrxjTRN-BKz4WSS1E?usp=drive_link";

let o = 0;
const next = () => (o += 1);

export const HUB_TASKS: HubTask[] = [
  /* ---------------- WEEK 1 · HR & Compliance ---------------- */
  { key: "w1-hr-newhire-paperwork", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Complete new-hire paperwork with the HR Lead", supervisorSignoffRequired: true, deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-direct-deposit", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", supervisorSignoffRequired: true, title: "Set up direct deposit and submit a void cheque in Wagepoint", description: "Complete this in Wagepoint. Do not enter banking details into this portal. Confirm here once it is done in Wagepoint.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-payroll-access", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", supervisorSignoffRequired: true, title: "Confirm payroll and pay schedule access in Wagepoint", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-vsc-apply", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Apply for or submit the Vulnerable Sector Check", description: "Apply on the spot if needed. On-site client observation begins only once your VSC is cleared; until then, observation runs through approved video case studies.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-emergency-contact", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", supervisorSignoffRequired: true, title: "Provide updated emergency contact information to the HR Lead", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-hr-handbook", week: 1, section: "Paperwork, payroll and compliance", category: "HR_COMPLIANCE", title: "Read the Employee Handbook in full", description: "Includes code of conduct, PHIPA and confidentiality, and incident reporting.", trainingUrl: "https://drive.google.com/file/d/1fmV5zENVnM6ffkTYJDWL0w-4BwdEzoqB/view", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-cc-aoda-accessibility", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Accessibility for Ontarians with Disability", courseKey: "cc-aoda-accessibility", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-working-together", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Working Together: the Code and the AODA", courseKey: "cc-working-together", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-ohsa", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Occupational Health & Safety Act", courseKey: "cc-ohsa", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-whmis", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "WHMIS", courseKey: "cc-whmis", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-violence-harassment", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Workplace Violence and Harassment", courseKey: "cc-violence-harassment", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-hs-four-steps", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Health & Safety Awareness in 4 Steps", courseKey: "cc-hs-four-steps", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-hazardous-substances", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Hazardous Substances", courseKey: "cc-hazardous-substances", deadlineBucket: "WITHIN_14_DAYS", order: next() },
  { key: "w1-cc-wellbeing", week: 1, section: "Mandatory compliance training", category: "HR_COMPLIANCE", title: "Wellbeing at Work", courseKey: "cc-wellbeing", deadlineBucket: "WITHIN_14_DAYS", order: next() },

  /* ---------------- WEEK 1 · Systems & Tools ---------------- */
  { key: "w1-sys-email-drive", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Set up organization email and Google Drive access; locate the shared team folders", description: "The Adding Privateemail to Gmail walkthrough video shows the exact steps.", trainingUrl: "https://drive.google.com/file/d/19VVfZyqsIzn8FuLhY3-wL9u2c_mGVQRo/view", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-janeapp-1", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Complete the JaneApp tutorial (part 1)", description: "Navigate your schedule, read client profiles, and understand how bookings and session notes connect.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-abadesk", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Complete the data-collection tutorial", description: "Set up a session and record targets, trials and clean data.", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-wagepoint", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Confirm Wagepoint access for pay, pay schedule and timesheets", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-telus", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Set up Telus Business Connect and confirm you can sign in", description: "Watch the walkthrough video first.", trainingUrl: "https://drive.google.com/file/d/19DOSryBqSvN5bF_gE5k39kwTyNVu48zT/view", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-sys-igniteos", week: 1, section: "Systems and tools setup", category: "SYSTEMS_TOOLS", title: "Review the roadmap to IgniteOS", description: "The unified system SummitClient.io is building for the ecosystem.", required: false, deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1 · Orientation & Policy ---------------- */
  { key: "w1-orient-welcome", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Attend the full-team welcome and meet the team", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-ecosystem", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Understand who we are: the four-pillar ecosystem and the MAEZ collective", description: "Mount Etna (clinical) · Embers for Access Foundation (access) · MEGBA (scale) · SummitClient.io (infrastructure).", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-policies", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Review policies, conduct, health and safety, safeguarding, and confidentiality essentials", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-service-overview", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Complete the service overview: daily clinic flow and where your role fits", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-orient-incident-reporting", week: 1, section: "Orientation and policy", category: "ORIENTATION_POLICY", title: "Review behaviour incident documentation and the reporting workflow", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1 · Clinical Learning (Modules 1–4) ---------------- */
  { key: "w1-clin-m1", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 1: Naturalistic Intervention", courseKey: "clin-m1-naturalistic", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m2", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 2: Peer Mediated Instruction & Intervention", courseKey: "clin-m2-peer-mediated", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m3", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 3: Social Skills Training", courseKey: "clin-m3-social-skills", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-m4", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 4: Social Skills & Intervention Strategies", courseKey: "clin-m4-social-strategies", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-ndbi-video", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Watch: NDBI staff training (Naturalistic Developmental Behavioural Intervention)", trainingUrl: "https://drive.google.com/file/d/1_dxvkVsRR9mbbv1IVRRltiLrQdwvWFRN/view", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-clin-social-thinking", week: 1, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Watch: Social Thinking introduction and training", description: "Pairs with the social-skills modules.", trainingUrl: "https://drive.google.com/file/d/1-4CE3Ro9ya0vgEW1vxh8O0SFw0ghoNBy/view", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 1 · Practice Prep & Observation ---------------- */
  { key: "w1-prep-sensory-spaces", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Help build sensory-friendly spaces, visual schedules and supports", description: "The How to Use LessonPix video covers building visual supports.", trainingUrl: "https://drive.google.com/file/d/1mEIH-wwGS7qrIxWBmr7vFSyQDlXTDGJK/view", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-prep-materials", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Complete program and materials prep for your caseload", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-prep-sample-programs", week: 1, section: "Practice prep and observation", category: "PRACTICE_PREP", title: "Review sample client programs across the service streams you will support", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-obs-shadow", week: 1, section: "Practice prep and observation", category: "OBSERVATION", title: "Shadow across sites or streams as arranged by your supervisor", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-obs-begin", week: 1, section: "Practice prep and observation", category: "OBSERVATION", title: "Begin client observation: shadow a clinician on the ground or watch sample videos", description: "Shadow a supervising clinician on the ground once your VSC is clear, or watch sample videos until then.", trainingUrl: "https://www.youtube.com/watch?v=aBSeEkWWZac&list=PLoLLcVrTmL83AEXIw-TmnhjAsoAlTDi2a", deadlineBucket: "WEEK_1", order: next() },
  { key: "w1-team-checkins", week: 1, section: "Practice prep and observation", category: "TEAM_PARTICIPATION", title: "Take part in daily team check-ins, debriefs and case discussion", deadlineBucket: "WEEK_1", order: next() },

  /* ---------------- WEEK 2 · Clinical Learning (Modules 5–7) ---------------- */
  { key: "w2-clin-m5", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 5: Rules & Routines", courseKey: "clin-m5-rules-routines", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-m6", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 6: Transitioning Between Activities", courseKey: "clin-m6-transitioning", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-m7", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Module 7: Visual Supports", courseKey: "clin-m7-visual-supports", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-caregiver-mediated", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Watch: Caregiver-Mediated Supports in ABA (staff training)", trainingUrl: "https://drive.google.com/file/d/1sjfTnMpwjnTaaErj3Tb0RsLkAS2G1Y7q/view", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-coughdrop", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Watch: CoughDrop AAC walkthrough", description: "As applicable to your caseload.", required: false, trainingUrl: "https://drive.google.com/file/d/1gCjkvJ506WscSEI0tgx2si6PN8PxXbVi/view", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-clin-lamp", week: 2, section: "Clinical learning", category: "CLINICAL_LEARNING", title: "Watch: LAMP AAC walkthrough", description: "As applicable to your caseload.", required: false, trainingUrl: "https://drive.google.com/file/d/1wd0B5P1A1tZ5iOiv67qbQ4N0DROdPaPP/view", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2 · Systems & Tools ---------------- */
  { key: "w2-sys-janeapp-2", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Complete JaneApp (part 2)", description: "Hands-on booking, arrivals, and finding your sessions day to day.", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-sys-abadesk-live", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Practise live data collection during a supervised session", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-sys-timesheets", week: 2, section: "Systems and tools", category: "SYSTEMS_TOOLS", title: "Confirm timesheets are submitted correctly in Wagepoint", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2 · Practice & Facilitation ---------------- */
  { key: "w2-fac-group-runthrough", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Complete a group programming run-through", description: "For example Magma Movers and activity rotations.", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-mock-session", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Run a mock session and dry run of a session block", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-finalise-plans", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Finalise your program plans, materials and daily schedules", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-fac-clinic-walkthrough", week: 2, section: "Practice prep and facilitation", category: "PRACTICE_FACILITATION", title: "Complete the final setup and a full clinic-day walkthrough", deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2 · Supervised client observation (sign-off) ---------------- */
  { key: "w2-obs-cofacilitate", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Co-facilitate a low-stakes group activity with a supervising clinician", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-assist-data", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Assist in a session with a supervising clinician, taking live data", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-lead-portion", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Lead a portion of a session with a supervising clinician and live feedback", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-obs-final-practice", week: 2, section: "Supervised client observation", category: "OBSERVATION", title: "Complete final supervised practice with a supervising clinician before you begin working with clients", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },

  /* ---------------- WEEK 2 · HR Sign-Off & Readiness ---------------- */
  { key: "w2-ready-timesheets", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm timesheets and scheduling in Wagepoint; close out any outstanding paperwork", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-vsc-clear", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm Vulnerable Sector Check clearance is on file", description: "Required before unsupervised, in-person client work.", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-systems-access", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm systems access is active: JaneApp, data collection, Wagepoint and Google Drive", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-competency", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Complete the competency check-in", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-handbook-ack", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Sign the Handbook Acknowledgement of Receipt (Chapter 12) and return it to management", evidenceRequired: true, deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-compliance-track", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Confirm mandatory compliance training is on track for the 14-day deadline", deadlineBucket: "WEEK_2", order: next() },
  { key: "w2-ready-role-assignments", week: 2, section: "HR sign-off and readiness", category: "READINESS", title: "Receive your first-week role assignments and confirm the plan", supervisorSignoffRequired: true, deadlineBucket: "WEEK_2", order: next() },
];

export const DEADLINE_LABELS: Record<DeadlineBucket, string> = {
  WEEK_1: "Week 1",
  WEEK_2: "Week 2",
  WITHIN_14_DAYS: "Within 14 days",
  WITHIN_30_DAYS: "Within 30 days",
  CUSTOM: "Custom date",
};

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
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

/** "My Documents": handbook, checklists and shared-drive launch cards. */
export const HUB_DOCUMENTS = [
  { name: "Employee Handbook (2026)", kind: "Handbook", url: "https://drive.google.com/file/d/1fmV5zENVnM6ffkTYJDWL0w-4BwdEzoqB/view", note: "Code of conduct, PHIPA and confidentiality, incident reporting. Sign the Chapter 12 acknowledgement in Week 2." },
  { name: "Onboarding Checklist 2026 (PDF)", kind: "Onboarding", url: "/hub-docs/onboarding-checklist-2026.pdf", note: "The source document for the onboarding board." },
  { name: "Shared Team Drive", kind: "Drive", url: "https://drive.google.com/drive/folders/1ksWVzQTDVCvFu3DXIaeyJQbPFvCZYcxr", note: "Training videos and extra observation material." },
];
