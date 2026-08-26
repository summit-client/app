import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import "@summit/design/tokens.css";
import "@summit/design/components.css";
import "./app.css";
import { themeInitScript } from "@summit/design";
import { AppNav } from "@summit/nav";
import { SupportButton } from "@/components/support";

export const metadata: Metadata = {
  title: "MySummitHR",
  description: "Performance, professional development, credentials, documents and team collaboration.",
};

const NAV: { href: string; label: string; group?: string; icon?: string }[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/scoreboard", label: "Scoreboard", icon: "◈", group: "Growth" },
  { href: "/team", label: "My Team", icon: "◎", group: "Growth" },
  { href: "/recognition", label: "Recognition", icon: "✦", group: "Growth" },
  { href: "/career", label: "Career Progress", icon: "▲", group: "Growth" },
  { href: "/pd", label: "Professional Development", icon: "⊞", group: "Professional" },
  { href: "/credentials", label: "My Credentials", icon: "⊙", group: "Professional" },
  { href: "/training", label: "Training", icon: "◇", group: "Professional" },
  { href: "/certificates", label: "Certificates", icon: "❖", group: "Professional" },
  { href: "/documents", label: "My Documents", icon: "▤", group: "Records" },
  { href: "/onboarding", label: "My Onboarding", icon: "◉", group: "Records" },
  { href: "/policies", label: "Policies & Handbook", icon: "▣", group: "Records" },
  { href: "/time-off", label: "Time Off", icon: "◷", group: "Records" },
  { href: "/profile", label: "My Profile", icon: "⊕", group: "Records" },
  { href: "/help", label: "Help", icon: "?", group: "Records" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AppNav activeKey="employee" />
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <svg className="brand-mark" viewBox="0 0 32 28" fill="none" aria-hidden>
                <polygon points="16,2 26,22 6,22" fill="var(--logo-1)" opacity="0.9" />
                <polygon points="8,8 16,22 0,22" fill="var(--logo-2)" opacity="0.85" />
                <polygon points="24,8 32,22 16,22" fill="var(--logo-3)" opacity="0.8" />
              </svg>
              <div className="brand-text">
                <div className="brand-name">MySummitHR</div>
                <div className="brand-sub">Employee</div>
              </div>
            </div>
            <nav aria-label="My HR and My Documents">
              {NAV.map((n, i) => (
                <React.Fragment key={n.href}>
                  {n.group && n.group !== NAV[i - 1]?.group ? <span className="nav-group">{n.group}</span> : null}
                  <Link href={n.href} className="nav-item">
                    <span className="nav-icon" aria-hidden>{n.icon}</span>
                    <span>{n.label}</span>
                  </Link>
                </React.Fragment>
              ))}
            </nav>
            <div className="sidebar-foot">
              <SupportButton />
              {process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" ? <span className="pill warn" style={{ marginTop: 8, display: "inline-block" }}>Preview data</span> : null}
            </div>
          </aside>
          <div className="main">
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
