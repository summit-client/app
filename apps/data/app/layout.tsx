import type { Metadata } from "next";
import "@summit/design/tokens.css";
import "./app.css";
import Link from "next/link";
import { themeInitScript } from "@summit/design";
import { AppNav } from "@summit/nav";
import { PortalNav, SettingsEffects } from "@/components/portal-chrome";

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
        <AppNav activeKey="clinician" />
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-mark" aria-hidden />
              <span>
                Summit <b>Clinician</b>
              </span>
            </div>
            <PortalNav />
            <div className="sidebar-foot">
              {process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" ? <span className="pill warn">Preview data</span> : null}
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <span className="topbar-title">Clinician Portal</span>
              {/* Theme and accent live in Settings → Appearance & Branding */}
              <Link href="/settings/appearance" className="btn ghost" style={{ textDecoration: "none" }} aria-label="Appearance settings">
                Appearance
              </Link>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
