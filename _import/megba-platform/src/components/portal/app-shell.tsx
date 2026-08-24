"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, Search, Bell, Sparkles, ExternalLink } from "lucide-react";
import type { NavEntry } from "@/content/portal-admin";
import { CommandPalette } from "@/components/portal/command-palette";
import { AiPanel } from "@/components/portal/ai-panel";
import { cn } from "@/lib/utils";

/**
 * Portal application shell, shared by every role: persistent intent-based
 * sidebar, app top bar with global search / Command-K and an embedded AI
 * assistant, and a mobile drawer. Nav is data-driven per role.
 */
export function AppShell({
  roleLabel,
  nav,
  secondaryNav,
  title,
  active,
  onSelect,
  children,
}: {
  roleLabel: string;
  nav: NavEntry[];
  secondaryNav: NavEntry[];
  title: string;
  active: string;
  onSelect: (label: string) => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = (label: string) => {
    onSelect(label);
    setMobileOpen(false);
  };

  const initials = roleLabel
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const NavList = ({ entries }: { entries: NavEntry[] }) => (
    <ul className="space-y-0.5">
      {entries.map((n) => {
        const isActive = n.label === active;
        return (
          <li key={n.label}>
            <button
              type="button"
              onClick={() => select(n.label)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-forest text-primary-foreground"
                  : "text-charcoal/80 hover:bg-muted hover:text-forest",
              )}
            >
              <n.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
                    isActive ? "bg-white/20" : "bg-ember/10 text-ember-600",
                  )}
                >
                  {n.badge}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const SidebarInner = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link href="/" className="inline-flex items-center gap-2" aria-label="Mount Etna, back to site">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-megba.svg" alt="Mount Etna Global Behaviour Academy" className="h-8 w-auto" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-eyebrow text-muted-foreground">
          {roleLabel}
        </p>
        <NavList entries={nav} />
        <div className="my-3 border-t border-border" />
        <NavList entries={secondaryNav} />
      </div>
      <div className="border-t border-border p-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-forest"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Back to site
        </Link>
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
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-forest hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:flex"
              >
                <Search className="h-4 w-4" aria-hidden />
                <span>Search</span>
                <kbd className="rounded border border-border px-1 text-[0.65rem]">⌘K</kbd>
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="rounded-md p-2 text-forest hover:bg-muted sm:hidden"
              >
                <Search className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="relative rounded-md p-2 text-forest hover:bg-muted"
              >
                <Bell className="h-5 w-5" aria-hidden />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ember" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-forest-700"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Ask AI</span>
              </button>
              <span
                className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-forest"
                aria-hidden
              >
                {initials}
              </span>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-charcoal/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-card shadow-lift">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-2 text-forest hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarInner />
          </div>
        </div>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navEntries={[...nav, ...secondaryNav]}
        onNavigate={select}
      />
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
