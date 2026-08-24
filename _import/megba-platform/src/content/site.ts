/**
 * Global site configuration + navigation.
 * Editable in the CMS (Super Admin → Settings / Navigation).
 */

export const org = {
  name: "Mount Etna Global Behaviour Academy",
  shortName: "MEGBA",
  legalName: "Mount Etna Global Behaviour Academy",
  tagline: "Behaviour Science Without Borders.",
  description:
    "Mount Etna Global Behaviour Academy equips schools, educators, families, technicians, and professionals with practical behaviour-science education, consultation, and multilingual digital tools grounded in Canadian standards of practice, shared internationally.",
  email: "megba@mountetnachildservices.com",
  phoneDisplay: "+1 (000) 000-0000",
  region: "Ontario, Canada (serving internationally)",
  social: {
    linkedin: "https://www.linkedin.com/",
    youtube: "https://www.youtube.com/",
  },
} as const;

/** The wider Mount Etna ecosystem. */
export const ecosystem = [
  {
    name: "Mount Etna Child & Family Services",
    role: "Direct clinical and family services",
    blurb:
      "Individualized clinical and family support delivered by regulated professionals.",
  },
  {
    name: "Embers for Access Foundation",
    role: "Access, subsidy, and community impact",
    blurb:
      "Removing barriers through subsidy, sponsored access, and community programs.",
  },
  {
    name: "Mount Etna Global Behaviour Academy",
    role: "Global education, training, consultation, and scale",
    blurb:
      "The global scale engine, education, professional training, school consultation, and platform delivery.",
    current: true,
  },
  {
    name: "SummitClient.io",
    role: "Digital infrastructure and delivery",
    blurb:
      "Learning, client management, reporting, and multilingual delivery infrastructure.",
  },
] as const;

/** Primary navigation (mega-menu). Groups render as columns. */
export type NavLink = { label: string; href: string; description?: string };
export type NavColumn = { heading: string; links: NavLink[] };
export type NavItem = {
  label: string;
  href?: string;
  columns?: NavColumn[];
  feature?: { title: string; body: string; href: string; cta: string };
};

export const mainNav: NavItem[] = [
  {
    label: "Academies",
    href: "/academies",
    columns: [
      {
        heading: "The five academies",
        links: [
          { label: "Student Academy", href: "/academies/student", description: "Regulation, social skills, independence" },
          { label: "Parent Academy", href: "/academies/parent", description: "Practical strategies for family life" },
          { label: "Teacher Academy", href: "/academies/teacher", description: "Classroom behaviour and inclusion" },
          { label: "Clinical Academy", href: "/academies/clinical", description: "CE, supervision, technician development" },
          { label: "Digital Academy", href: "/academies/digital", description: "Multilingual learning infrastructure" },
        ],
      },
      {
        heading: "Explore",
        links: [
          { label: "All academies", href: "/academies" },
          { label: "Course catalogue", href: "/courses" },
          { label: "Events & webinars", href: "/events" },
          { label: "Resources", href: "/resources" },
        ],
      },
    ],
    feature: {
      title: "Behaviour science, made practical",
      body: "Five academies, one multilingual platform, from classroom lessons to professional continuing education.",
      href: "/academies",
      cta: "Explore the academies",
    },
  },
  {
    label: "Services",
    columns: [
      {
        heading: "For schools & organizations",
        links: [
          { label: "International School Partnerships", href: "/services/school-partnerships" },
          { label: "School Behaviour Consultation", href: "/services/school-consultation" },
          { label: "Teacher & Staff Training", href: "/services/teacher-training" },
          { label: "Institutional Licensing", href: "/services/institutional-licensing" },
          { label: "White-Label Solutions", href: "/services/white-label" },
        ],
      },
      {
        heading: "For families & professionals",
        links: [
          { label: "Parent Coaching", href: "/services/parent-coaching" },
          { label: "IBT & Technician Training", href: "/services/technician-training" },
          { label: "RBT-Aligned Training Information", href: "/services/rbt-aligned" },
          { label: "Continuing Education", href: "/services/continuing-education" },
        ],
      },
    ],
  },
  {
    label: "Platform",
    columns: [
      {
        heading: "Technology",
        links: [
          { label: "Technology Platform", href: "/technology" },
          { label: "Multilingual Learning", href: "/technology/multilingual" },
          { label: "Course Catalogue", href: "/courses" },
        ],
      },
      {
        heading: "Access",
        links: [
          { label: "Request a Platform Demo", href: "/request-demo" },
          { label: "Sign in to the portal", href: "/portal" },
        ],
      },
    ],
  },
  {
    label: "Partners",
    columns: [
      {
        heading: "Partner with MEGBA",
        links: [
          { label: "Become a Partner", href: "/partners/become-a-partner" },
          { label: "Where We Practise", href: "/partners/regions" },
          { label: "Request a School Proposal", href: "/request-proposal" },
        ],
      },
      {
        heading: "Where we practise",
        links: [
          { label: "Canada (Ontario)", href: "/partners/regions/north-america" },
          { label: "Bulgaria (2027)", href: "/partners/regions/bulgaria" },
          { label: "Worldwide (virtual)", href: "/partners/regions/worldwide" },
        ],
      },
    ],
  },
  {
    label: "About",
    columns: [
      {
        heading: "Organization",
        links: [
          { label: "About MEGBA", href: "/about" },
          { label: "Our Global Mission", href: "/about/mission" },
          { label: "Our Team", href: "/about/team" },
          { label: "Credentials & Clinical Expertise", href: "/about/credentials" },
          { label: "The Mount Etna Ecosystem", href: "/about/ecosystem" },
        ],
      },
      {
        heading: "Insight & careers",
        links: [
          { label: "Articles & Insights", href: "/insights" },
          { label: "Case Studies", href: "/case-studies" },
          { label: "Careers", href: "/careers" },
          { label: "FAQ", href: "/faq" },
        ],
      },
    ],
  },
];

