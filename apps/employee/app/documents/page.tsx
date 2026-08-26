"use client";

import * as React from "react";
import { HUB_DOCUMENTS } from "@/lib/content";

/** My Documents: handbook, onboarding checklists and shared-drive material,
 * opened as inline previews rather than downloads. */
export default function DocumentsPage() {
  const [preview, setPreview] = React.useState<{ name: string; url: string } | null>(null);

  // Drive /view links embed via their /preview form; local PDFs embed directly.
  const embedUrl = (url: string) =>
    url.includes("drive.google.com") ? url.replace(/\/view.*$/, "/preview") : url;
  const canEmbed = (url: string) => url.endsWith(".pdf") || url.includes("drive.google.com/file/");

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
            <div style={{ display: "flex", gap: 8, alignSelf: "center", flexWrap: "wrap" }}>
              {canEmbed(d.url) ? (
                <button className="btn" onClick={() => setPreview(preview?.name === d.name ? null : { name: d.name, url: embedUrl(d.url) })}>
                  {preview?.name === d.name ? "Close preview" : "Preview"}
                </button>
              ) : null}
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{ textDecoration: "none" }}>
                Open in new tab ↗
              </a>
            </div>
          </div>
        ))}
      </div>

      {preview ? (
        <div className="card" style={{ marginTop: 14, overflow: "hidden" }}>
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontSize: "var(--text-sm)" }}>{preview.name}</b>
            <button className="btn ghost" onClick={() => setPreview(null)}>Close</button>
          </div>
          <iframe src={preview.url} title={`Preview of ${preview.name}`} style={{ width: "100%", height: "72vh", border: 0, display: "block" }} />
        </div>
      ) : null}
    </div>
  );
}
