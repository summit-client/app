"use client";

import * as React from "react";
import { HUB_DOCUMENTS } from "@/lib/content";

interface Upload { id: string; kind: "VSC" | "OTHER"; label: string; fileName: string; date: string }

/** My Documents: previews, plus your own uploads: the Vulnerable Sector Check
 * and anything else, labelled however you need. */
export default function DocumentsPage() {
  const [preview, setPreview] = React.useState<{ name: string; url: string } | null>(null);
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [otherLabel, setOtherLabel] = React.useState("");

  React.useEffect(() => {
    try { setUploads(JSON.parse(localStorage.getItem("summit-my-uploads") ?? "[]") as Upload[]); } catch { /* none */ }
  }, []);

  const addUpload = (kind: "VSC" | "OTHER", label: string, file: File | null) => {
    if (!file) return;
    const next = [{ id: `u-${Date.now().toString(36)}`, kind, label, fileName: file.name, date: new Date().toISOString().slice(0, 10) }, ...uploads];
    setUploads(next);
    localStorage.setItem("summit-my-uploads", JSON.stringify(next));
    if (kind === "OTHER") setOtherLabel("");
  };

  // Drive /view links embed via their /preview form; local PDFs embed directly.
  const embedUrl = (url: string) =>
    url.includes("drive.google.com") ? url.replace(/\/view.*$/, "/preview") : url;
  const canEmbed = (url: string) => url.endsWith(".pdf") || url.includes("drive.google.com/file/");

  return (
    <div>
      <h1 className="h-page">My Documents</h1>
      <p className="sub">The handbook, the onboarding checklist this hub is built from, and the shared team drive.</p>

      <h2 className="section-title">My uploads</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="up-vsc">Vulnerable Sector Check</label>
            <input id="up-vsc" type="file" accept="application/pdf,image/*" className="input" style={{ padding: 7 }}
              onChange={(e) => addUpload("VSC", "Vulnerable Sector Check", e.target.files?.[0] ?? null)} /></div>
          <span className="sub" style={{ marginTop: 0 }}>Verified by the office before observation begins.</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="up-label">Other document</label>
            <input id="up-label" className="input" placeholder="Label it, for example First Aid card" value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)} /></div>
          <div className="field"><label htmlFor="up-other">File</label>
            <input id="up-other" type="file" accept="application/pdf,image/*" className="input" style={{ padding: 7 }}
              disabled={!otherLabel.trim()}
              onChange={(e) => addUpload("OTHER", otherLabel.trim(), e.target.files?.[0] ?? null)} /></div>
        </div>
        {uploads.length ? (
          <div className="attn">
            {uploads.map((u) => (
              <div key={u.id}>
                <span>{u.label} <span className="trend">{u.fileName}</span></span>
                <span className="trend">{u.date} · {u.kind === "VSC" ? "awaiting office verification" : "on file"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <h2 className="section-title">Organization documents</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
