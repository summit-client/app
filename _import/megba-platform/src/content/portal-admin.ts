import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Languages,
  BadgeCheck,
  Building2,
  CalendarClock,
  Inbox,
  BarChart3,
  Sparkles,
  Settings,
  LifeBuoy,
} from "lucide-react";

/**
 * Demo data + navigation for the MEGBA super-admin command centre.
 * This is a high-fidelity prototype on illustrative data; Phase 2 wires it to
 * Auth.js + Prisma. Keep shapes stable so the swap is a data move.
 */

export type NavEntry = { label: string; href: string; icon: LucideIcon; badge?: number };

export const adminNavPrimary: NavEntry[] = [
  { label: "Dashboard", href: "/portal/admin", icon: LayoutDashboard },
  { label: "Users", href: "/portal/admin#users", icon: Users },
  { label: "Courses", href: "/portal/admin#courses", icon: BookOpen },
  { label: "Translations", href: "/portal/admin#translations", icon: Languages, badge: 3 },
  { label: "Approvals", href: "/portal/admin#approvals", icon: BadgeCheck, badge: 7 },
  { label: "Partners", href: "/portal/admin#partners", icon: Building2 },
  { label: "Consultations", href: "/portal/admin#consultations", icon: CalendarClock },
  { label: "Leads", href: "/portal/admin#leads", icon: Inbox, badge: 5 },
  { label: "Analytics", href: "/portal/admin#analytics", icon: BarChart3 },
  { label: "AI Assistant", href: "/portal/admin#ai", icon: Sparkles },
];

export const adminNavSecondary: NavEntry[] = [
  { label: "Settings", href: "/portal/admin#settings", icon: Settings },
  { label: "Help", href: "/portal/admin#help", icon: LifeBuoy },
];

/** Command-centre content. */
export type ActionItem = {
  id: string;
  title: string;
  meta: string;
  action: string;
  tone?: "default" | "urgent";
};

export const today: ActionItem[] = [
  { id: "t1", title: "7 content items awaiting approval", meta: "Courses & translations", action: "Review" },
  { id: "t2", title: "5 new partner leads", meta: "Since yesterday", action: "Open pipeline" },
  { id: "t3", title: "2 credential verifications due", meta: "BCBA, IBA", action: "Verify" },
];

export const priorities: ActionItem[] = [
  {
    id: "p1",
    title: "Approve “Ethical Behaviour Support in Schools”",
    meta: "Clinical Academy · submitted 2 days ago",
    action: "Approve",
  },
  {
    id: "p2",
    title: "Respond to Sofia International School proposal",
    meta: "Bulgaria · high intent",
    action: "Draft reply",
    tone: "urgent",
  },
  {
    id: "p3",
    title: "Sign off Bulgarian localization (native review)",
    meta: "12 strings pending",
    action: "Assign reviewer",
  },
];

export const alerts: ActionItem[] = [
  {
    id: "a1",
    title: "Bulgarian copy not yet native-reviewed",
    meta: "Shown as machine-assisted until signed off",
    action: "Resolve",
    tone: "urgent",
  },
  { id: "a2", title: "SummitClient.io beta: 4 orgs awaiting onboarding", meta: "White-label", action: "Onboard" },
];

export type UpcomingItem = { id: string; title: string; when: string; kind: string };
export const upcoming: UpcomingItem[] = [
  { id: "u1", title: "Webinar: Behaviour Is Communication", when: "Sep 18, 16:00 UTC", kind: "Webinar" },
  { id: "u2", title: "Teacher Academy cohort starts", when: "Oct 2", kind: "Cohort" },
  { id: "u3", title: "Info session: School Partnerships", when: "Oct 15", kind: "Info" },
];

export type Metric = { label: string; value: string; delta?: string; hero?: boolean };
export const metrics: Metric[] = [
  { label: "Active learners", value: "1,284", delta: "+8.2% MoM", hero: true },
  { label: "Course completion", value: "76%", delta: "+3 pts" },
  { label: "Partner orgs", value: "24", delta: "+2" },
  { label: "Pending approvals", value: "7", delta: "needs action" },
];

export const aiInsights: string[] = [
  "Completion in the Teacher Academy dips at Module 4, consider splitting it or adding a coaching touchpoint.",
  "Three Bulgaria leads went quiet after the proposal stage, a follow-up sequence could recover them.",
  "Italian is your fastest-growing locale this month, prioritize reviewing its remaining course strings.",
];

export type Activity = { who: string; what: string; when: string };
export const activity: Activity[] = [
  { who: "S. Bennett", what: "Published “Reinforcement in Everyday Teaching”", when: "2h ago" },
  { who: "System", what: "5 certificates issued (Technician Foundations)", when: "4h ago" },
  { who: "M. Novak", what: "Added partner: Plovdiv Learning Centre", when: "Yesterday" },
  { who: "L. Ferreira", what: "Approved 3 competency check-offs", when: "Yesterday" },
];

/** Quick create + AI actions surfaced in the command palette and top bar. */
export const quickCreate = [
  "New course",
  "Invite user",
  "Add partner",
  "New cohort",
  "Draft announcement",
];

export const aiActions = [
  "Summarize today",
  "Draft partner reply",
  "Find at-risk cohorts",
  "Explain a metric",
  "Prepare weekly report",
];
