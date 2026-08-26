import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import "@summit/design/tokens.css";
import "./app.css";
import { themeInitScript } from "@summit/design";

export const metadata: Metadata = {
  title: "My HR / My Documents",
  description: "Performance, professional development, credentials, documents and team collaboration.",
};

const NAV: { href: string; label: string; group?: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/scorecard", label: "My Scorecard", group: "Growth" },
  { href: "/team", label: "My Team", group: "Growth" },
  { href: "/recognition", label: "Recognition", group: "Growth" },
  { href: "/career", label: "Career Progress", group: "Growth" },
  { href: "/pd", label: "Professional Development", group: "Professional" },
  { href: "/credentials", label: "My Credentials", group: "Professional" },
  { href: "/training", label: "Training", group: "Professional" },
  { href: "/certificates", label: "Certificates", group: "Professional" },
  { href: "/onboarding", label: "My Onboarding", group: "Professional" },
  { href: "/documents", label: "My Documents", group: "Records" },
  { href: "/policies", label: "Policies & Handbook", group: "Records" },
  { href: "/time-off", label: "Time Off", group: "Records" },
  { href: "/profile", label: "My Profile", group: "Records" },
  { href: "/admin", label: "Manager & Admin", group: "Manage" },
  { href: "/help", label: "Help", group: "Manage" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800&family=Public+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-mark" aria-hidden />
              <span>
                My <b>HR</b>
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
              {process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" ? <span className="pill warn">Preview data</span> : null}
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <span className="topbar-title">My HR / My Documents</span>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
