"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { hubNav, hubAdminNav } from "@/content/hub/nav";
import { cn } from "@/lib/utils";

/**
 * Employee Hub application shell: calm, warm sidebar on desktop, a drawer on
 * mobile, and a top bar with the account + sign out. Nav is real links (server
 * routes); active state is derived from the path.
 */
export function HubShell({
  firstName,
  fullName,
  employeeNumber,
  role,
  children,
}: {
  firstName: string;
  fullName: string;
  employeeNumber: string;
  role: "EMPLOYEE" | "ADMIN";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const items = role === "ADMIN" ? [...hubNav, ...hubAdminNav] : hubNav;
  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (href: string) =>
    href === "/hub" ? pathname === "/hub" : pathname.startsWith(href);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/hub/logout", { method: "POST" });
    } finally {
      router.push("/hub/login");
      router.refresh();
    }
  };

  const Nav = () => (
    <nav className="flex-1 overflow-y-auto p-3" aria-label="Employee Hub">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-muted font-semibold text-forest"
                    : "text-charcoal/75 hover:bg-muted hover:text-forest",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const SidebarInner = () => (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <Link href="/hub" className="inline-flex items-center" aria-label="Mount Etna Employee Hub, home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-megba.svg" alt="Mount Etna" className="h-9 w-auto" />
        </Link>
        <p className="mt-1.5 text-xs text-muted-foreground">Employee Hub · Beta</p>
      </div>
      <Nav />
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-forest">
            {initials || "ME"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{employeeNumber}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-forest disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-card lg:block">
          <SidebarInner />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-forest hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-megba.svg" alt="Mount Etna" className="h-8 w-auto" />
            <span className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-sage-100 text-xs font-semibold text-forest">
              {initials || "ME"}
            </span>
          </header>

          <div id="hub-main" className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-charcoal/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-card shadow-lift">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-2 text-forest hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarInner />
          </div>
        </div>
      ) : null}
    </div>
  );
}
