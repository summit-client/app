/** FAQs, testimonials, insights, case studies, events, mostly demo content. */

export type FAQ = { q: string; a: string; category: string };

export const faqs: FAQ[] = [
  {
    category: "General",
    q: "Does MEGBA provide clinical (ABA) services?",
    a: "Our core work is education, training, and consultation. Where a jurisdiction recognizes BCBA or IBA credentialing on its own, or where families choose to fund services privately, MEGBA can also provide direct behaviour-analytic (ABA) services. Where local law requires other regulated licensure, we work within those requirements rather than replacing them.",
  },
  {
    category: "General",
    q: "What does MEGBA focus on?",
    a: "We focus on training local professionals and teachers and building international capacity to deliver high-quality, neuroaffirming ABA services, so strong support stays in the community for the long term.",
  },
  {
    category: "General",
    q: "Where does MEGBA operate?",
    a: "We operate in Ontario, Canada, and are expanding to Bulgaria in 2027. We offer virtual services worldwide, along with in-person field visits.",
  },
  {
    category: "Schools",
    q: "How do school partnerships work?",
    a: "We offer flexible models, annual institutional licensing, per-school or per-seat access, consulting retainers, live cohorts, white-label portals, and custom curriculum. Start by requesting a school proposal and we'll tailor a plan to your context.",
  },
  {
    category: "Schools",
    q: "Do you deliver on-site?",
    a: "Yes, for contracted partners, alongside remote consultation across time zones. Many schools combine on-site workshops with ongoing virtual coaching.",
  },
  {
    category: "Credentials",
    q: "What credentials does the MEGBA team hold?",
    a: "Our team includes professionals holding credentials such as BCBA, Ontario Registered Behaviour Analysts (RBAs), International Behavior Analysts (IBAs), and International Behavior Technicians (IBTs). We present each credential accurately and distinctly, and display only verified credentials.",
  },
  {
    category: "Credentials",
    q: "Is your technician training an RBT certification?",
    a: "Our training is designed to align with applicable RBT / behaviour-technician training requirements, subject to current eligibility and jurisdictional rules. Certification and examination are governed by the relevant credentialing body. We do not describe a program as “BACB accredited” unless it is formally eligible.",
  },
  {
    category: "Platform",
    q: "How many languages do you work in?",
    a: "Our team speaks 7+ languages, and the platform is built to deliver in at least 10. Italian and Bulgarian are professionally reviewed (alongside English), and other languages are available through automatic translation while professional review is in progress.",
  },
  {
    category: "Platform",
    q: "Can we run training under our own brand?",
    a: "Yes. We offer white-label training delivered through SummitClient.io, our EMR and learning platform, with custom branding, a subdomain, configurable languages, and branded certificates. SummitClient.io is currently accepting beta testers.",
  },
  {
    category: "Privacy",
    q: "How is privacy handled?",
    a: "The platform is designed with privacy-conscious features, role-based access, consent records, audit logs, data-retention settings, and no public display of student information. It requires legal review before deployment in each jurisdiction; we do not claim automatic compliance with any specific law.",
  },
];

export const faqCategories = Array.from(new Set(faqs.map((f) => f.category)));

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  org: string;
  demo: true;
};

// Testimonials are published only once verified, with participant permission.
export const testimonials: Testimonial[] = [];

export type Insight = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readMinutes: number;
  author: string;
  demo: true;
  body: string[];
};

