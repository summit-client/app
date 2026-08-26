"use client";

import * as React from "react";
import { HUB_COURSES, type CourseKind } from "@/lib/content";
import { dueDate, getProfile, getTraining, setCourseStatus } from "@/lib/hub";

/**
 * My Training — compliance and clinical courses with due dates derived from
 * the start date. Completing a course also completes its matching onboarding
 * task. The in-house Clinical Competency Training Program ships with this app.
 */
export default function TrainingPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading training…</p>;

  const profile = getProfile();
  const training = getTraining();
  const statusOf = (key: string) => training.find((t) => t.courseKey === key)?.status ?? "NOT_STARTED";

  const groups: { kind: CourseKind; title: string; blurb: string }[] = [
    { kind: "CLINICAL", title: "Clinical training", blurb: "The in-house competency program plus the Autism Internet Modules for Weeks 1–2." },
    { kind: "COMPLIANCE", title: "Mandatory compliance", blurb: "BrightHR / BrightSafe modules due within 14 days; additional items within 30 days." },
  ];

  return (
    <div>
      <h1 className="h-page">My Training</h1>
      <p className="sub">Marking a course complete also completes its matching onboarding item.</p>

      {groups.map((g) => (
        <React.Fragment key={g.kind}>
          <h2 className="section-title">{g.title}</h2>
          <p className="sub" style={{ marginTop: -8 }}>{g.blurb}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {HUB_COURSES.filter((c) => c.kind === g.kind).map((c) => {
              const st = statusOf(c.key);
              const due = c.deadlineBucket !== "CUSTOM" ? dueDate(profile.startDate, c.deadlineBucket) : null;
              const overdue = due != null && st !== "COMPLETED" && due < new Date().toISOString().slice(0, 10);
              return (
                <div key={c.key} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <b>{c.title}</b>
                      {c.category ? <span className="pill neutral">{c.category}</span> : null}
                      <span className={`pill ${st === "COMPLETED" ? "good" : st === "IN_PROGRESS" ? "accent" : "neutral"}`}>
                        {st.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <p className="trend" style={{ marginTop: 6 }}>
                      {c.provider ?? "Assigned by your supervisor"}
                      {due ? <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}> · due {due}</span> : null}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {c.externalUrl ? (
                      <a href={c.externalUrl} target={c.externalUrl.startsWith("/") ? "_blank" : "_blank"} rel="noopener noreferrer"
                        className="btn secondary" style={{ textDecoration: "none" }}>
                        {c.key === "megba-clinical-competency" ? "Open training program" : "Open course ↗"}
                      </a>
                    ) : null}
                    {st !== "COMPLETED" ? (
                      <>
                        {st === "NOT_STARTED" ? (
                          <button className="btn ghost" onClick={() => void setCourseStatus(c.key, "IN_PROGRESS").then(force)}>Start</button>
                        ) : null}
                        <button className="btn" onClick={() => void setCourseStatus(c.key, "COMPLETED").then(force)}>Mark complete</button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
