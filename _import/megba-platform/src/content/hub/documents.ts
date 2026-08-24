/**
 * Mount Etna Employee Hub, documents & external sources (Beta 1).
 *
 * The "My Documents" section is intentionally simple for Beta 1: a small set of
 * links plus the native onboarding PDFs hosted in the portal. Every item can
 * point at a specific Google Drive file; where a specific file URL isn't known
 * yet it links to the shared Team Drive folder and an admin can paste the exact
 * link later. External items are labelled honestly (they open Drive / an
 * external system, they are not integrated).
 */

export type HubDocCategory =
  | "HANDBOOK"
  | "POLICY"
  | "TRAINING_RESOURCE"
  | "CERTIFICATE"
  | "ONBOARDING_REPORT"
  | "FORM";

export interface SeedDocument {
  key: string;
  title: string;
  category: HubDocCategory;
  description?: string;
  url: string;
  external: boolean; // true = opens Google Drive / another system
  native?: boolean; // true = file hosted in this portal
}

/** Shared Team Drive folder (source of truth for documents in Beta 1). */
export const driveFolderUrl =
  "https://drive.google.com/drive/folders/1ksWVzQTDVCvFu3DXIaeyJQbPFvCZYcxr?usp=drive_link";

export const hubDocuments: SeedDocument[] = [
  // Native, hosted-in-portal
  {
    key: "onboarding-checklist-2026",
    title: "New Team Member Onboarding Checklist (2026)",
    category: "ONBOARDING_REPORT",
    description: "The source checklist this digital onboarding is built from.",
    url: "/hub/docs/onboarding-checklist-2026.pdf",
    external: false,
    native: true,
  },
  {
    key: "onboarding-checklist",
    title: "New Team Member Onboarding Checklist",
    category: "ONBOARDING_REPORT",
    description: "Reference version of the onboarding checklist.",
    url: "/hub/docs/onboarding-checklist.pdf",
    external: false,
    native: true,
  },
  // Google Drive sources (link to a specific file once the admin sets it; folder for now)
  {
    key: "employee-handbook",
    title: "Employee Handbook",
    category: "HANDBOOK",
    description: "Code of conduct, PHIPA and confidentiality, incident reporting, and Chapter 12 acknowledgement.",
    url: driveFolderUrl,
    external: true,
  },
  {
    key: "policies",
    title: "Policies & Safeguarding",
    category: "POLICY",
    description: "Health and safety, safeguarding, and confidentiality essentials.",
    url: driveFolderUrl,
    external: true,
  },
  {
    key: "forms",
    title: "Forms",
    category: "FORM",
    description: "Onboarding and HR forms, including the Handbook Acknowledgement of Receipt.",
    url: driveFolderUrl,
    external: true,
  },
  {
    key: "visual-task-list",
    title: "BCBA Visual Task List & Training Guide",
    category: "TRAINING_RESOURCE",
    description:
      "MEGBA-branded visual guide to all 104 BCBA Test Content Outline tasks across the nine domains, one diagram per task, with worked clinical examples.",
    url: "/clinical/visual-task-list.html",
    external: false,
    native: true,
  },
  {
    key: "training-resources",
    title: "Training Resources",
    category: "TRAINING_RESOURCE",
    description: "Shared clinical and training reference materials.",
    url: driveFolderUrl,
    external: true,
  },
];

/** External systems the portal launches out to (not integrated in Beta 1). */
export interface LaunchCard {
  key: string;
  name: string;
  description: string;
  url?: string; // configurable; env/admin can set the real workspace URL
}

export const hubLaunchCards: LaunchCard[] = [
  { key: "team-drive", name: "Team Drive", description: "Shared documents, policies and forms in Google Drive.", url: driveFolderUrl },
  { key: "janeapp", name: "JaneApp", description: "Scheduling, client profiles, bookings and session notes." },
  { key: "abadesk", name: "ABADesk", description: "Sessions, targets, trials and clean data collection." },
  { key: "wagepoint", name: "Wagepoint", description: "Pay, pay schedule and timesheets." },
  { key: "megba", name: "MEGBA", description: "Clinical Academy learning and certificates." },
];

/** The four-pillar ecosystem, for the orientation card. */
export const hubEcosystemPillars = [
  { name: "Mount Etna", role: "Clinical" },
  { name: "Embers for Access Foundation", role: "Access" },
  { name: "MEGBA", role: "Scale" },
  { name: "SummitClient.io / IgniteOS", role: "Infrastructure" },
];
