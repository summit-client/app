/**
 * Credentials & expertise.
 *
 * COMPLIANCE: Only display credentials/approvals that MEGBA has formally
 * verified. Each entry carries a `verifiedOn` date (editable in the CMS). The
 * public UI can surface "verified" state and hide unverified claims.
 */
export type Credential = {
  abbr: string;
  name: string;
  description: string;
  verifiedOn: string | null; // ISO date or null (demo)
};

export const credentials: Credential[] = [
  {
    abbr: "BCBA",
    name: "Board Certified Behavior Analyst",
    description:
      "Graduate-level certification in behaviour analysis. MEGBA's team includes professionals holding BCBA certification.",
    verifiedOn: "2026-01-15",
  },
  {
    abbr: "RBA (Ontario)",
    name: "Registered Behaviour Analyst",
    description:
      "Behaviour analysts regulated in Ontario. Each credential is presented accurately and distinctly, credentials are not interchangeable.",
    verifiedOn: "2026-01-15",
  },
  {
    abbr: "IBA",
    name: "International Behavior Analyst",
    description:
      "Internationally oriented behaviour-analysis credential. MEGBA's current behaviour analysts include IBA-credentialed or IBA-affiliated professionals.",
    verifiedOn: "2026-01-15",
  },
  {
    abbr: "IBT",
    name: "International Behavior Technician",
    description:
      "Entry-level, internationally oriented behaviour-technician credential supported through MEGBA's training pathways.",
    verifiedOn: null,
  },
];

/**
 * Professional memberships & recognition.
 * COMPLIANCE: keep wording accurate, "member of", "affiliated with",
 * "supports … pathways". Do not overstate accreditation.
 */
export type Membership = {
  abbr: string;
  name: string;
  relationship: string;
  description: string;
};

export const memberships: Membership[] = [
  {
    abbr: "ABAI",
    name: "Association for Behavior Analysis International",
    relationship: "Member",
    description:
      "MEGBA is a member of ABAI, the leading international membership organization for the science and practice of behaviour analysis.",
  },
  {
    abbr: "IBAO",
    name: "International Behavior Analysis Organization",
    relationship: "Affiliated",
    description:
      "MEGBA is affiliated with the IBAO, supporting International Behavior Analyst (IBA) accreditation pathways for internationally oriented practitioners.",
  },
];

/** Short recognition statements used in credibility strips. */
export const recognition = [
  "IBA-accredited Registered Behaviour Analysts (RBAs) & BCBAs",
  "Member, Association for Behavior Analysis International (ABAI)",
  "Affiliated, International Behavior Analysis Organization (IBAO)",
  "Trained in PECS®, ESDM, and Triple P",
];

export const frameworks = [
  "Applied Behaviour Analysis",
  "Naturalistic Developmental Behavioural Interventions",
  "Early Start Denver Model (ESDM)",
  "Picture Exchange Communication System (PECS®)",
  "Triple P – Positive Parenting Program",
  "Functional Behaviour Assessment",
  "Positive behaviour support",
  "Reinforcement-based teaching",
  "Skill acquisition programming",
  "Communication development",
  "Social-emotional learning",
  "Emotional and self-regulation",
  "Parent-mediated intervention",
  "Classroom behaviour support",
  "Inclusive education",
  "Trauma-aware and culturally responsive practice",
  "Data collection and progress monitoring",
  "Staff performance support",
  "Behaviour Skills Training",
  "Crisis prevention and de-escalation principles",
  "Collaborative consultation with educators and allied professionals",
];
