import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import "@summit/design/tokens.css";
import "@summit/design/components.css";
import "@summit/design/motion.css";
import "./app.css";
import { themeInitScript } from "@summit/design";
import { PortalBar } from "@/components/portal-bar";
import { SupportButton } from "@/components/support";
import { SessionProvider } from "@/components/session-provider";

/**
 * Preview mode, double-gated — the flag AND a non-production build.
 *
 * This badge used to read `NEXT_PUBLIC_DEV_PREVIEW === "1"` on its own, which
 * is the exact shape CLAUDE.md warns about: a `NEXT_PUBLIC_` var bakes into the
 * bundle regardless of build mode, so one stray value in a production env file
 * put a "Preview data" badge on a portal that was showing real records. The
 * badge would have been lying in the more alarming direction — everything else
 * reads `@summit/session`'s IS_PREVIEW, which got its NODE_ENV check in
 * PR #87, so the data was real while the badge said otherwise.
 *
 * Duplicated here rather than imported because this is a Server Component and
 * `@summit/session` is `"use client"`. The condition is the one line, and it
 * matches that package's export exactly.
 */
const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

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
        <PortalBar activeKey="employee" />
        {/* Mobile sidebar drawer: a plain checkbox, so the toggle needs no
            "use client" in this Server Component. See the comment on
            .nav-toggle-input in @summit/design/components.css. */}
        <input type="checkbox" id="nav-toggle" className="nav-toggle-input" />
        <div className="mobile-topbar">
          <label htmlFor="nav-toggle" className="nav-toggle-btn" aria-label="Open menu">
            <span /><span /><span />
          </label>
          <span className="mobile-topbar-title">MySummitHR</span>
        </div>
        <label htmlFor="nav-toggle" className="nav-toggle-backdrop" aria-hidden="true" />
        <SessionProvider>
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
              {IS_PREVIEW ? <span className="pill warn" style={{ marginTop: 8, display: "inline-block" }}>Preview data</span> : null}
            </div>
          </aside>
          <div className="main">
            <main className="content">{children}</main>
          </div>
        </div>
        </SessionProvider>
      </body>
    </html>
  );
}
