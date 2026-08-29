/**
 * @summit/settings — the central configuration layer for the whole platform.
 *
 * One inheritance chain, read by every module:
 *
 *   Organization Settings → Role Defaults → User Preferences → Module Behaviour
 *
 * Modules never keep their own preference stores. A setting's definition says
 * which level owns it (scope), whether users may override it, and whether the
 * organization has locked it. Every write is audited with previous/new value.
 *
 * Persistence seam: localStorage in preview; the same API backs onto the
 * org_settings / role_settings / user_settings tables (migration 0005) in live
 * mode — callers never branch.
 *
 * Live mode needs identity (which clinic, which role, which user) before it
 * can load or write anything, so call initSettings() once near the app root
 * once @summit/session's identity is known - see apps/data and
 * apps/employee's SessionProvider. Every read (getSetting, resolve, term,
 * readAudit) stays fully synchronous either way: it reads whatever is
 * currently cached, which is {} (falling back to each setting's own default)
 * until initSettings() resolves, then the real values, with
 * onSettingsChange() firing so subscribed components re-render. This is the
 * same "flash of defaults, then the real value" trade-off @summit/session
 * itself already makes for portal role - not a new pattern.
 */

import { IS_PREVIEW, getIdentity, type AppRole } from "@summit/session";
import { createBrowserClient } from "@supabase/ssr";

export type SettingScope = "org" | "role" | "user";
export type SettingValue = string | number | boolean;

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  section: string;
  scope: SettingScope;          // the level that owns the authoritative default
  userOverridable?: boolean;    // a user may set their own value
  locked?: boolean;             // 🔒 organization controlled — no override, ever
  type: "toggle" | "select" | "text" | "number" | "color" | "time";
  options?: { value: string; label: string }[];
  default: SettingValue;
  keywords?: string[];
}

export interface SettingsSection {
  slug: string;
  title: string;
  blurb: string;
}

export const SECTIONS: SettingsSection[] = [
  { slug: "general", title: "General", blurb: "Organization identity, locale and scheduling defaults." },
  { slug: "appearance", title: "Appearance & Branding", blurb: "Logo, colours, theme and density across every Summit surface." },
  { slug: "language", title: "Language & Terminology", blurb: "Interface language, client communication language and your organization's own words." },
  { slug: "dashboard", title: "Dashboard", blurb: "Choose and arrange the widgets on your home dashboard." },
  { slug: "navigation", title: "Navigation", blurb: "Order, pin and hide sidebar modules." },
  { slug: "accessibility", title: "Accessibility", blurb: "Personal display and interaction accommodations. Yours alone; follows you across devices." },
  { slug: "notifications", title: "Notifications", blurb: "Which events reach you, on which channel, and when." },
  { slug: "email", title: "Email", blurb: "Connected email accounts, sending identity and signatures." },
  { slug: "messaging", title: "Messaging", blurb: "Internal team messaging, external family communication and reusable templates." },
  { slug: "ai", title: "AI & Intelligence", blurb: "What Summit's clinical intelligence may draft, suggest and translate — always with clinician approval." },
  { slug: "run-session", title: "Run Session", blurb: "How the session workspace opens, orders goals and collects data." },
  { slug: "data-graphs", title: "Data & Graphs", blurb: "Graph defaults applied everywhere data is displayed." },
  { slug: "documentation", title: "Documentation", blurb: "Note formats, autosave, signatures and required fields." },
  { slug: "reports", title: "Reports", blurb: "Report branding, language level and defaults." },
  { slug: "calendar", title: "Calendar & Scheduling", blurb: "Working hours, views, buffers and booking rules." },
  { slug: "client-portal", title: "Client Portal", blurb: "What families can see and do." },
  { slug: "forms", title: "Forms & Intake", blurb: "Intake workflow, required forms and consent automation." },
  { slug: "tasks-automations", title: "Tasks & Automations", blurb: "Task defaults and WHEN → IF → THEN rules. No coding required." },
  { slug: "roles", title: "Roles & Permissions", blurb: "Granular module permissions per role." },
  { slug: "integrations", title: "Integrations", blurb: "Connected services and exactly what each can access." },
  { slug: "privacy", title: "Privacy & Security", blurb: "Sign-in security, organization policy and the audit log." },
  { slug: "data-export", title: "Data & Export", blurb: "Export client records, data and reports — with elevated permission for bulk export." },
  { slug: "profile", title: "My Profile", blurb: "Your name, credentials, signature and personal defaults." },
  { slug: "ecosystem", title: "Ecosystem Tracker", blurb: "Monthly scorecards, source weights, recognition, bonus eligibility and career pathways for the HR module." },
];

/* ---- terminology ------------------------------------------------------------- */

