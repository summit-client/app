"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/**
 * The marketing header/footer are hidden on the app surfaces (/portal*, /hub*),
 * which provide their own application chrome (sidebar, top bar, command palette).
 */
function isAppShell(path: string | null) {
  return !!path && (path.startsWith("/portal") || path.startsWith("/hub"));
}

export function SiteHeader() {
  const pathname = usePathname();
  if (isAppShell(pathname)) return null;
  return <Header />;
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isAppShell(pathname)) return null;
  return <Footer />;
}
