"use client";

import * as React from "react";
import { HUB_DOCUMENTS } from "@/lib/content";

/** My Documents — handbook, onboarding checklists and shared-drive launch cards. */
export default function DocumentsPage() {
  return (
    <div>
      <h1 className="h-page">My Documents</h1>
      <p className="sub">The handbook, the onboarding checklist this hub is built from, and the shared team drive.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {HUB_DOCUMENTS.map((d) => (
          <div key={d.name} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, maxWidth: "60ch" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>{d.name}</b>
                <span className="pill neutral">{d.kind}</span>
              </div>
              <p className="sub">{d.note}</p>
            </div>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{ textDecoration: "none", alignSelf: "center" }}>
              Open ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
