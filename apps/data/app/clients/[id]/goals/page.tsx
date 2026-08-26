"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getPrograms } from "@/lib/data";
import { masteryCheck } from "@/lib/mastery";
import type { Program } from "@/lib/types";

/** Goals — the clinical view: domains, mastery progress, criterion status. */
export default function GoalsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [programs, setPrograms] = React.useState<Program[]>([]);

  React.useEffect(() => {
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  const byDomain = new Map<string, Program[]>();
  for (const p of programs) {
    const d = p.domain ?? "Other";
    byDomain.set(d, [...(byDomain.get(d) ?? []), p]);
  }

  return (
    <div>
      {[...byDomain.entries()].map(([domain, ps]) => (
        <React.Fragment key={domain}>
          <h2 className="section-title" style={{ marginTop: 18 }}>{domain}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ps.map((p) => {
              const mc = masteryCheck(p, null);
              const window = mc.window;
              return (
                <div key={p.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{p.name}</b>
                    <p className="sub" style={{ maxWidth: "60ch" }}>{p.operationalDefinition}</p>
                    <p className="trend" style={{ marginTop: 6 }}>Mastery: {p.masteryCriteria}</p>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <span className={`pill ${mc.met ? "good" : p.status === "mastered" ? "good" : "accent"}`}>
                      {mc.met ? "criterion met — confirm settings/people" : p.status}
                    </span>
                    <p className="trend" style={{ marginTop: 8 }}>
                      window: <b>{window.length ? window.join(" · ") : "—"}</b> vs {p.masteryPct}% × {p.masteryConsecutive}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      {!programs.length ? <p className="sub">No goals yet — add programming from the Programs tab.</p> : null}
    </div>
  );
}