export const insights: Insight[] = [
  {
    slug: "behaviour-is-communication-in-practice",
    title: "Behaviour Is Communication, In Practice",
    excerpt:
      "What it really means to treat behaviour as communication, and three moves that change a classroom.",
    category: "Classroom practice",
    date: "2026-05-12",
    readMinutes: 6,
    author: "MEGBA Faculty",
    demo: true,
    body: [
      "When we say behaviour is communication, we mean that what a student does is telling us something about a need, a skill gap, or the environment around them.",
      "This article outlines three practical shifts: pause to read the function, adjust the antecedents, and teach a replacement skill that meets the same need more effectively.",
      "None of this replaces individualized clinical care, it is about building behaviour-informed classrooms where every adult responds consistently and respectfully.",
    ],
  },
  {
    slug: "building-behaviour-informed-schools",
    title: "Building Behaviour-Informed Schools",
    excerpt:
      "A multi-tiered approach to school-wide behaviour support that respects your curriculum and culture.",
    category: "School systems",
    date: "2026-04-02",
    readMinutes: 8,
    author: "MEGBA Faculty",
    demo: true,
    body: [
      "Behaviour-informed schools don't rely on a single expert, they build shared capacity across staff, families, and leadership.",
      "We walk through universal, targeted, and individualized supports, and how data-collection systems make the whole thing sustainable.",
      "The goal is capacity-building: systems and skills that remain after the consultation ends.",
    ],
  },
  {
    slug: "multilingual-learning-that-respects-context",
    title: "Multilingual Learning That Respects Context",
    excerpt:
      "Why professional review matters before content is called 'localized', and how MEGBA approaches it.",
    category: "Platform",
    date: "2026-03-08",
    readMinutes: 5,
    author: "MEGBA Faculty",
    demo: true,
    body: [
      "Machine translation is a starting point, not a finish line. Clinical and educational content needs professional review before it is represented as formally localized.",
      "We describe MEGBA's localization workflow: draft, professional review, cultural adaptation, and sign-off.",
      "Administrators control the enabled language list from the CMS, so the platform grows with each partner community.",
    ],
  },
];

export const getInsight = (slug: string) => insights.find((i) => i.slug === slug);

export type CaseStudy = {
  slug: string;
  title: string;
  region: string;
  audience: string;
  challenge: string;
  approach: string;
  outcome: string;
  demo: true;
};

// Case studies are published once outcomes are verified and partners consent.
export const caseStudies: CaseStudy[] = [];

export const getCaseStudy = (slug: string) => caseStudies.find((c) => c.slug === slug);

export type EventItem = {
  slug: string;
  title: string;
  type: "Webinar" | "Workshop" | "Info session";
  date: string;
  time: string;
  languages: string[];
  audience: string;
  summary: string;
  demo: true;
};

export const events: EventItem[] = [
  {
    slug: "webinar-behaviour-is-communication",
    title: "Webinar: Behaviour Is Communication",
    type: "Webinar",
    date: "2026-09-18",
    time: "16:00 UTC",
    languages: ["en", "fr"],
    audience: "Educators & families",
    summary: "A free introductory webinar on reading the function behind behaviour.",
    demo: true,
  },
  {
    slug: "workshop-classroom-behaviour-support",
    title: "Live Workshop: Foundations of Classroom Behaviour Support",
    type: "Workshop",
    date: "2026-10-02",
    time: "14:00 UTC",
    languages: ["en"],
    audience: "Teachers & EAs",
    summary: "A hands-on virtual workshop with practical, ready-to-use strategies.",
    demo: true,
  },
  {
    slug: "info-session-school-partnerships",
    title: "Info Session: International School Partnerships",
    type: "Info session",
    date: "2026-10-15",
    time: "13:00 UTC",
    languages: ["en", "es"],
    audience: "School leaders",
    summary: "Learn how MEGBA partnerships and licensing models work.",
    demo: true,
  },
];

export type ResourceItem = {
  title: string;
  type: "Guide" | "Checklist" | "Template" | "Visual support";
  audience: string;
  languages: string[];
  demo: true;
};

export const resources: ResourceItem[] = [
  { title: "Classroom Routine Starter Kit", type: "Template", audience: "Teachers", languages: ["en", "fr"], demo: true },
  { title: "Home Visual Supports Pack", type: "Visual support", audience: "Parents", languages: ["en", "es"], demo: true },
  { title: "ABC Data Collection Sheet", type: "Template", audience: "Educators", languages: ["en"], demo: true },
  { title: "Preparing for a School Meeting", type: "Guide", audience: "Parents", languages: ["en", "ro"], demo: true },
  { title: "Reinforcement Ideas Checklist", type: "Checklist", audience: "Educators", languages: ["en", "pl"], demo: true },
  { title: "Transition Support Guide", type: "Guide", audience: "Teachers & families", languages: ["en"], demo: true },
];
