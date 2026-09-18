"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSetting, onSettingsChange, resolve, term, terms } from "@summit/settings";
import { applyLogoColors, type LogoTone } from "@summit/design";
import { Icon, type IconName } from "@summit/design/icons";
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
    { href: "/", label: "Today", id: "Today", icon: "dashboard", group: "Workspace" },
    { href: "/caseload", label: term("client") === "Client" ? "My Caseload" : `My ${terms("client")}`, id: "My Caseload", icon: "client", group: "Workspace" },
    { href: "/attention", label: "Attention", id: "Attention", icon: "attention", group: "Workspace" },
    { href: "/tasks", label: "My Tasks", id: "My Tasks", icon: "tasks", group: "Workspace" },
    ...(identity?.appRole === "clinician"
      ? []
      : [{ href: "/review", label: "Review Queue", id: "Review Queue", icon: "review", group: "Workspace" }]),

    // Families could send messages before there was anywhere to read them.
    { href: "/messages", label: "Family Messages", id: "Family Messages", icon: "message", group: "Clinic" },
    { href: "/supervision", label: "Supervision Notes", id: "Supervision Notes", icon: "notes", group: "Clinic" },
    { href: "/sharing", label: "What Families See", id: "What Families See", icon: "visible", group: "Clinic" },

    { href: "/goals", label: "Goal Bank", id: "Goal Bank", icon: "goal", group: "Library" },
    { href: "/lessons", label: "Lesson Plan Bank", id: "Lesson Plan Bank", icon: "lesson", group: "Library" },
  ];

  // Four new destinations arrived at once and went under the single
  // "Workspace" heading, which made a nine-item flat list where the first five
  // are today's work and the last four are not. Grouped by what a person is
  // actually doing: Workspace is my queue, Clinic is people, Library is
  // reference material I search rather than work through.
  //
  // Review Queue moves up into Workspace where it belongs - it is a personal
  // queue, and it was only last because it is conditionally rendered.
  const GROUPS = ["Workspace", "Clinic", "Library"] as const;
  const visible = NAV.filter((n) => !hidden.includes(n.id));

  // Which screen you are on. "/" would prefix-match every route, so it is
  // the one link that has to match exactly; every other link also lights up
  // for its own sub-routes (/settings/branding keeps Settings marked).
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav aria-label="Portal">
      {GROUPS.map((group) => {
        const items = visible.filter((n) => n.group === group);
        // A heading with nothing under it reads as a section that failed to
        // load. Hiding every item in a group hides its heading too.
        if (items.length === 0) return null;
        return (
          <React.Fragment key={group}>
            <span className="nav-group">{group}</span>
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item${isActive(n.href) ? " active" : ""}`}
                aria-current={isActive(n.href) ? "page" : undefined}
              >
                <span className="nav-icon"><Icon name={n.icon as IconName} size={15} /></span>
                <span>{n.label}</span>
              </Link>
            ))}
          </React.Fragment>
        );
      })}
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
