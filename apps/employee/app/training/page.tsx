"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import { BINDER_URL, HUB_COURSES, type CourseKind } from "@/lib/content";
import { dueDate, getProfile, getTraining, refreshDue, setCourseStatus } from "@/lib/hub";
import { MODULE_BY_COURSE, PASS_COUNT, type SummitModule } from "@/lib/modules";
import { BerryBurst } from "@/components/grove";

/**
 * Training. Numbered modules continue past the Autism Internet Modules:
 * Summit modules 8 to 13 open their resource, then a five-question competency
 * check gates the certificate at 4 of 5, the MEGBA standard. The clinical
 * competency program is open ended with no due date.
 */
export default function TrainingPage() {
  return (
    <HubGate>
      <TrainingScreen />
    </HubGate>
  );
}

function TrainingScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [quizFor, setQuizFor] = React.useState<string | null>(null);
  const [burst, setBurst] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading…</p>;

  const profile = getProfile();
  const training = getTraining();
  const recOf = (key: string) => training.find((t) => t.courseKey === key);
  const statusOf = (key: string) => {
    const rec = recOf(key);
    if (refreshDue(rec).due) return "REFRESH_DUE";
    return rec?.status ?? "NOT_STARTED";
  };

  const groups: { kind: CourseKind; title: string }[] = [
    { kind: "CLINICAL", title: "Clinical modules" },
    { kind: "COMPLIANCE", title: "Mandatory compliance" },
  ];

  const passed = (courseKey: string) => {
    setQuizFor(null);
    setBurst(true);
    setTimeout(() => setBurst(false), 2600);
    void setCourseStatus(courseKey, "COMPLETED").then(force);
  };

  return (
    <div>
      <BerryBurst run={burst} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 className="h-page">Training</h1>
        <a href={BINDER_URL} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{ textDecoration: "none" }}>
          Open the digital binder ↗
        </a>
      </div>

      {groups.map((g) => (
        <React.Fragment key={g.kind}>
          <h2 className="section-title">{g.title}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {HUB_COURSES.filter((c) => c.kind === g.kind).map((c) => {
              const st = statusOf(c.key);
              const rec = recOf(c.key);
              const refresh = refreshDue(rec);
              const mod = MODULE_BY_COURSE.get(c.key);
              const due = c.deadlineBucket !== "CUSTOM" ? dueDate(profile.startDate, c.deadlineBucket) : null;
              const overdue = due != null && st !== "COMPLETED" && due < new Date().toISOString().slice(0, 10);
              return (
                <div key={c.key} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b>{c.title}</b>
                        <span className={`pill ${st === "COMPLETED" ? "good" : st === "REFRESH_DUE" ? "warn" : st === "IN_PROGRESS" ? "accent" : "neutral"}`}>
                          {st.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                      <p className="trend" style={{ marginTop: 6 }}>
                        {c.provider ?? (mod ? "Summit module · resource + competency check" : "Assigned by your supervisor")}
                        {due ? <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}> · due {due}</span> : null}
                        {c.key === "megba-clinical-competency" ? " · open ended, work at your pace" : null}
                      </p>
                      {rec?.completedAt && st === "COMPLETED" ? (
                        <p className="trend" style={{ marginTop: 2 }}>
                          Marked complete on {rec.completedAt.slice(0, 10)}{refresh.refreshOn ? ` · refreshes ${refresh.refreshOn}` : ""}
                        </p>
                      ) : null}
                      {st === "REFRESH_DUE" && rec?.completedAt ? (
                        <p className="trend" style={{ marginTop: 2, color: "var(--warn)" }}>
                          Completed {rec.completedAt.slice(0, 10)} · yearly refresh is due
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {c.externalUrl ? (
                        <a href={c.externalUrl} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{ textDecoration: "none" }}>
                          {mod ? `Open ${mod.resourceLabel} ↗` : c.key === "megba-clinical-competency" ? "Open training program" : "Open course ↗"}
                        </a>
                      ) : null}
                      {st !== "COMPLETED" ? (
                        mod ? (
                          <button className="btn" onClick={() => setQuizFor(quizFor === c.key ? null : c.key)}>
                            {quizFor === c.key ? "Close check" : "Competency check"}
                          </button>
                        ) : (
                          <button className="btn" onClick={() => void setCourseStatus(c.key, "COMPLETED").then(force)}>Mark complete</button>
                        )
                      ) : null}
                    </div>
                  </div>
                  {mod && quizFor === c.key && st !== "COMPLETED" ? (
                    <Quiz mod={mod} onPass={() => passed(c.key)} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Quiz({ mod, onPass }: { mod: SummitModule; onPass: () => void }) {
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [result, setResult] = React.useState<number | null>(null);

  const submit = () => {
    const score = mod.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
    setResult(score);
    if (score >= PASS_COUNT) onPass();
  };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <p className="trend">Pass: {PASS_COUNT} of {mod.questions.length} · certificate issues on pass</p>
      {mod.questions.map((q, i) => (
        <div key={i} style={{ marginTop: 12 }}>
          <b style={{ fontSize: "var(--text-sm)" }}>{i + 1}. {q.q}</b>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {q.options.map((o, j) => (
              <label key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="radio" name={`q-${mod.courseKey}-${i}`} checked={answers[i] === j}
                  onChange={() => setAnswers({ ...answers, [i]: j })} style={{ marginTop: 3 }} />
                <span style={result != null && j === q.answer ? { color: "var(--good)", fontWeight: 600 } : undefined}>{o}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={submit} disabled={Object.keys(answers).length < mod.questions.length}>
          Submit
        </button>
        {result != null ? (
          result >= PASS_COUNT
            ? <span className="pill good">{result} of {mod.questions.length}. Certificate issued.</span>
            : <span className="pill warn">{result} of {mod.questions.length}. Review the resource and try again.</span>
        ) : null}
      </div>
    </div>
  );
}
