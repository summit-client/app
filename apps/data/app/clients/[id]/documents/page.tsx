"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { IS_PREVIEW } from "@/lib/data";

const PREVIEW_DOCS = [
  { name: "Consent to service (signed)", date: "2026-01-12", kind: "Consent" },
  { name: "Individual treatment plan — Spring 2026", date: "2026-04-01", kind: "Treatment plan" },
  { name: "Behaviour support plan v2", date: "2026-05-19", kind: "BSP" },
  { name: "OAP funding confirmation", date: "2026-02-03", kind: "Funding" },
];

/** Documents — the client's file: consents, plans, funding letters. */
export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  void Number(params.id);
  const rows = IS_PREVIEW ? PREVIEW_DOCS : [];

  return (
    <div>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Document</th><th>Type</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.name}>
                <td><b>{d.name}</b></td>
                <td><span className="pill neutral">{d.kind}</span></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{d.date}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No documents on file yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
