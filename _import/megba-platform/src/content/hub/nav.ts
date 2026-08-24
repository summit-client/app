import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardCheck,
  GraduationCap,
  BookOpen,
  Award,
  TrendingUp,
  CalendarDays,
  FolderOpen,
  UserRound,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";

export interface HubNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const hubNav: HubNavItem[] = [
  { label: "Home", href: "/hub", icon: LayoutDashboard },
  { label: "My Onboarding", href: "/hub/onboarding", icon: ClipboardCheck },
  { label: "Training & Development", href: "/hub/training", icon: GraduationCap },
  { label: "MEGBA Learning", href: "/hub/megba", icon: BookOpen },
  { label: "My Certificates", href: "/hub/certificates", icon: Award },
  { label: "Professional Development", href: "/hub/pd", icon: TrendingUp },
  { label: "Time Off", href: "/hub/time-off", icon: CalendarDays },
  { label: "My Documents", href: "/hub/documents", icon: FolderOpen },
  { label: "My Profile", href: "/hub/profile", icon: UserRound },
  { label: "Help", href: "/hub/help", icon: LifeBuoy },
];

export const hubAdminNav: HubNavItem[] = [
  { label: "Admin", href: "/hub/admin", icon: ShieldCheck, adminOnly: true },
];
