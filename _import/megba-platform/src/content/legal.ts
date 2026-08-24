/**
 * Legal & policy page templates.
 *
 * TEMPLATE CONTENT, requires legal review before deployment in each
 * jurisdiction. MEGBA does not claim automatic compliance with PIPEDA, GDPR,
 * FERPA, COPPA, or provincial health-privacy legislation. These are editable
 * in the CMS.
 */
export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = {
  slug: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

const reviewNote =
  "This document is a template and requires review by qualified legal counsel before publication and deployment in each jurisdiction where MEGBA operates.";

export const legalDocs: LegalDoc[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    updated: "2026-08-01",
    intro:
      "MEGBA is committed to handling personal information responsibly. This platform is designed with privacy-conscious features; it does not claim automatic compliance with any specific privacy law.",
    sections: [
      { heading: "Scope & review", body: [reviewNote] },
      {
        heading: "Information we collect",
        body: [
          "Account and profile information provided by learners, staff, and organizations.",
          "Learning activity such as enrolment, progress, and assessment results.",
          "Communications, support requests, and consultation records where applicable.",
          "Technical data such as device and usage information, subject to your cookie choices.",
        ],
      },
      {
        heading: "How we use information",
        body: [
          "To deliver courses, consultation, certificates, and reporting.",
          "To administer accounts, licences, and organization access.",
          "To improve the platform and communicate about services you request.",
        ],
      },
      {
        heading: "Children & guardian consent",
        body: [
          "Where services involve minors, access is provided through schools or guardians with appropriate consent workflows. Student information is never displayed publicly.",
        ],
      },
      {
        heading: "Data sharing & processors",
        body: [
          "We use service providers (hosting, email, payments, analytics) under appropriate agreements. We do not sell personal information.",
        ],
      },
      {
        heading: "Your choices & rights",
        body: [
          "You may request access, correction, export, or deletion of your data, subject to legal and contractual retention requirements. Contact us to make a request.",
        ],
      },
      {
        heading: "Retention & security",
        body: [
          "Data-retention periods are configurable per organization and jurisdiction. We apply role-based access, least-privilege permissions, and audit logging.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Use",
    updated: "2026-08-01",
    intro:
      "These terms govern access to the MEGBA website and platform. By using the platform you agree to these terms.",
    sections: [
      { heading: "Scope & review", body: [reviewNote] },
      {
        heading: "Educational nature of services",
        body: [
          "MEGBA provides education, training, and consultation. Services do not constitute individualized clinical care and do not replace local legal, medical, psychological, or regulated clinical requirements.",
        ],
      },
      {
        heading: "Accounts & acceptable use",
        body: [
          "You are responsible for maintaining the confidentiality of your account and for activity under it. Do not misuse the platform or infringe others' rights.",
        ],
      },
      {
        heading: "Licences & payment",
        body: [
          "Institutional licences, subscriptions, and course purchases are governed by the applicable order or agreement.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "Course content and platform materials are owned by MEGBA or its licensors and may not be redistributed without permission.",
        ],
      },
      {
        heading: "Disclaimers & liability",
        body: [
          "The platform is provided on an 'as is' basis to the extent permitted by law. Specific limitations are set out in your governing agreement.",
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility Statement",
    updated: "2026-08-01",
    intro:
      "MEGBA aims to meet WCAG 2.2 AA wherever practical and to make learning accessible to the widest possible audience.",
    sections: [
      {
        heading: "Our commitment",
        body: [
          "We build with keyboard navigation, visible focus, semantic structure, screen-reader labels, captions and transcripts, reduced-motion support, and adjustable text and contrast.",
        ],
      },
      {
        heading: "Accessibility settings",
        body: [
          "An on-site accessibility panel lets you adjust text size, contrast, motion, reading width, and font spacing. Preferences are remembered on your device.",
        ],
      },
      {
        heading: "Ongoing work",
        body: [
          "Accessibility is continuous. If you encounter a barrier, please contact us and we will work to address it.",
        ],
      },
    ],
  },
  {
    slug: "credential-disclaimer",
    title: "Credential & Accreditation Disclaimer",
    updated: "2026-08-01",
    intro:
      "MEGBA presents credentials, approvals, CEUs, and training eligibility accurately and conservatively.",
    sections: [
      {
        heading: "Verified credentials only",
        body: [
          "We display only credentials, accreditations, CEUs, approved-provider statuses, and training approvals that have been formally verified by MEGBA.",
        ],
      },
      {
        heading: "Distinct credentials",
        body: [
          "Credentials such as BCBA, RBA (Ontario), IBA, and IBT are distinct and are not interchangeable. Each is presented accurately.",
        ],
      },
      {
        heading: "Accreditation language",
        body: [
          "We do not use the phrase “BACB accredited” unless a specific program is formally eligible to use that wording.",
        ],
      },
      {
        heading: "Training alignment",
        body: [
          "Training described as RBT-aligned is designed to align with applicable RBT / behaviour-technician training requirements, subject to current eligibility and jurisdictional rules. Eligibility, assessment, supervision, certification, and examination requirements are governed by the relevant credentialing body and may vary by jurisdiction.",
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    updated: "2026-08-01",
    intro:
      "This policy explains how MEGBA uses cookies and similar technologies, and how you can control them.",
    sections: [
      { heading: "Scope & review", body: [reviewNote] },
      {
        heading: "Types of cookies",
        body: [
          "Essential cookies required for the platform to function; and, only with your consent, analytics or preference cookies.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "You can accept only essential cookies or manage preferences at any time. We default to the most privacy-preserving option.",
        ],
      },
    ],
  },
  {
    slug: "safeguarding",
    title: "Safeguarding & Professional Conduct",
    updated: "2026-08-01",
    intro:
      "MEGBA is committed to the safety and dignity of children, youth, and vulnerable people across all services.",
    sections: [
      { heading: "Scope & review", body: [reviewNote] },
      {
        heading: "Our principles",
        body: [
          "We centre dignity, assent, least-restrictive practice, and cultural responsiveness. Staff and partners are expected to uphold professional and ethical standards.",
        ],
      },
      {
        heading: "Boundaries of service",
        body: [
          "MEGBA provides education, training, and consultation and maintains a clear distinction between education, consultation, and regulated clinical services.",
        ],
      },
      {
        heading: "Concerns & incident reporting",
        body: [
          "Concerns can be raised through our contact channels. An incident-reporting workflow is available to partners; serious safeguarding concerns should also be reported to the appropriate local authorities.",
        ],
      },
    ],
  },
];

export const getLegalDoc = (slug: string) => legalDocs.find((d) => d.slug === slug);