export const TERMINOLOGY_DEFAULTS: Record<string, string> = {
  client: "Client",
  caregiver: "Caregiver",
  clinician: "Clinician",
  session: "Session",
  goal: "Goal",
  program: "Program",
  location: "Location",
  behaviour: "Behaviour",
  supervisor: "Supervisor",
};

export const TERMINOLOGY_SUGGESTIONS: Record<string, string[]> = {
  client: ["Client", "Patient", "Learner", "Student", "Participant"],
  caregiver: ["Caregiver", "Parent", "Guardian", "Family"],
  clinician: ["Clinician", "Therapist", "Practitioner", "Provider"],
  session: ["Session", "Visit", "Appointment", "Treatment"],
  goal: ["Goal", "Target", "Objective", "Skill"],
  program: ["Program", "Intervention", "Teaching Program"],
  location: ["Location", "Clinic", "Site", "Centre"],
  behaviour: ["Behaviour", "Target Behaviour", "Response"],
  supervisor: ["Supervisor", "Clinical Lead", "Consultant"],
};

/* ---- the registry ------------------------------------------------------------ */

const sel = (...vals: string[]) => vals.map((v) => ({ value: v, label: v }));

export const SETTINGS: SettingDef[] = [
  /* General */
  { key: "org.name", label: "Organization name", section: "general", scope: "org", type: "text", default: "Mount Etna Child & Family Services", keywords: ["practice", "name"] },
  { key: "org.legalName", label: "Legal business name", section: "general", scope: "org", type: "text", default: "" },
  { key: "org.email", label: "Business email", section: "general", scope: "org", type: "text", default: "" },
  { key: "org.phone", label: "Business phone", section: "general", scope: "org", type: "text", default: "" },
  { key: "org.website", label: "Website", section: "general", scope: "org", type: "text", default: "" },
  { key: "org.timezone", label: "Time zone", section: "general", scope: "org", userOverridable: true, type: "select", options: sel("America/Toronto", "America/Vancouver", "America/Halifax", "UTC"), default: "America/Toronto" },
  { key: "org.dateFormat", label: "Date format", section: "general", scope: "org", userOverridable: true, type: "select", options: sel("YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"), default: "YYYY-MM-DD" },
  { key: "org.timeFormat", label: "Time format", section: "general", scope: "org", userOverridable: true, type: "select", options: [{ value: "12h", label: "12-hour" }, { value: "24h", label: "24-hour" }], default: "12h", keywords: ["clock"] },
  { key: "org.weekStart", label: "Week starts on", section: "general", scope: "org", userOverridable: true, type: "select", options: sel("Sunday", "Monday"), default: "Monday" },
  { key: "org.currency", label: "Default currency", section: "general", scope: "org", type: "select", options: sel("CAD", "USD", "EUR", "GBP"), default: "CAD" },
  { key: "org.defaultSessionDuration", label: "Default session duration (minutes)", section: "general", scope: "org", userOverridable: true, type: "select", options: sel("60", "90", "120", "180"), default: "120", keywords: ["session", "length"] },
  { key: "org.defaultLocation", label: "Default location", section: "general", scope: "org", userOverridable: true, type: "select", options: sel("Clinic", "Home", "School", "Community", "Virtual"), default: "Clinic" },
  { key: "org.defaultServiceType", label: "Default service type", section: "general", scope: "org", type: "select", options: sel("Direct Therapy", "Parent Coaching", "Supervision"), default: "Direct Therapy" },
  { key: "org.applyTo", label: "Apply organization settings to", section: "general", scope: "org", type: "select", options: sel("Entire Organization", "Specific Location", "Specific Program"), default: "Entire Organization", keywords: ["sites", "locations"] },

  /* Appearance (theme/accent handled by the custom section; these persist alongside) */
  { key: "appearance.density", label: "Density", description: "Affects tables, dashboards, client lists, schedules and data-entry screens.", section: "appearance", scope: "org", userOverridable: true, type: "select", options: sel("Comfortable", "Compact", "Spacious"), default: "Comfortable", keywords: ["compact", "spacing"] },
  { key: "appearance.portalTheme", label: "Client portal theme", section: "appearance", scope: "org", type: "select", options: [{ value: "match", label: "Match organization" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], default: "match", keywords: ["dark mode"] },
  { key: "appearance.primaryColor", label: "Primary colour", section: "appearance", scope: "org", type: "color", default: "#1b5a6e", keywords: ["brand", "hex"] },
  { key: "appearance.accentColor", label: "Accent colour", section: "appearance", scope: "org", type: "color", default: "#b65a1f", keywords: ["brand", "hex"] },

  /* Language */
  { key: "language.interface", label: "Preferred interface language", section: "language", scope: "org", userOverridable: true, type: "select", options: sel("English", "French", "Spanish", "German", "Italian", "Portuguese", "Bulgarian", "Arabic", "Mandarin"), default: "English", keywords: ["locale", "translation"] },
  { key: "language.clientDefault", label: "Default client communication language", description: "Each client profile can override this; it flows into reminders, forms, summaries and portal content for that family.", section: "language", scope: "org", type: "select", options: sel("English", "French", "Spanish", "Arabic", "Mandarin"), default: "English" },

  /* Accessibility — personal, follows the user */
  { key: "a11y.textSize", label: "Text size", section: "accessibility", scope: "user", type: "select", options: sel("Default", "Large", "Larger"), default: "Default", keywords: ["font", "zoom"] },
  { key: "a11y.reduceMotion", label: "Reduce motion", section: "accessibility", scope: "user", type: "toggle", default: false, keywords: ["animation"] },
  { key: "a11y.highContrast", label: "High contrast", section: "accessibility", scope: "user", type: "toggle", default: false },
  { key: "a11y.focusIndicators", label: "Enhanced focus indicators", section: "accessibility", scope: "user", type: "toggle", default: false, keywords: ["keyboard"] },
  { key: "a11y.lineSpacing", label: "Increased line spacing", section: "accessibility", scope: "user", type: "toggle", default: false, keywords: ["dyslexia"] },
  { key: "a11y.largerControls", label: "Larger controls", section: "accessibility", scope: "user", type: "toggle", default: false, keywords: ["touch", "buttons"] },
  { key: "a11y.colorBlindGraphs", label: "Colour-blind-safe graphs", description: "Status is never communicated through colour alone.", section: "accessibility", scope: "user", type: "toggle", default: false, keywords: ["graphs", "colour"] },
  { key: "a11y.simplified", label: "Simplified interface mode", description: "Reduces visual clutter and hides secondary panels.", section: "accessibility", scope: "user", type: "toggle", default: false },

  /* Notifications (delivery matrix in the custom section) */
  { key: "notify.cadence", label: "Delivery cadence", section: "notifications", scope: "user", type: "select", options: sel("Immediate", "Daily Digest", "Weekly Digest", "Off"), default: "Immediate", keywords: ["digest"] },
  { key: "notify.quietStart", label: "Quiet hours start", section: "notifications", scope: "user", type: "time", default: "21:00", keywords: ["quiet hours"] },
  { key: "notify.quietEnd", label: "Quiet hours end", section: "notifications", scope: "user", type: "time", default: "07:00" },
  { key: "notify.urgentOverride", label: "Urgent clinical notifications may override quiet hours", section: "notifications", scope: "org", locked: true, type: "toggle", default: true },

  /* Email */
  { key: "email.sendVia", label: "Send Summit messages using", section: "email", scope: "user", type: "select", options: [{ value: "summit", label: "Summit email service" }, { value: "personal", label: "My connected email account" }, { value: "org", label: "Organization email account" }], default: "summit", keywords: ["outlook", "gmail", "smtp"] },
  { key: "email.sync", label: "Email sync", section: "email", scope: "org", userOverridable: true, type: "select", options: [{ value: "send", label: "Send only" }, { value: "sendreceive", label: "Send + receive" }, { value: "client", label: "Sync client-related communication" }], default: "send" },
  { key: "email.confirmAttach", label: "Require manual confirmation before attaching email to a client chart", description: "Unrelated inbox content is never exposed automatically.", section: "email", scope: "org", locked: true, type: "toggle", default: true, keywords: ["privacy"] },
  { key: "email.senderName", label: "Default sender name", section: "email", scope: "user", type: "text", default: "", keywords: ["signature"] },

  /* Messaging */
  { key: "messaging.internalEnabled", label: "Internal team messaging", section: "messaging", scope: "org", type: "toggle", default: true, keywords: ["chat", "channels", "mentions"] },
  { key: "messaging.clinicalSeparation", label: "Internal messages stay out of the clinical record unless explicitly added", description: "“Add to Client Record” logs who added a message and when.", section: "messaging", scope: "org", locked: true, type: "toggle", default: true },
  { key: "messaging.externalChannels", label: "Permitted external channels", section: "messaging", scope: "org", type: "select", options: [{ value: "portal", label: "Portal only" }, { value: "portal-email", label: "Portal → Email fallback" }, { value: "portal-email-sms", label: "Portal → Email → SMS fallback" }], default: "portal-email", keywords: ["sms", "families"] },
  { key: "messaging.auditExternal", label: "Audit every external client communication", section: "messaging", scope: "org", locked: true, type: "toggle", default: true },

  /* AI */
  { key: "ai.insights", label: "AI Clinical Insights", section: "ai", scope: "org", type: "toggle", default: true, keywords: ["intelligence"] },
  { key: "ai.reportDrafting", label: "AI report drafting", section: "ai", scope: "org", type: "toggle", default: true },
  { key: "ai.noteSummaries", label: "Note summarization", section: "ai", scope: "org", type: "toggle", default: true },
  { key: "ai.sessionPlanning", label: "Suggested session activities & materials", section: "ai", scope: "org", type: "toggle", default: true, keywords: ["plan"] },
  { key: "ai.nlSearch", label: "Natural-language search", section: "ai", scope: "org", type: "toggle", default: true, keywords: ["query"] },
  { key: "ai.parentSummaries", label: "Parent-friendly summaries & translation", section: "ai", scope: "org", type: "toggle", default: true },
  { key: "ai.mode", label: "AI may…", section: "ai", scope: "org", type: "select", options: [{ value: "recommend", label: "Make recommendations only" }, { value: "draft", label: "Draft content for review" }], default: "draft" },
  { key: "ai.requireApproval", label: "Require clinician approval before AI content enters the record", description: "Mandatory for clinical records. AI never finalizes records or makes autonomous clinical decisions.", section: "ai", scope: "org", locked: true, type: "toggle", default: true, keywords: ["approval", "safety"] },
  { key: "ai.evidenceRequired", label: "Only show clinical AI insights when supporting evidence can be linked", section: "ai", scope: "org", type: "toggle", default: true, keywords: ["evidence"] },

  /* Run Session */
  { key: "run.autoLoadGoals", label: "Automatically load active goals", section: "run-session", scope: "org", userOverridable: true, type: "toggle", default: true },
  { key: "run.showPlanFirst", label: "Show session plan first", section: "run-session", scope: "org", userOverridable: true, type: "toggle", default: true },
  { key: "run.goalOrder", label: "Goal display", section: "run-session", scope: "user", type: "select", options: [{ value: "priority-domain", label: "Priority goals first, then by domain" }, { value: "domain", label: "Group by domain" }, { value: "all", label: "All active goals, flat" }], default: "priority-domain" },
  { key: "run.tapSize", label: "Data collection interface", section: "run-session", scope: "user", type: "select", options: [{ value: "large", label: "Large tap buttons" }, { value: "compact", label: "Compact data controls" }], default: "large", keywords: ["touch", "buttons"] },
  { key: "run.onePage", label: "Keep all goals on one vertical-scroll page", section: "run-session", scope: "org", type: "toggle", default: true },
  { key: "run.showTimer", label: "Show session timer", section: "run-session", scope: "user", type: "toggle", default: true, keywords: ["elapsed"] },
  { key: "run.saveEveryObservation", label: "Save immediately after every observation", section: "run-session", scope: "org", locked: true, type: "toggle", default: true, keywords: ["autosave", "atomic"] },

  /* Data & Graphs */
  { key: "graphs.defaultType", label: "Default graph type", section: "data-graphs", scope: "org", userOverridable: true, type: "select", options: sel("Line", "Bar", "Cumulative"), default: "Line" },
  { key: "graphs.masteryLine", label: "Show mastery threshold", section: "data-graphs", scope: "org", userOverridable: true, type: "toggle", default: true, keywords: ["criteria"] },
  { key: "graphs.phaseLines", label: "Show phase lines & condition labels", section: "data-graphs", scope: "org", userOverridable: true, type: "toggle", default: true },
  { key: "graphs.pointValues", label: "Show values at each point", section: "data-graphs", scope: "user", type: "toggle", default: true },
  { key: "graphs.dateRange", label: "Default date range", section: "data-graphs", scope: "user", type: "select", options: sel("Last 30 days", "Last 90 days", "Last 6 months", "All time"), default: "Last 90 days" },
  { key: "graphs.aggregation", label: "Default aggregation", section: "data-graphs", scope: "org", userOverridable: true, type: "select", options: [{ value: "session", label: "Session average" }, { value: "daily", label: "Daily average" }, { value: "weekly", label: "Weekly average" }, { value: "raw", label: "Raw observations" }], default: "session" },

  /* Documentation */
  { key: "docs.noteType", label: "Default note type", section: "documentation", scope: "org", userOverridable: true, type: "select", options: sel("SOAP", "DAP", "Narrative", "Session Summary"), default: "SOAP", keywords: ["notes"] },
  { key: "docs.autosave", label: "Autosave while typing", section: "documentation", scope: "org", type: "toggle", default: true },
  { key: "docs.cosign", label: "Supervisor co-signature required", section: "documentation", scope: "org", locked: true, type: "toggle", default: true, keywords: ["countersign", "signature"] },
  { key: "docs.signatureDeadline", label: "Signature deadline (hours after session)", section: "documentation", scope: "org", type: "select", options: sel("24", "48", "72"), default: "24" },
  { key: "docs.requiredFields", label: "Required before a session can close", section: "documentation", scope: "org", type: "select", options: [{ value: "core", label: "Attendance, goals addressed, objective data, signature" }, { value: "full", label: "Core + narrative, significant events, caregiver communication, next steps" }], default: "full" },

  /* Reports */
  { key: "reports.logo", label: "Include organization logo", section: "reports", scope: "org", type: "toggle", default: true, keywords: ["branding", "header"] },
  { key: "reports.confidentialityFooter", label: "Confidentiality footer", section: "reports", scope: "org", type: "toggle", default: true },
  { key: "reports.credentials", label: "Show clinician credentials", section: "reports", scope: "org", type: "toggle", default: true },
  { key: "reports.language", label: "Default report language", section: "reports", scope: "org", type: "select", options: sel("English", "French", "Spanish"), default: "English" },
  { key: "reports.languageLevel", label: "Parent-friendly language level", section: "reports", scope: "org", userOverridable: true, type: "select", options: sel("Clinical", "Professional", "Plain Language"), default: "Professional" },

  /* Calendar */
  { key: "calendar.view", label: "Default view", section: "calendar", scope: "user", type: "select", options: sel("Week", "Day"), default: "Week", keywords: ["schedule"] },
  { key: "calendar.showWeekends", label: "Show weekends", section: "calendar", scope: "user", type: "toggle", default: false },
  { key: "calendar.buffer", label: "Appointment buffer (minutes)", section: "calendar", scope: "org", userOverridable: true, type: "select", options: sel("0", "10", "15", "30"), default: "15" },
  { key: "calendar.onlineBooking", label: "Online booking", section: "calendar", scope: "org", type: "toggle", default: false, keywords: ["booking"] },
  { key: "calendar.workStart", label: "Working hours start", section: "calendar", scope: "org", type: "time", default: "08:00", keywords: ["hours", "open"] },
  { key: "calendar.workEnd", label: "Working hours end", section: "calendar", scope: "org", type: "time", default: "17:00", keywords: ["hours", "close"] },
  { key: "calendar.workDays", label: "Working days", description: "Comma-separated three-letter days, e.g. Mon,Tue,Wed,Thu,Fri.", section: "calendar", scope: "org", type: "text", default: "Mon,Tue,Wed,Thu,Fri", keywords: ["work days", "schedule"] },

  /* Client Portal */
  { key: "portal.sessionSummaries", label: "Families can view session summaries", section: "client-portal", scope: "org", type: "toggle", default: true, keywords: ["family", "portal"] },
  { key: "portal.graphs", label: "Families can view progress graphs", section: "client-portal", scope: "org", type: "toggle", default: true },
  { key: "portal.messaging", label: "Families can send secure messages", section: "client-portal", scope: "org", type: "toggle", default: true },
  { key: "portal.documents", label: "Families can upload documents", section: "client-portal", scope: "org", type: "toggle", default: true },
  { key: "portal.appointments", label: "Families can request appointments", section: "client-portal", scope: "org", type: "toggle", default: false },
  { key: "portal.observations", label: "Families can add caregiver observations", description: "Always labelled caregiver report — never merged with measured data.", section: "client-portal", scope: "org", type: "toggle", default: true },

  /* Forms */
  { key: "forms.intakeAuto", label: "When a new client is created, send the intake package", section: "forms", scope: "org", type: "toggle", default: true, keywords: ["automation", "intake"] },
  { key: "forms.notifyClinician", label: "When intake completes, notify the assigned clinician", section: "forms", scope: "org", type: "toggle", default: true },
  { key: "forms.consentRenewal", label: "When consent expires, request new consent", section: "forms", scope: "org", type: "toggle", default: true, keywords: ["consent"] },

  /* Data export */
  { key: "export.format", label: "Preferred export format", section: "data-export", scope: "user", type: "select", options: sel("PDF", "CSV", "XLSX", "JSON"), default: "PDF", keywords: ["download"] },
  { key: "export.bulkElevated", label: "Bulk exports require elevated permission", section: "data-export", scope: "org", locked: true, type: "toggle", default: true, keywords: ["portability"] },
  { key: "export.preview", label: "Show exactly what is included before export", section: "data-export", scope: "org", locked: true, type: "toggle", default: true },

  /* Privacy (interactive parts live in the custom section) */
  { key: "security.sessionTimeout", label: "Automatic logout after inactivity (minutes)", section: "privacy", scope: "org", locked: true, type: "select", options: sel("15", "30", "60"), default: "15", keywords: ["logout", "timeout"] },
  { key: "security.mfa", label: "Multi-factor authentication required", section: "privacy", scope: "org", locked: true, type: "toggle", default: true, keywords: ["2fa", "password"] },
  { key: "security.exportPermission", label: "Exporting requires permission", section: "privacy", scope: "org", locked: true, type: "toggle", default: true },

  /* Profile */
  { key: "profile.preferredName", label: "Preferred name", section: "profile", scope: "user", type: "text", default: "" },
  { key: "profile.pronouns", label: "Pronouns (optional)", section: "profile", scope: "user", type: "text", default: "" },
  { key: "profile.credentials", label: "Credentials", description: "Optionally populates reports and signatures automatically.", section: "profile", scope: "user", type: "text", default: "", keywords: ["designation", "signature"] },
  { key: "profile.jobTitle", label: "Job title", section: "profile", scope: "user", type: "text", default: "" },

  /* Ecosystem Tracker (My HR module) — every tenant-specific number lives here, never in code */
  { key: "eco.enabled", label: "Ecosystem Tracker", section: "ecosystem", scope: "org", type: "toggle", default: true, keywords: ["scorecard", "obm"] },
  { key: "eco.weightObjective", label: "Weight: objective metrics (%)", section: "ecosystem", scope: "org", type: "number", default: 35, keywords: ["weights"] },
  { key: "eco.weightSupervisor", label: "Weight: supervisor assessment (%)", section: "ecosystem", scope: "org", type: "number", default: 30 },
  { key: "eco.weightPeer", label: "Weight: peer feedback (%)", section: "ecosystem", scope: "org", type: "number", default: 15 },
  { key: "eco.weightSelf", label: "Weight: self reflection (%)", section: "ecosystem", scope: "org", type: "number", default: 10 },
  { key: "eco.weightPd", label: "Weight: professional development (%)", section: "ecosystem", scope: "org", type: "number", default: 10 },
  { key: "recog.enabled", label: "Peer recognition", section: "ecosystem", scope: "org", type: "toggle", default: true, keywords: ["points", "kudos"] },
  { key: "recog.monthlyAllowance", label: "Recognition points each employee may give per month", section: "ecosystem", scope: "org", type: "number", default: 10 },
  { key: "recog.maxPerPerson", label: "Maximum points to one person per month", section: "ecosystem", scope: "org", type: "number", default: 5 },
  { key: "bonus.enabled", label: "Monthly bonus eligibility", description: "Eligibility only; monetary amounts are never stored in Summit.", section: "ecosystem", scope: "org", type: "toggle", default: true, keywords: ["bonus"] },
  { key: "bonus.minScore", label: "Minimum Ecosystem Score for bonus eligibility", section: "ecosystem", scope: "org", type: "number", default: 80 },
  { key: "career.ladder", label: "Career development pathway (arrow-separated roles)", section: "ecosystem", scope: "org", type: "text", default: "Supervised Clinician > Lead Clinician > Supervisor Candidate > Clinical Leadership > Regional Leadership", keywords: ["pathway", "roles"] },
  { key: "support.devEmail", label: "Developer support email", description: "Troubleshoot and feature-request reports from the portals send here.", section: "ecosystem", scope: "org", type: "text", default: "dev@summitclient.io", keywords: ["support", "bugs", "feedback"] },
  { key: "eco.values", label: "Organizational values (comma-separated)", section: "ecosystem", scope: "org", type: "text", default: "Collaboration, Reciprocity, Learning, Reliability, Respect, Client Care, Mentorship", keywords: ["values", "serviceberry"] },

  /* Terminology (rendered by the custom Language section) */
  ...Object.keys(TERMINOLOGY_DEFAULTS).map((k): SettingDef => ({
    key: `terminology.${k}`,
    label: `Term: ${TERMINOLOGY_DEFAULTS[k]}`,
    section: "language",
    scope: "org",
    type: "text",
    default: TERMINOLOGY_DEFAULTS[k],
    keywords: ["terminology", "wording", k],
  })),
];

const DEFS = new Map(SETTINGS.map((s) => [s.key, s]));

/* ---- store ------------------------------------------------------------------- */

const KEYS: Record<SettingScope, string> = {
  org: "summit-settings-org",
  role: "summit-settings-role",
  user: "summit-settings-user",
};
const AUDIT_KEY = "summit-settings-audit";

export interface SettingsAuditEntry {
  key: string;
  label: string;
  level: SettingScope;
  previous: SettingValue | null;
  next: SettingValue | null;
  who: string;
  at: string;
}

type Layer = Record<string, SettingValue>;

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/* -- preview: unchanged localStorage behaviour -- */

function readLocal(scope: SettingScope): Layer {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEYS[scope]) ?? "{}") as Layer;
  } catch {
    return {};
  }
}

