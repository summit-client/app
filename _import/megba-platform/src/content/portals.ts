import type { LucideIcon } from "lucide-react";
import {
  GraduationCap,
  Building2,
  ClipboardCheck,
  Briefcase,
  Network,
  ShieldAlert,
} from "lucide-react";

/**
 * Portal definitions for the scaffolded, role-based portals.
 *
 * These render as demonstration shells (no live auth/data in Phase 1). Phase 2+
 * wires Auth.js + Prisma + permission middleware (see middleware.ts and
 * prisma/schema.prisma). Feature lists mirror the specification so the
 * information architecture and role model are visible from day one.
 */
export type PortalStat = { label: string; value: string; hint?: string };
export type Portal = {
  slug: string;
  role: string;
  name: string;
  icon: LucideIcon;
  audience: string;
  summary: string;
  stats: PortalStat[];
  features: string[];
};

export const portals: Portal[] = [
  {
    slug: "learner",
    role: "LEARNER",
    name: "Learner Portal",
    icon: GraduationCap,
    audience: "Parents, teachers, technicians, clinicians, students (age-appropriate)",
    summary: "Your courses, progress, certificates, and live sessions in one place.",
    stats: [
      { label: "Courses in progress", value: "3" },
      { label: "Completed", value: "7" },
      { label: "Certificates", value: "4" },
      { label: "Upcoming sessions", value: "2" },
    ],
    features: [
      "Course dashboard & continue learning",
      "Course progress & knowledge checks",
      "Upcoming live sessions",
      "Downloads & saved resources",
      "Certificates",
      "Messages & support requests",
      "Language selection & accessibility preferences",
      "Profile & account settings",
    ],
  },
  {
    slug: "school",
    role: "SCHOOL_ADMIN",
    name: "School Partner Portal",
    icon: Building2,
    audience: "School administrators & learning-support leads",
    summary: "Manage licences, staff, cohorts, reporting, and consultations.",
    stats: [
      { label: "Active licences", value: "42" },
      { label: "Staff enrolled", value: "38" },
      { label: "Completion rate", value: "76%" },
      { label: "Open tickets", value: "1" },
    ],
    features: [
      "School overview & active licences",
      "Staff roster & (where applicable) family access",
      "Course assignment & cohort management",
      "Completion & certificate reports",
      "Consultation history & upcoming workshops",
      "Shared documents & implementation plans",
      "Resource library",
      "Invoice history & subscription status",
      "Support tickets & book a consultation",
      "School branding settings",
    ],
  },
  {
    slug: "supervisor",
    role: "SUPERVISOR",
    name: "Supervisor Portal",
    icon: ClipboardCheck,
    audience: "Behaviour analysts, supervisors, training managers",
    summary: "Track learners, competencies, observations, and supervision logs.",
    stats: [
      { label: "Assigned learners", value: "12" },
      { label: "Competencies tracked", value: "58" },
      { label: "Pending reviews", value: "5" },
      { label: "Cert-eligible", value: "3" },
    ],
    features: [
      "Assigned learners & training progress",
      "Competency checklists",
      "Observation records & feedback notes",
      "Supervision logs",
      "Knowledge-assessment results",
      "Exportable reports",
      "Certificate eligibility & renewal reminders",
      "Secure document uploads",
    ],
  },
  {
    slug: "consultant",
    role: "CONSULTANT",
    name: "Consultant Portal",
    icon: Briefcase,
    audience: "MEGBA consultants",
    summary: "Manage assigned schools, consultations, notes, and outcomes.",
    stats: [
      { label: "Assigned schools", value: "6" },
      { label: "Consultations (mo.)", value: "18" },
      { label: "Service hours", value: "64" },
      { label: "Follow-up tasks", value: "9" },
    ],
    features: [
      "Assigned schools & consultation calendar",
      "Case notes & observation forms",
      "Action plans & document sharing",
      "School communication",
      "Service-hour tracking",
      "Report templates",
      "Follow-up tasks & outcome tracking",
    ],
  },
  {
    slug: "organization",
    role: "ORG_ADMIN",
    name: "Organization Administrator Portal",
    icon: Network,
    audience: "Multi-site organizations & networks",
    summary: "Provision users, allocate licences, and report across sites.",
    stats: [
      { label: "Sites", value: "9" },
      { label: "Total seats", value: "310" },
      { label: "Allocated", value: "268" },
      { label: "Languages enabled", value: "6" },
    ],
    features: [
      "Multi-site management & user provisioning",
      "Bulk enrolment & licence allocation",
      "Billing & course assignment",
      "Reporting & data exports",
      "Custom branding & language settings",
      "Single sign-on preparation & API settings",
      "Audit logs",
    ],
  },
  {
    slug: "admin",
    role: "SUPER_ADMIN",
    name: "MEGBA Super Admin Portal",
    icon: ShieldAlert,
    audience: "MEGBA platform administrators",
    summary: "Full control of users, content, translations, compliance, and analytics.",
    stats: [
      { label: "Organizations", value: "24" },
      { label: "Courses", value: "16" },
      { label: "Pending approvals", value: "7" },
      { label: "Leads (mo.)", value: "53" },
    ],
    features: [
      "Full user, role & permission management",
      "Course builder & translation management",
      "Content approval workflows & credential-status controls",
      "Partner, consultation, subscription & licence management",
      "Invoice management & certificate templates",
      "Email-template & regional content controls",
      "Analytics dashboard & lead pipeline",
      "CMS: blog, events, form submissions",
      "Consent records, audit logs & data-retention controls",
    ],
  },
];

export const getPortal = (slug: string) => portals.find((p) => p.slug === slug);
