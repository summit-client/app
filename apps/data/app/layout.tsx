import type { Metadata } from "next";
import "@summit/design/tokens.css";
import "@summit/design/components.css";
import "@summit/design/motion.css";
import "./app.css";
import { themeInitScript } from "@summit/design";
import { PortalNav, SettingsEffects } from "@/components/portal-chrome";
import { PortalBar, SessionGate, SessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Summit Clinician",
  description: "Session data collection, programs and supervision for Summit clinics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <SettingsEffects />
        <SessionProvider>
          <PortalBar activeKey="clinician" settingsHref="/settings" />
          {/* Mobile sidebar drawer: a plain checkbox, so the toggle needs no
              "use client" in this Server Component. See the comment on
              .nav-toggle-input in @summit/design/components.css. */}
          <input type="checkbox" id="nav-toggle" className="nav-toggle-input" />
          <div className="mobile-topbar">
            <label htmlFor="nav-toggle" className="nav-toggle-btn" aria-label="Open menu">
              <span /><span /><span />
            </label>
            <span className="mobile-topbar-title">Summit Clinician</span>
          </div>
          <label htmlFor="nav-toggle" className="nav-toggle-backdrop" aria-hidden="true" />
          <div className="shell">
            <aside className="sidebar">
              <div className="brand">
                <svg className="brand-mark" viewBox="0 0 32 28" fill="none" aria-hidden>
                  <polygon points="16,2 26,22 6,22" fill="var(--logo-1)" opacity="0.9" />
                  <polygon points="8,8 16,22 0,22" fill="var(--logo-2)" opacity="0.85" />
                  <polygon points="24,8 32,22 16,22" fill="var(--logo-3)" opacity="0.8" />
                </svg>
                <div className="brand-text">
                  <div className="brand-name">Summit</div>
                  <div className="brand-sub">Clinician</div>
                </div>
              </div>
              <PortalNav />
              <div className="sidebar-foot">
                {process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" ? <span className="pill warn">Preview data</span> : null}
              </div>
            </aside>
            <div className="main">
              <main className="content"><SessionGate>{children}</SessionGate></main>
            </div>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