/** Footer navigation. */
export const footerNav: NavColumn[] = [
  {
    heading: "Academies",
    links: [
      { label: "Student Academy", href: "/academies/student" },
      { label: "Parent Academy", href: "/academies/parent" },
      { label: "Teacher Academy", href: "/academies/teacher" },
      { label: "Clinical Academy", href: "/academies/clinical" },
      { label: "Digital Academy", href: "/academies/digital" },
    ],
  },
  {
    heading: "Services",
    links: [
      { label: "School Partnerships", href: "/services/school-partnerships" },
      { label: "School Consultation", href: "/services/school-consultation" },
      { label: "Teacher Training", href: "/services/teacher-training" },
      { label: "Parent Coaching", href: "/services/parent-coaching" },
      { label: "Technician Training", href: "/services/technician-training" },
      { label: "Continuing Education", href: "/services/continuing-education" },
    ],
  },
  {
    heading: "Platform",
    links: [
      { label: "Technology", href: "/technology" },
      { label: "Multilingual Learning", href: "/technology/multilingual" },
      { label: "Institutional Licensing", href: "/services/institutional-licensing" },
      { label: "White-Label", href: "/services/white-label" },
      { label: "Course Catalogue", href: "/courses" },
    ],
  },
  {
    heading: "Organization",
    links: [
      { label: "About MEGBA", href: "/about" },
      { label: "Credentials", href: "/about/credentials" },
      { label: "The Ecosystem", href: "/about/ecosystem" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export const legalNav: NavLink[] = [
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Use", href: "/legal/terms" },
  { label: "Accessibility Statement", href: "/legal/accessibility" },
  { label: "Credential & Accreditation Disclaimer", href: "/legal/credential-disclaimer" },
  { label: "Cookie Policy", href: "/legal/cookies" },
  { label: "Safeguarding & Professional Conduct", href: "/legal/safeguarding" },
];

/** Home-page credibility strip. */
export const credibilityStrip = [
  "BCBA expertise",
  "Ontario Registered Behaviour Analysts",
  "International Behavior Analysts",
  "Multilingual platform",
  "School & organization partnerships",
  "Virtual & in-person delivery",
];

/** Audiences served (Who We Serve). */
export const audiences = [
  { label: "International schools", href: "/services/school-partnerships" },
  { label: "School administrators", href: "/services/school-consultation" },
  { label: "Teachers & educational assistants", href: "/academies/teacher" },
  { label: "Behaviour analysts", href: "/academies/clinical" },
  { label: "Behaviour technicians", href: "/services/technician-training" },
  { label: "Allied health professionals", href: "/services/continuing-education" },
  { label: "Parents & caregivers", href: "/academies/parent" },
  { label: "Children & youth", href: "/academies/student" },
  { label: "Nonprofit organizations", href: "/partners/become-a-partner" },
  { label: "Government & community partners", href: "/partners/become-a-partner" },
  { label: "Clinics & behaviour-service organizations", href: "/services/institutional-licensing" },
];

/**
 * Editable compliance disclaimer shown in credential-related contexts.
 * Administrators can update this from the CMS as standards change.
 */
export const complianceDisclaimer =
  "MEGBA displays only credentials, accreditations, CEUs, and training approvals that have been formally verified. Training described as “RBT-aligned” is designed to align with applicable behaviour-technician training requirements; eligibility, assessment, supervision, certification, and examination requirements are governed by the relevant credentialing body and may vary by jurisdiction. MEGBA does not use the phrase “BACB accredited” unless a specific program is formally eligible to do so.";

export const careDisclaimer =
  "MEGBA provides education, training, and consultation, and, where a jurisdiction recognizes BCBA or IBA credentialing or where families fund services privately, direct behaviour-analytic (ABA) services. Our education and training work within local legal, medical, and regulated clinical requirements rather than replacing them.";
