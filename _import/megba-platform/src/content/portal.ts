import {
  LayoutDashboard,
  BookOpen,
  Video,
  Award,
  FileText,
  MessageSquare,
  Sparkles,
  Settings,
  LifeBuoy,
  Users,
  Layers,
  BarChart3,
  CalendarClock,
  CreditCard,
  ClipboardCheck,
  Eye,
  Briefcase,
  Network,
  KeyRound,
  Palette,
  Building2,
  Inbox,
  BadgeCheck,
  Languages,
} from "lucide-react";
import {
  type NavEntry,
  type ActionItem,
  type Metric,
  type UpcomingItem,
  type Activity,
  adminNavPrimary,
  adminNavSecondary,
  today as adminToday,
  priorities as adminPriorities,
  alerts as adminAlerts,
  upcoming as adminUpcoming,
  metrics as adminMetrics,
  aiInsights as adminInsights,
  activity as adminActivity,
} from "@/content/portal-admin";

/**
 * Per-role portal configuration. Every portal runs on the same app shell +
 * data-driven command-centre dashboard. Demo data now; Phase 2 wires live data.
 */
export type DashboardData = {
  greeting: string;
  metrics: Metric[];
  today: ActionItem[];
  priorities: ActionItem[];
  alerts: ActionItem[];
  upcoming: UpcomingItem[];
  insights: string[];
  activity: Activity[];
};

export type PortalConfig = {
  slug: string;
  name: string;
  roleLabel: string;
  title: string;
  nav: NavEntry[];
  secondaryNav: NavEntry[];
  dashboard: DashboardData;
};

const secondary: NavEntry[] = [
  { label: "Settings", href: "#settings", icon: Settings },
  { label: "Help", href: "#help", icon: LifeBuoy },
];

