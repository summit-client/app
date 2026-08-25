"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { searchSettings, SECTIONS } from "@summit/settings";

/**
 * Settings — the central configuration layer for the whole platform.
 * Two panels: section navigation with search on the left, clean forms on the
 * right. Every control declares whether it is an Organization Setting, a Role
 * Setting or a Personal Preference.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const results = searchSettings(q);
  const current = pathname.split("/")[2] ?? "general";

  const jump = (section: string, key: string) => {
    setQ("");
    router.push(`/settings/${section}#setting-${key.replace(/\./g, "-")}`);
  };

  return (
    <div className="settings-shell">
      <aside className="settings-nav" aria-label="Settings sections">
        <div style={{ position: "relative" }}>
          <input
            className="input" placeholder="Search settings…" aria-label="Search settings"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          {results.length ? (
            <div className="settings-results" role="listbox" aria-label="Matching settings">
              {results.map((r) => (
                <button key={r.key} role="option" aria-selected="false" className="settings-result" onClick={() => jump(r.section, r.key)}>
                  <b>{r.label}</b>
                  <span className="sub" style={{ marginTop: 0 }}>{SECTIONS.find((s) => s.slug === r.section)?.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <nav style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 1 }}>
          {SECTIONS.map((s) => (
            <Link key={s.slug} href={`/settings/${s.slug}`} className={`settings-link ${current === s.slug ? "active" : ""}`}
              aria-current={current === s.slug ? "page" : undefined}>
              {s.title}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="settings-body">{children}</div>
    </div>
  );
}
