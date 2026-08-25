"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { IS_PREVIEW } from "@/lib/data";

const PREVIEW_ASSESSMENTS = [
  { name: "VB-MAPP", date: "2026-06-14", by: "Jane Smith", summary: "Milestones 112/170; barriers elevated for instructional control and prompt dependency." },
  { name: "MOTAS — Meaningful Outcomes Treatment Assessment Scale", date: "2026-07-02", by: "Jane Smith", summary: "Family-priority domains: independent requesting, community outings, mealtime routines." },
  { name: "Vineland-3 (caregiver form)", date: "2026-03-20", by: "External — psychology", summary: "Adaptive composite 71; communication and daily living below age band." },
];

/** Assessments — structured assessment history feeding treatment-planning evidence. */
export default function AssessmentsPage() {
  const params = useParams<{ id: string }>();
  void Number(params.id);
  const rows = IS_PREVIEW ? PREVIEW_ASSESSMENTS : [];

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        Assessment results are provenance-tracked evidence: treatment-planning suggestions may cite them, always labelled by source.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {rows.map((a) => (
          <div key={a.name} className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{a.name}</b>
              <span className="sub" style={{ marginTop: 0 }}>{a.date} · {a.by}</span>
            </div>
            <p className="sub" style={{ marginTop: 6 }}>{a.summary}</p>
          </div>
        ))}
        {!rows.length ? (
          <div className="card card-pad"><p className="sub">No assessments recorded yet.</p></div>
        ) : null}
      </div>
    </div>
  );
}