export const portalConfigs: Record<string, PortalConfig> = {
  admin: {
    slug: "admin",
    name: "MEGBA Super Admin",
    roleLabel: "Super admin",
    title: "Command centre",
    nav: adminNavPrimary,
    secondaryNav: adminNavSecondary,
    dashboard: {
      greeting: "Good to see you. Here is what needs your attention today.",
      metrics: adminMetrics,
      today: adminToday,
      priorities: adminPriorities,
      alerts: adminAlerts,
      upcoming: adminUpcoming,
      insights: adminInsights,
      activity: adminActivity,
    },
  },

  learner: {
    slug: "learner",
    name: "Learner Portal",
    roleLabel: "Learner",
    title: "My learning",
    nav: [
      { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
      { label: "My Courses", href: "#courses", icon: BookOpen, badge: 3 },
      { label: "Live Sessions", href: "#sessions", icon: Video },
      { label: "Certificates", href: "#certificates", icon: Award },
      { label: "Resources", href: "#resources", icon: FileText },
      { label: "Messages", href: "#messages", icon: MessageSquare },
      { label: "AI Assistant", href: "#ai", icon: Sparkles },
    ],
    secondaryNav: secondary,
    dashboard: {
      greeting: "Welcome back. Pick up where you left off.",
      metrics: [
        { label: "In progress", value: "3", hero: true, delta: "Behaviour Is Communication next" },
        { label: "Completed", value: "7" },
        { label: "Certificates", value: "4" },
        { label: "Hours learned", value: "21" },
      ],
      today: [
        { id: "l1", title: "Continue “Foundations of Classroom Behaviour Support”", meta: "42% complete", action: "Resume" },
        { id: "l2", title: "Knowledge check due", meta: "Reinforcement in Everyday Teaching", action: "Start" },
      ],
      priorities: [
        { id: "lp1", title: "Live session tomorrow", meta: "Parent Coaching Foundations, 16:00 UTC", action: "Add to calendar" },
        { id: "lp2", title: "Certificate ready to download", meta: "Behaviour Is Communication", action: "Download" },
      ],
      alerts: [],
      upcoming: [
        { id: "lu1", title: "Parent Coaching Foundations (live)", when: "Tomorrow, 16:00 UTC", kind: "Live" },
        { id: "lu2", title: "Cohort check-in", when: "Fri", kind: "Cohort" },
      ],
      insights: [
        "You learn most in the morning, we can nudge your next module then.",
        "One module left to finish the Teacher pathway certificate.",
      ],
      activity: [
        { who: "You", what: "Passed knowledge check (92%)", when: "2d ago" },
        { who: "You", what: "Completed “Behaviour Is Communication”", when: "5d ago" },
      ],
    },
  },

  school: {
    slug: "school",
    name: "School Partner Portal",
    roleLabel: "School admin",
    title: "School overview",
    nav: [
      { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
      { label: "Staff", href: "#staff", icon: Users },
      { label: "Cohorts", href: "#cohorts", icon: Layers },
      { label: "Courses", href: "#courses", icon: BookOpen },
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "Consultations", href: "#consultations", icon: CalendarClock },
      { label: "Resources", href: "#resources", icon: FileText },
      { label: "Billing", href: "#billing", icon: CreditCard },
      { label: "AI Assistant", href: "#ai", icon: Sparkles },
    ],
    secondaryNav: secondary,
    dashboard: {
      greeting: "Here is how your school is progressing.",
      metrics: [
        { label: "Completion rate", value: "76%", hero: true, delta: "+3 pts this term" },
        { label: "Staff enrolled", value: "38" },
        { label: "Active licences", value: "42" },
        { label: "Open tickets", value: "1" },
      ],
      today: [
        { id: "s1", title: "12 staff have not started their assigned course", meta: "Foundations of Classroom Behaviour Support", action: "Send reminder" },
        { id: "s2", title: "Consultation summary ready", meta: "Classroom systems review", action: "Open" },
      ],
      priorities: [
        { id: "sp1", title: "Assign the new term cohort", meta: "18 staff unassigned", action: "Assign", tone: "urgent" },
        { id: "sp2", title: "Renew licences before Sep 30", meta: "42 seats", action: "Review" },
      ],
      alerts: [
        { id: "sa1", title: "3 certificates awaiting your sign-off", meta: "Technician Foundations", action: "Review" },
      ],
      upcoming: [
        { id: "su1", title: "On-site workshop", when: "Oct 9", kind: "Workshop" },
        { id: "su2", title: "Coaching call with consultant", when: "Oct 14", kind: "Coaching" },
      ],
      insights: [
        "Completion dips for evening-shift staff, a self-paced option may help.",
        "Your strongest cohort finished 3 weeks early, consider advancing them.",
      ],
      activity: [
        { who: "A. Teacher", what: "Completed Module 3", when: "3h ago" },
        { who: "System", what: "Cohort B report generated", when: "Yesterday" },
      ],
    },
  },

  supervisor: {
    slug: "supervisor",
    name: "Supervisor Portal",
    roleLabel: "Supervisor",
    title: "Supervision",
    nav: [
      { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
      { label: "Learners", href: "#learners", icon: Users, badge: 12 },
      { label: "Competencies", href: "#competencies", icon: ClipboardCheck },
      { label: "Observations", href: "#observations", icon: Eye },
      { label: "Assessments", href: "#assessments", icon: BadgeCheck },
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "AI Assistant", href: "#ai", icon: Sparkles },
    ],
    secondaryNav: secondary,
    dashboard: {
      greeting: "Your supervisees and what needs review.",
      metrics: [
        { label: "Assigned learners", value: "12", hero: true, delta: "3 near certification" },
        { label: "Competencies tracked", value: "58" },
        { label: "Pending reviews", value: "5" },
        { label: "Observations (mo.)", value: "9" },
      ],
      today: [
        { id: "v1", title: "5 competency check-offs awaiting review", meta: "Across 3 learners", action: "Review" },
        { id: "v2", title: "Observation notes to finalize", meta: "L. Ferreira session", action: "Finalize" },
      ],
      priorities: [
        { id: "vp1", title: "Confirm certificate eligibility", meta: "3 learners ready", action: "Confirm" },
      ],
      alerts: [
        { id: "va1", title: "1 learner inactive for 14 days", meta: "May miss renewal window", action: "Reach out", tone: "urgent" },
      ],
      upcoming: [
        { id: "vu1", title: "Supervision block", when: "Thu, 15:00", kind: "Session" },
        { id: "vu2", title: "Competency review deadline", when: "Oct 20", kind: "Deadline" },
      ],
      insights: [
        "Two learners plateaued on data-collection skills, a shared BST session could help.",
      ],
      activity: [
        { who: "You", what: "Approved 3 competency check-offs", when: "Yesterday" },
        { who: "M. Novak", what: "Submitted observation form", when: "2d ago" },
      ],
    },
  },

  consultant: {
    slug: "consultant",
    name: "Consultant Portal",
    roleLabel: "Consultant",
    title: "My schools",
    nav: [
      { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
      { label: "Schools", href: "#schools", icon: Briefcase, badge: 6 },
      { label: "Calendar", href: "#calendar", icon: CalendarClock },
      { label: "Case Notes", href: "#notes", icon: FileText },
      { label: "Action Plans", href: "#plans", icon: ClipboardCheck },
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "AI Assistant", href: "#ai", icon: Sparkles },
    ],
    secondaryNav: secondary,
    dashboard: {
      greeting: "Your caseload and follow-ups.",
      metrics: [
        { label: "Assigned schools", value: "6", hero: true, delta: "2 new this month" },
        { label: "Consultations (mo.)", value: "18" },
        { label: "Service hours", value: "64" },
        { label: "Follow-up tasks", value: "9" },
      ],
      today: [
        { id: "c1", title: "3 case notes to write up", meta: "From this week's visits", action: "Write" },
        { id: "c2", title: "Action plan review due", meta: "Riverside International", action: "Open" },
      ],
      priorities: [
        { id: "cp1", title: "Prepare for tomorrow's classroom observation", meta: "Grade 3, complex behaviour", action: "Prepare", tone: "urgent" },
      ],
      alerts: [
        { id: "ca1", title: "2 follow-ups overdue", meta: "Sofia International, Plovdiv Centre", action: "Resolve" },
      ],
      upcoming: [
        { id: "cu1", title: "On-site observation", when: "Tomorrow, 10:00", kind: "On-site" },
        { id: "cu2", title: "Case conference", when: "Oct 12", kind: "Meeting" },
      ],
      insights: [
        "Two schools show the same antecedent pattern, a shared workshop could save hours.",
      ],
      activity: [
        { who: "You", what: "Logged 3 service hours", when: "Yesterday" },
        { who: "You", what: "Shared action plan with Riverside", when: "2d ago" },
      ],
    },
  },

  organization: {
    slug: "organization",
    name: "Organization Administrator",
    roleLabel: "Org admin",
    title: "Organization",
    nav: [
      { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
      { label: "Sites", href: "#sites", icon: Network, badge: 9 },
      { label: "Users", href: "#users", icon: Users },
      { label: "Licences", href: "#licences", icon: KeyRound },
      { label: "Billing", href: "#billing", icon: CreditCard },
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "Branding", href: "#branding", icon: Palette },
      { label: "AI Assistant", href: "#ai", icon: Sparkles },
    ],
    secondaryNav: secondary,
    dashboard: {
      greeting: "Your network at a glance.",
      metrics: [
        { label: "Seats allocated", value: "268 / 310", hero: true, delta: "86% utilization" },
        { label: "Sites", value: "9" },
        { label: "Completion", value: "72%" },
        { label: "Languages enabled", value: "6" },
      ],
      today: [
        { id: "o1", title: "42 unallocated seats", meta: "Across 3 sites", action: "Allocate" },
        { id: "o2", title: "Quarterly report ready", meta: "All sites", action: "Open" },
      ],
      priorities: [
        { id: "op1", title: "Approve new site onboarding", meta: "Plovdiv Learning Centre", action: "Approve" },
      ],
      alerts: [
        { id: "oa1", title: "Invoice overdue", meta: "Site 4, 12 days", action: "Resolve", tone: "urgent" },
      ],
      upcoming: [
        { id: "ou1", title: "Licence renewal", when: "Nov 1", kind: "Billing" },
        { id: "ou2", title: "Admin training", when: "Oct 18", kind: "Training" },
      ],
      insights: [
        "Site 7 has high enrolment but low completion, worth a check-in.",
        "White-label branding is unset for 2 sites, quick win for consistency.",
      ],
      activity: [
        { who: "System", what: "Bulk-enrolled 40 users (Site 2)", when: "4h ago" },
        { who: "K. Marchetti", what: "Updated branding for Site 1", when: "Yesterday" },
      ],
    },
  },
};

export const getPortalConfig = (slug: string) => portalConfigs[slug];
export const portalSlugs = Object.keys(portalConfigs);
