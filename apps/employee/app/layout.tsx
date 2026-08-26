import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import "@summit/design/tokens.css";
import "./app.css";
import { themeInitScript } from "@summit/design";
import { AppNav } from "@summit/nav";
import { SupportButton } from "@/components/support";

export const metadata: Metadata = {
  title: "MySummitHR",
  description: "Performance, professional development, credentials, documents and team collaboration.",
};

const NAV: { href: string; label: string; group?: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/scoreboard", label: "Scoreboard", group: "Growth" },
  { href: "/team", label: "My Team", group: "Growth" },
  { href: "/recognition", label: "Recognition", group: "Growth" },
  { href: "/career", label: "Career Progress", group: "Growth" },
  { href: "/pd", label: "Professional Development", group: "Professional" },
  { href: "/credentials", label: "My Credentials", group: "Professional" },
  { href: "/training", label: "Training", group: "Professional" },
  { href: "/certificates", label: "Certificates", group: "Professional" },
  { href: "/documents", label: "My Documents", group: "Records" },
  { href: "/onboarding", label: "My Onboarding", group: "Records" },
  { href: "/policies", label: "Policies & Handbook", group: "Records" },
  { href: "/time-off", label: "Time Off", group: "Records" },
  { href: "/profile", label: "My Profile", group: "Records" },
  { href: "/help", label: "Help", group: "Records" },
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/summit-badge.png" alt="" aria-hidden width={30} height={30} style={{ display: "block" }} />
              <span>
                My<b>Summit</b>HR
              </span>
            </div>
            <nav aria-label="My HR and My Documents">
              {NAV.map((n, i) => (
                <React.Fragment key={n.href}>
                  {n.group && n.group !== NAV[i - 1]?.group ? <span className="nav-group">{n.group}</span> : null}
                  <Link href={n.href} className="nav-item">{n.label}</Link>
                </React.Fragment>
              ))}
            </nav>
            <div className="sidebar-foot">
              <SupportButton />
              {process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" ? <span className="pill warn" style={{ marginTop: 8, display: "inline-block" }}>Preview data</span> : null}
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <span className="topbar-title">MySummitHR</span>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
