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
