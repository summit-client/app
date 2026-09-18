"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@summit/design/icons";

export type SidebarNavItem = { href: string; label: string; group?: string; icon?: IconName };

/**
 * The sidebar's own nav. It lives here rather than in app/layout.tsx purely
 * because knowing which screen you are on means reading the pathname, and
 * the layout is a Server Component. The markup is otherwise unchanged - the
 * active row's styling (`.nav-item[aria-current="page"]`) already ships in
 * @summit/design's components.css.
 */
export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();
  // "/" is a prefix of every route, so the Dashboard link has to match
  // exactly; every other link also stays marked on its own sub-routes.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav aria-label="My HR and My Documents">
      {items.map((n, i) => {
        const active = isActive(n.href);
        return (
          <React.Fragment key={n.href}>
            {n.group && n.group !== items[i - 1]?.group ? <span className="nav-group">{n.group}</span> : null}
            <Link
              href={n.href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon">{n.icon ? <Icon name={n.icon} size={15} /> : null}</span>
              <span>{n.label}</span>
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
