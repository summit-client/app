import type { LucideIcon } from "lucide-react";
import {
  Building2,
  GraduationCap,
  HeartHandshake,
  MonitorSmartphone,
  BadgeCheck,
  Users,
  Landmark,
  BookOpenCheck,
} from "lucide-react";

export type Service = {
  slug: string;
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  audience: string;
  summary: string;
  intro: string;
  offerings: string[];
  /** Optional second grouped list (e.g. course topics). */
  secondaryTitle?: string;
  secondary?: string[];
  note?: string;
  cta: { label: string; href: string };
};

export const services: Service[] = [
  {
    slug: "school-partnerships",
    title: "International School Partnerships",
    eyebrow: "For schools",
    icon: Building2,
    audience: "International, private, and curriculum schools worldwide",
    summary:
      "Flexible, long-term partnerships that bring behaviour-science capacity into your school community.",
    intro:
      "MEGBA partners with educational organizations to strengthen staff capacity, classroom systems, family collaboration, and student support. We bring a Canadian behaviour-science perspective, shared internationally, while adapting recommendations to each school's culture, curriculum, resources, and local requirements.",
    offerings: [
      "Annual institutional licensing",
      "Per-school licensing",
      "Per-student and per-family access",
      "Staff training packages",
      "Consulting retainers",
      "Live cohort delivery",
      "White-label academy portals",
      "Grant-supported and sponsored community access",
      "Train-the-trainer licensing",
      "Custom curriculum development",
    ],
    secondaryTitle: "Ideal for",
    secondary: [
      "International & English-medium schools",
      "Canadian, American, and British curriculum schools",
      "IB and IB-adjacent schools",
      "Universities and colleges",
      "Nonprofits, NGOs, and government agencies",
      "Clinics, early-learning centres, microschools",
    ],
    cta: { label: "Request a School Proposal", href: "/request-proposal" },
  },
  {
    slug: "school-consultation",
    title: "School Behaviour Consultation",
    eyebrow: "For schools",
    icon: Landmark,
    audience: "School leaders, learning-support teams, and classroom staff",
    summary:
      "Behaviour consultation grounded in Canadian standards of practice, shared internationally, collaborative, educational, and adapted to your context.",
    intro:
      "We work alongside your team to build behaviour-informed classrooms and school-wide systems. Consultation is collaborative and educational and does not replace local legal, medical, psychological, or regulated clinical requirements.",
    offerings: [
      "School-wide behaviour-support consultation",
      "Classroom observations",
      "Functional behaviour consultation",
      "Student-support planning",
      "Classroom systems reviews",
      "Inclusive education consultation",
      "Positive behaviour-support frameworks",
      "Consultation for complex classroom behaviour",
      "Data-collection system development",
      "Behaviour-support plan consultation",
      "Staff coaching and leadership consultation",
      "Parent-school collaboration and case conferencing",
      "Remote consultation across time zones",
      "On-site consultation for contracted partners",
      "Policy and procedure review",
      "Multi-tiered systems of support (MTSS)",
    ],
    note: "Services are collaborative and educational and do not replace local legal, medical, psychological, or regulated clinical requirements.",
    cta: { label: "Book a Consultation", href: "/book-consultation" },
  },
  {
    slug: "teacher-training",
    title: "Teacher & School Staff Training",
    eyebrow: "For educators",
    icon: GraduationCap,
    audience: "Teachers, EAs, administrators, counsellors, learning-support staff",
    summary:
      "Practical professional development, live, on-site, or self-paced, with coaching that makes it stick.",
    intro:
      "MEGBA helps educators understand why behaviour occurs, how environments influence learning, and how to teach meaningful replacement skills. Training is practical, respectful, and designed for the realities of busy classrooms.",
    offerings: [
      "Live virtual workshops",
      "On-site professional development",
      "Self-paced training",
      "School-wide implementation packages",
      "Leadership training",
      "Train-the-trainer programs",
      "Post-workshop coaching",
      "Certificates of completion",
      "Customized professional-development pathways",
    ],
    secondaryTitle: "Popular workshop topics",
    secondary: [
      "Behaviour is communication",
      "Foundations of reinforcement",
      "Preventing challenging behaviour",
      "Classroom antecedent strategies",
      "Teaching replacement skills",
      "Building predictable routines",
      "Supporting emotional regulation",
      "Neurodiversity-affirming practices",
      "Inclusive classroom management",
      "Functional behaviour assessment fundamentals",
      "Collecting useful classroom data",
      "Collaborating with parents & analysts",
      "De-escalation and prevention",
      "Ethical and respectful behaviour support",
      "Supporting transitions",
      "School refusal & attendance support",
      "Staff consistency & treatment integrity",
    ],
    cta: { label: "Request Staff Training", href: "/request-proposal" },
  },
  {
    slug: "parent-coaching",
    title: "Parent & Caregiver Coaching",
    eyebrow: "For families",
    icon: HeartHandshake,
    audience: "Parents, caregivers, and family members",
    summary:
      "Warm, jargon-free coaching that turns behaviour science into everyday family routines.",
    intro:
      "Our Parent Academy translates behaviour science into practical strategies caregivers can understand and use. Families can access live coaching, group programs, self-paced courses, and downloadable tools in plain, everyday language.",
    offerings: [
      "Individual parent coaching",
      "Group parent education",
      "School-family consultation",
      "Live virtual parent cohorts",
      "Self-paced learning",
      "Parent resource libraries",
      "Practical home routines & visual supports",
      "Coaching for communication, play, independence, and regulation",
    ],
    secondaryTitle: "Popular topics",
    secondary: [
      "Foundations of behaviour",
      "Reinforcement-based parenting",
      "Supporting communication",
      "Building routines",
      "Toileting readiness",
      "Sleep routines",
      "Mealtime support",
      "Emotional regulation",
      "Community participation",
      "Preparing for school",
      "Navigating school meetings",
      "Understanding behaviour-support plans",
      "Supporting sibling relationships",
      "Generalizing skills between school and home",
    ],
    cta: { label: "Start Parent Coaching", href: "/contact?topic=parent-coaching" },
  },
  {
    slug: "technician-training",
    title: "IBT & Behaviour-Technician Training",
    eyebrow: "For professionals",
    icon: BadgeCheck,
    audience: "Aspiring technicians, EAs, support staff, and clinic technicians",
    summary:
      "A structured pathway to foundational behaviour-technician competencies, with organization-level cohorts.",
    intro:
      "A dedicated training pathway for International Behavior Technician (IBT) preparation and foundational behaviour-support education, for entry-level staff, educational and learning-support assistants, direct-support professionals, and clinic technicians.",
    offerings: [
      "Modular online learning",
      "Knowledge checks & scenario-based learning",
      "Skills demonstrations",
      "Downloadable resources",
      "Supervisor dashboards & competency tracking",
      "Certificates of completion",
      "Live coaching options",
      "Organization-level cohort enrolment",
      "Multilingual, translation-ready delivery",
      "Progress reporting",
      "Renewal and continuing-learning pathways",
    ],
    note: "Eligibility, assessment, supervision, certification, and examination requirements are governed by the relevant credentialing body and may vary by jurisdiction.",
    cta: { label: "Join a Training Pathway", href: "/contact?topic=technician-training" },
  },
  {
    slug: "rbt-aligned",
    title: "RBT-Aligned Training Information",
    eyebrow: "For professionals",
    icon: BookOpenCheck,
    audience: "Prospective behaviour technicians and their supervisors",
    summary:
      "Editable, compliance-first information about behaviour-technician training aligned to applicable requirements.",
    intro:
      "MEGBA offers behaviour-technician education designed to align with applicable RBT / behaviour-technician training requirements, subject to current eligibility and jurisdictional rules. This page uses editable, compliance-reviewed language maintained in the CMS.",
    offerings: [
      "Modular curriculum designed to align with applicable behaviour-technician training requirements",
      "Foundational concepts, measurement, and assessment support",
      "Skill-acquisition and behaviour-reduction fundamentals",
      "Documentation and professional conduct",
      "Supervision-ready competency tracking",
    ],
    note: "This training is designed to align with applicable RBT or behaviour-technician training requirements, subject to current eligibility and jurisdictional rules. Certification and examination are governed by the relevant credentialing body. MEGBA does not represent this program as “BACB accredited” unless it is formally eligible to do so.",
    cta: { label: "Ask About Eligibility", href: "/contact?topic=rbt-aligned" },
  },
  {
    slug: "continuing-education",
    title: "Clinical & Professional Continuing Education",
    eyebrow: "For professionals",
    icon: Users,
    audience: "BCBAs, RBAs, IBAs, allied health, educators, counsellors",
    summary:
      "Continuing education and interdisciplinary learning for behaviour and allied-health professionals.",
    intro:
      "Continuing education for behaviour analysts and interdisciplinary teams, including psychologists, speech-language professionals, occupational therapists, social workers, educators, and school counsellors.",
    offerings: [
      "Continuing education",
      "Ethics",
      "Supervision",
      "Pediatric behaviour support",
      "Interdisciplinary collaboration",
      "Cultural responsiveness",
      "International practice",
      "School consultation",
      "Parent coaching",
      "Early intervention & naturalistic teaching",
      "Data-informed decision-making",
    ],
    note: "CEUs are offered only where a specific offering is approved and verified in the CMS.",
    cta: { label: "Browse CE Courses", href: "/courses?academy=clinical" },
  },
  {
    slug: "institutional-licensing",
    title: "Institutional Licensing",
    eyebrow: "For organizations",
    icon: MonitorSmartphone,
    audience: "Schools, networks, clinics, and NGOs",
    summary:
      "License the platform and academies for your whole organization, with dashboards and reporting.",
    intro:
      "Give your entire organization access to MEGBA's academies and platform. Assign training, track completion, and report on outcomes across sites, with flexible licensing that fits your size and budget.",
    offerings: [
      "Annual institutional licensing",
      "Per-school and per-seat models",
      "Bulk enrolment and cohort management",
      "Administrator & supervisor dashboards",
      "School-level and multi-site reporting",
      "Resource libraries and shared documents",
      "Automated reminders and certificates",
      "Single sign-on preparation",
      "Data exports and audit logs",
    ],
    cta: { label: "Request Licensing Options", href: "/request-proposal" },
  },
  {
    slug: "white-label",
    title: "White-Label Solutions",
    eyebrow: "For organizations",
    icon: MonitorSmartphone,
    audience: "Networks, clinics, and partner organizations",
    summary:
      "Deliver MEGBA learning under your own brand, on your own subdomain.",
    intro:
      "Run a branded academy for your organization or network. Configure your logo, colours, subdomain, languages, and content controls, while MEGBA maintains the underlying platform, courses, and multilingual infrastructure.",
    offerings: [
      "Custom branding (logo, colours, typography)",
      "Custom subdomain (academy.yourorg.org)",
      "Configurable language settings",
      "Organization-scoped content controls",
      "Branded certificates and emails",
      "Dedicated administrator portal",
      "Usage analytics and reporting",
    ],
    cta: { label: "Explore White-Label", href: "/request-demo" },
  },
];

export const getService = (slug: string) => services.find((s) => s.slug === slug);
