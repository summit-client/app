import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import { SkipLink } from "@/components/layout/skip-link";
import { SiteHeader, SiteFooter } from "@/components/layout/site-chrome";
import { Providers } from "@/components/layout/providers";
import { AccessibilityPanel } from "@/components/layout/accessibility-panel";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { GoogleTranslate } from "@/components/layout/google-translate";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, buildMetadata } from "@/lib/seo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  ...buildMetadata(),
};

export const viewport: Viewport = {
  themeColor: "#1E3A2B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <JsonLd data={organizationJsonLd()} />
        <Providers>
          <SkipLink />
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
          <AccessibilityPanel />
          <CookieConsent />
          <GoogleTranslate />
        </Providers>
      </body>
    </html>
  );
}
