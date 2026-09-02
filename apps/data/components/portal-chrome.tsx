"use client";

import * as React from "react";
import Link from "next/link";
import { getSetting, onSettingsChange, resolve, term, terms } from "@summit/settings";
import { applyLogoColors, type LogoTone } from "@summit/design";
import { useSession } from "@/components/session-provider";

/**
 * Client-side chrome that reads the central settings service: the sidebar nav
 * (terminology-aware, honours hidden modules) and the effect hook that applies
 * appearance/accessibility preferences to the document for every module.
 */

export function PortalNav() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [hidden, setHidden] = React.useState<string[]>([]);
  const { identity } = useSession();

  React.useEffect(() => {
    const read = () => {
      try { setHidden(JSON.parse(localStorage.getItem("summit-nav-hidden") ?? "[]") as string[]); } catch { /* default */ }
    };
    read();
    const off = onSettingsChange(() => { read(); force(); });
    const t = setInterval(read, 2000); // nav prefs are written by the Settings page in another part of the tree
    return () => { off(); clearInterval(t); };
  }, []);

  // Review Queue is a supervisor/admin action (countersigning) — see
  // app/review/page.tsx's own gate. Hiding the link for clinicians here is
  // just so they aren't invited to click into a dead end; it is not the
  // enforcement (the page-level check is), same distinction as the rest of
  // this app's role gating.
  const NAV = [
    { href: "/", label: "Today", id: "Today", icon: "▦" },
    { href: "/caseload", label: term("client") === "Client" ? "My Caseload" : `My ${terms("client")}`, id: "My Caseload", icon: "⊙" },
    { href: "/attention", label: "Attention", id: "Attention", icon: "◈" },
    { href: "/tasks", label: "My Tasks", id: "My Tasks", icon: "☑" },
    // Families could send messages before there was anywhere to read them.
    { href: "/messages", label: "Family Messages", id: "Family Messages", icon: "✉" },
    ...(identity?.appRole === "clinician" ? [] : [{ href: "/review", label: "Review Queue", id: "Review Queue", icon: "◎" }]),
  ];

  return (
    <nav aria-label="Portal">
      <span className="nav-group">Workspace</span>
      {NAV.filter((n) => !hidden.includes(n.id)).map((n) => (
        <Link key={n.href} href={n.href} className="nav-item">
          <span className="nav-icon" aria-hidden>{n.icon}</span>
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** appearance.logo1/2/3 → --logo-1/2/3. Only forwards a value when the
 *  clinic actually has an override row (source !== "default") — an org
 *  with none set must resolve exactly to tokens.css's static default, not
 *  a copy of it pushed inline (see applyLogoColors' comment for why). */
function overrideOnly(key: string): string | null {
  const r = resolve(key);
  return r.source === "default" ? null : String(r.effective);
}

/** Applies density, text size, accessibility and per-tenant logo colour
 * preferences to <html> so every module inherits them — one settings
 * source, zero per-module styling. */
export function SettingsEffects() {
  React.useEffect(() => {
    const apply = () => {
      const el = document.documentElement;
      el.setAttribute("data-density", String(getSetting("appearance.density")).toLowerCase());
      el.setAttribute("data-textsize", String(getSetting("a11y.textSize")).toLowerCase());
      el.toggleAttribute("data-reduce-motion", getSetting("a11y.reduceMotion") === true);
      el.toggleAttribute("data-line-spacing", getSetting("a11y.lineSpacing") === true);
      el.toggleAttribute("data-large-controls", getSetting("a11y.largerControls") === true || String(getSetting("run.tapSize")) === "large");
      el.toggleAttribute("data-focus-rings", getSetting("a11y.focusIndicators") === true);
      applyLogoColors({
        logo1: overrideOnly("appearance.logo1"),
        logo2: overrideOnly("appearance.logo2"),
        logo3: overrideOnly("appearance.logo3"),
      } satisfies Partial<Record<LogoTone, string | null>>);
    };
    apply();
    return onSettingsChange(apply);
  }, []);
  return null;
}

/** Terminology-aware label helper for client components. */
export function useTerm(): (name: string) => string {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onSettingsChange(() => force()), []);
  return term;
}