function writeLocal(scope: SettingScope, layer: Layer): void {
  localStorage.setItem(KEYS[scope], JSON.stringify(layer));
}

function readLocalAudit(): SettingsAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? "[]") as SettingsAuditEntry[];
  } catch {
    return [];
  }
}

function appendLocalAudit(entry: SettingsAuditEntry): void {
  const audit = readLocalAudit();
  audit.unshift(entry);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(audit.slice(0, 200)));
}

/* -- live: Supabase-backed cache, populated by initSettings() -- */

interface LiveCache {
  org: Layer;
  role: Layer;
  user: Layer;
  audit: SettingsAuditEntry[];
}

let live: LiveCache | null = null;
let liveLoad: Promise<void> | null = null;

function emptyLiveCache(): LiveCache {
  return { org: {}, role: {}, user: {}, audit: [] };
}

async function loadLive(): Promise<void> {
  const identity = await getIdentity();
  if (identity.problem || !identity.clinicId) { live = emptyLiveCache(); return; }

  const client = sb();
  const toLayer = (rows: { key: string; value: SettingValue }[] | null): Layer =>
    Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));

  const [orgRes, roleRes, userRes, auditRes] = await Promise.all([
    client.from("org_settings").select("key, value").eq("clinic_id", identity.clinicId),
    identity.appRole
      ? client.from("role_settings").select("key, value")
          .eq("clinic_id", identity.clinicId).eq("role", identity.appRole)
      : Promise.resolve({ data: [] }),
    client.from("user_settings").select("key, value").eq("user_id", identity.userId),
    client.from("settings_audit").select("actor, level, key, previous, next, at")
      .eq("clinic_id", identity.clinicId).order("at", { ascending: false }).limit(200),
  ]);

  live = {
    org: toLayer(orgRes.data as { key: string; value: SettingValue }[] | null),
    role: toLayer(roleRes.data as { key: string; value: SettingValue }[] | null),
    user: toLayer(userRes.data as { key: string; value: SettingValue }[] | null),
    // `who` only resolves for the caller's own changes: profiles has no
    // staff-wide read policy (self-select only), so another staff member's
    // name can't be looked up here without a directory feature this doesn't
    // have - same limitation already accepted for hub_audit_events (PR #46),
    // left blank there rather than guessed.
    audit: ((auditRes.data ?? []) as {
      actor: string; level: SettingScope; key: string;
      previous: SettingValue | null; next: SettingValue | null; at: string;
    }[]).map((r) => ({
      key: r.key,
      label: DEFS.get(r.key)?.label ?? r.key,
      level: r.level,
      previous: r.previous,
      next: r.next,
      who: r.actor === identity.userId ? "You" : "",
      at: r.at,
    })),
  };
}

