export type Academy = {
  slug: string;
  name: string;
  audience: string;
  tagline: string;
  summary: string;
  focus: string[];
  delivery: string[];
  accent: "forest" | "ember" | "sage";
};

export const academies: Academy[] = [
  {
    slug: "student",
    name: "Student Academy",
    audience: "Children and youth",
    tagline: "Skills for regulation, connection, and independence.",
    summary:
      "Age-appropriate, strengths-based learning that helps students understand emotions, build social skills, and grow independence, delivered as classroom lessons, small-group work, and digital modules.",
    focus: [
      "Emotional regulation",
      "Social skills",
      "Self-advocacy",
      "Problem-solving",
      "Communication",
      "Independence",
      "Understanding emotions",
      "Flexible thinking",
      "Digital citizenship",
      "Classroom readiness",
      "Peer relationships",
    ],
    delivery: [
      "In-school curriculum",
      "Classroom lessons",
      "Small-group learning",
      "Digital modules",
      "School-wide universal programming",
    ],
    accent: "sage",
  },
  {
    slug: "parent",
    name: "Parent Academy",
    audience: "Parents, caregivers, and family members",
    tagline: "Practical support for everyday family life.",
    summary:
      "Behaviour science translated into strategies caregivers can understand and use, through live coaching, group programs, self-paced courses, and downloadable tools, in plain, everyday language.",
    focus: [
      "Practical behaviour strategies",
      "Communication",
      "Reinforcement-based parenting",
      "Regulation",
      "Routines",
      "Independence",
      "School collaboration",
      "Parent advocacy",
      "Home implementation",
    ],
    delivery: [
      "Live cohorts",
      "One-to-one coaching",
      "Group coaching",
      "Webinars",
      "Resource libraries",
      "Self-paced courses",
    ],
    accent: "ember",
  },
  {
    slug: "teacher",
    name: "Teacher Academy",
    audience: "Teachers, educational assistants, administrators, counsellors, and learning-support staff",
    tagline: "Training that works in real classrooms.",
    summary:
      "Help educators understand why behaviour occurs, how environments shape learning, and how to teach meaningful replacement skills, practical, respectful, and built for the realities of busy classrooms.",
    focus: [
      "Classroom behaviour",
      "Inclusion",
      "Prevention",
      "Functional assessment fundamentals",
      "Classroom data",
      "Student support",
      "Team collaboration",
      "Ethical practice",
      "School-wide systems",
    ],
    delivery: [
      "On-site workshops",
      "Virtual workshops",
      "Self-paced professional development",
      "Institutional professional-development plans",
      "Coaching and implementation support",
    ],
    accent: "forest",
  },
  {
    slug: "clinical",
    name: "Clinical Academy",
    audience: "Behaviour analysts, technicians, supervisors, and allied professionals",
    tagline: "Continuing education and supervision, done well.",
    summary:
      "Professional development for behaviour analysts and interdisciplinary teams, continuing education, supervision support, technician development, and pediatric behaviour support grounded in ethics and evidence.",
    focus: [
      "Continuing education",
      "Supervision",
      "Ethics",
      "Technician development",
      "Early intervention",
      "Parent coaching",
      "School consultation",
      "Interdisciplinary care",
      "Pediatric behaviour support",
    ],
    delivery: [
      "Live virtual cohorts",
      "Self-paced modules",
      "Professional learning communities",
      "Supervision-support tools",
      "Certificates and CEUs where approved",
    ],
    accent: "forest",
  },
  {
    slug: "digital",
    name: "Digital Academy",
    audience: "All learner groups and institutional partners",
    tagline: "One platform. Multiple languages. Global reach.",
    summary:
      "The multilingual infrastructure behind every academy, course delivery, progress tracking, certificates, reporting, organization dashboards, and white-label access in one environment.",
    focus: [
      "Course delivery",
      "Multilingual learning",
      "Progress tracking",
      "Certificate generation",
      "Reporting",
      "Organization dashboards",
      "White-label access",
      "Learner communication",
      "Resource libraries",
      "Subscription management",
    ],
    delivery: [
      "Web and mobile-responsive learning",
      "Institution-specific portals",
      "Custom subdomains",
      "Time-zone-aware scheduling",
      "Exportable reports",
    ],
    accent: "ember",
  },
];

export const getAcademy = (slug: string) => academies.find((a) => a.slug === slug);
