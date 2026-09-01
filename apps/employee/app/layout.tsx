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

/**
 * "MySummitHR" here, in the mobile topbar title below, and in the sidebar
 * brand-text div is this app's own product name hardcoded instead of read
 * from `org.name` (docs/context/product.md's multi-tenant-readiness item 8).
 * Deliberately NOT converted in this file - see apps/data's
 * `BLOCKED-data.md` ("Carried over — 'Summit Clinician' branding still
 * hardcoded"): this file is a Server Component, `@summit/settings`'s cache is
 * only ever populated client-side by initSettings() (CLAUDE.md's
 * packages/settings note), and a Server Component reading getSetting()
 * before that resolves would always render the settings registry's static
 * default, never the tenant's real value, and never update after hydration.
 * Converting only the client-renderable pieces (support.tsx's email subject
 * already is, being "use client") while leaving this file's title/topbar/
 * brand-name static would show two different names depending on which piece
 * of chrome someone is looking at - worse than the current uniform "MySummitHR"
 * everywhere. The real fix needs either a server-side org-settings read (no
 * such function exists in @summit/settings yet) or a client-only wrapper
 * around all three of title/topbar/brand-name together, same as apps/data's
 * open item - out of scope for an apps/employee-only change.
 */
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
  { href: "/payroll", label: "Payroll", icon: "◐", group: "Records" },
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
              {/* The real Summit mark. This was three flat <polygon> triangles
                  filled with --logo-1/2/3, a placeholder for an asset that did
                  not exist yet. 6.5 KB, transparent, and the same file the
                  marketing site's header uses, so the product and the site
                  finally show the same logo. width/height are explicit so the
                  sidebar does not shift while it loads. */}
              <img
                src="/summit-mark-64.png" alt="" width={28} height={28}
                className="brand-mark"
                style={{ display: "block", flexShrink: 0, width: 28, height: 28 }}
              />
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