/**
 * Load settings from Supabase once and cache them. No-op in preview, which is
 * already fully synchronous via localStorage. Call once near the app root
 * once identity is known (see apps/data and apps/employee's SessionProvider)
 * - this shares whatever getIdentity() request is already in flight rather
 * than starting a second one.
 */
export function initSettings(): Promise<void> {
  if (IS_PREVIEW) return Promise.resolve();
  if (!liveLoad) liveLoad = loadLive().then(() => notify());
  return liveLoad;
}

/** Drop the live cache and reload. Call after a sign-in, sign-out, or role
 *  change - mirrors @summit/session's refreshIdentity(). */
export function refreshSettings(): Promise<void> {
  live = null;
  liveLoad = null;
  return initSettings();
}

function read(scope: SettingScope): Layer {
  if (IS_PREVIEW) return readLocal(scope);
  return live?.[scope] ?? {};
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

/** Subscribe to any settings change (returns unsubscribe). */
export function onSettingsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export interface ResolvedSetting {
  def: SettingDef;
  org: SettingValue | null;
  role: SettingValue | null;
  user: SettingValue | null;
  effective: SettingValue;
  source: SettingScope | "default";
}

/** The inheritance chain, resolved: user (if allowed) → role → org → default. */
export function resolve(key: string): ResolvedSetting {
  const def = DEFS.get(key);
  if (!def) throw new Error(`Unknown setting ${key}`);
  const org = read("org")[key] ?? null;
  const role = read("role")[key] ?? null;
  const user = read("user")[key] ?? null;
  let effective: SettingValue = def.default;
  let source: ResolvedSetting["source"] = "default";
  if (org != null) { effective = org; source = "org"; }
  if (role != null && !def.locked) { effective = role; source = "role"; }
  if (user != null && !def.locked && (def.scope === "user" || def.userOverridable)) { effective = user; source = "user"; }
  return { def, org, role, user, effective, source };
}

export function getSetting(key: string): SettingValue {
  return resolve(key).effective;
}

const TABLE: Record<SettingScope, string> = {
  org: "org_settings", role: "role_settings", user: "user_settings",
};

interface WriteIdentity { clinicId: string | null; userId: string; appRole: AppRole | null }

function matchColumns(level: SettingScope, key: string, identity: WriteIdentity): Record<string, string> | null {
  if (level === "org") {
    if (!identity.clinicId) return null;
    return { clinic_id: identity.clinicId, key };
  }
  if (level === "role") {
    if (!identity.clinicId || !identity.appRole) return null;
    return { clinic_id: identity.clinicId, role: identity.appRole, key };
  }
  return { user_id: identity.userId, key };
}

/**
 * Write a setting. Every call feels synchronous: the in-memory cache (and
 * every onSettingsChange subscriber) updates immediately, before the network
 * round trip even starts. In live mode the Supabase write happens in the
 * background and rolls the optimistic update back on failure - a denied
 * write (wrong role, RLS) reverts the control to its real value instead of
 * silently pretending it worked. Preview mode is unchanged: fully
 * synchronous, localStorage only, nothing async happens under the hood.
 */
export async function setSetting(
  key: string, value: SettingValue | null, level: SettingScope, who = "You",
): Promise<void> {
  const def = DEFS.get(key);
  if (!def) throw new Error(`Unknown setting ${key}`);
  if (def.locked && level !== "org") throw new Error(`${def.label} is organization controlled.`);

  if (IS_PREVIEW) {
    const layer = readLocal(level);
    const previous = layer[key] ?? null;
    if (value == null) delete layer[key]; else layer[key] = value;
    writeLocal(level, layer);
    appendLocalAudit({ key, label: def.label, level, previous, next: value, who, at: new Date().toISOString() });
    notify();
    return;
  }

  await initSettings();
  const identity = await getIdentity();
  const match = matchColumns(level, key, identity);
  if (!match || !identity.clinicId) throw new Error(`Cannot save ${def.label}: identity is not resolved.`);

  if (!live) live = emptyLiveCache();
  const layer = live[level];
  const previous = layer[key] ?? null;
  if (value == null) delete layer[key]; else layer[key] = value;
  notify();

  const client = sb();
  try {
    if (value == null) {
      let query = client.from(TABLE[level]).delete();
      for (const [col, val] of Object.entries(match)) query = query.eq(col, val);
      const { error } = await query;
      if (error) throw error;
    } else {
      const payload: Record<string, unknown> = { ...match, value, updated_at: new Date().toISOString() };
      if (level !== "user") payload.updated_by = identity.userId;
      const { error } = await client.from(TABLE[level]).upsert(payload);
      if (error) throw error;
    }
  } catch (err) {
    if (previous == null) delete layer[key]; else layer[key] = previous;
    notify();
    console.error(`Failed to save ${def.label}:`, err);
    throw err;
  }

  const auditEntry: SettingsAuditEntry = {
    key, label: def.label, level, previous, next: value, who: "You", at: new Date().toISOString(),
  };
  live.audit.unshift(auditEntry);
  notify();
  // Best-effort: a failed audit write shouldn't undo a setting that saved
  // successfully. RLS requires actor = auth.uid(), which this always is, so
  // a rejection here would mean something is genuinely wrong, worth logging.
  void client.from("settings_audit").insert({
    clinic_id: identity.clinicId, actor: identity.userId, level, key, previous, next: value,
  }).then(({ error }) => { if (error) console.error("Failed to record settings audit entry:", error); });
}

export function readAudit(): SettingsAuditEntry[] {
  if (IS_PREVIEW) return readLocalAudit();
  return live?.audit ?? [];
}

/** Restore the value a change replaced (change history → Restore Previous Setting). */
export function restore(entry: SettingsAuditEntry, who = "You"): Promise<void> {
  return setSetting(entry.key, entry.previous, entry.level, who);
}

/* ---- terminology helper -------------------------------------------------------- */

/** The organization's word for a Summit concept ("client" → "Learner"). */
export function term(name: keyof typeof TERMINOLOGY_DEFAULTS | string): string {
  const def = DEFS.get(`terminology.${name}`);
  if (!def) return String(name);
  return String(resolve(`terminology.${name}`).effective);
}

/** Pluralize the resolved term naively (Summit terms are simple nouns). */
export function terms(name: string): string {
  const t = term(name);
  return t.endsWith("s") ? t : `${t}s`;
}

/* ---- settings search ------------------------------------------------------------ */

export function searchSettings(query: string): SettingDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTINGS.filter((s) =>
    s.label.toLowerCase().includes(q)
    || s.section.includes(q)
    || (s.description ?? "").toLowerCase().includes(q)
    || (s.keywords ?? []).some((k) => k.includes(q)),
  ).slice(0, 12);
}
