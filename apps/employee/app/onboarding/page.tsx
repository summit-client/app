"use client";

import * as React from "react";
import { CATEGORY_LABELS, HUB_COURSES, HUB_TASKS, WEEK_SUBTITLES, type HubTask } from "@/lib/content";
import {
  dueDate, getProfile, getProgress, onboardingProgress, saveProfile, updateTask,
  type TaskProgress, type TaskStatus, type VscStatus,
} from "@/lib/hub";

/**
 * My Onboarding — the two-week board, replicated from the Mount Etna hub:
 * week → section groups, five task states (sign-off tasks route through
 * Ready for sign-off), per-task notes with autosave, open-material links,
 * the VSC gate, and overdue highlighting against the 14-day window.
 */

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  AWAITING_SIGNOFF: "Ready for sign-off",
  NOT_APPLICABLE: "Not applicable",
};

export default function OnboardingPage() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  React.useEffect(() => setReady(true), []);

  if (!ready) return <p className="sub">Loading onboarding…</p>;

  const profile = getProfile();
  const progress = getProgress();
  const byKey = new Map(progress.map((p) => [p.taskKey, p]));
  const ob = onboardingProgress(progress);

  const setStatus = async (task: HubTask, status: TaskStatus) => {
    setSaveState("saving");
    await updateTask(task.key, { status });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
    force();
  };
  const setNotes = (task: HubTask, notes: string) => {
    clearTimeout(timers.current[task.key]);
    timers.current[task.key] = setTimeout(async () => {
      setSaveState("saving");
      await updateTask(task.key, { notes });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    }, 700);
  };

  const weeks = [1, 2] as const;

  return (
    <div>
      <h1 className="h-page">My Onboarding</h1>
      <p className="sub">
        Everything is due within <b>14 days of your start date</b>
        {profile.startDate ? <> — by <b>{dueDate(profile.startDate, "WITHIN_14_DAYS")}</b></> : null}.
        Progress counts required, applicable items only.
      </p>

      <div className="card hub-sticky" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: "var(--text-sm)" }}>{ob.completed} of {ob.applicable} required items · {ob.percent}%</b>
          <span className="trend" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Changes save automatically"}
          </span>
        </div>
        <div className="hub-progress" style={{ marginTop: 8 }}><div style={{ width: `${ob.percent}%` }} /></div>
      </div>

      <VscBanner status={profile.vscStatus} onChange={async (s) => { await saveProfile({ vscStatus: s }); force(); }} />

      {weeks.map((week) => {
        const weekTasks = HUB_TASKS.filter((t) => t.week === week);
        const sections = [...new Set(weekTasks.map((t) => t.section))];
        return (
          <React.Fragment key={week}>
            <h2 className="section-title">Week {week}</h2>
            <p className="sub" style={{ marginTop: -8 }}>{WEEK_SUBTITLES[week]}</p>
            {sections.map((section) => (
              <div key={section} className="card card-pad" style={{ marginTop: 12 }}>
                <b style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>{section}</b>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {weekTasks.filter((t) => t.section === section).map((t) => (
                    <TaskRow key={t.key} task={t} row={byKey.get(t.key)} startDate={profile.startDate}
                      onStatus={(s) => void setStatus(t, s)} onNotes={(n) => setNotes(t, n)} />
                  ))}
                </div>
              </div>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function VscBanner({ status, onChange }: { status: VscStatus; onChange: (s: VscStatus) => void }) {
  if (status === "CLEARED") {
    return (
      <div className="card card-pad hub-banner ok" style={{ marginTop: 12 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>Vulnerable Sector Check cleared.</b>
      </div>
    );
  }
  const label: Record<string, string> = {
    NOT_SUBMITTED: "Not submitted", APPLIED: "Applied", PENDING: "Pending", REQUIRES_FOLLOWUP: "Requires follow-up",
  };
  return (
    <div className="card card-pad hub-banner" style={{ marginTop: 12 }}>
      <b style={{ fontSize: "var(--text-sm)" }}>Vulnerable Sector Check</b>
      <p className="sub">
        On-site client observation begins once your VSC is cleared. Until then, complete observation through sample
        videos. Your check is verified by the office.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <span className="trend">Status: <b>{label[status]}</b></span>
        {status !== "REQUIRES_FOLLOWUP" ? (
          <>
            <span className="trend">· Update:</span>
            {(["APPLIED", "PENDING"] as const).map((s) => (
              <button key={s} className="mode-tab" disabled={status === s} onClick={() => onChange(s)}>{label[s]}</button>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function TaskRow({ task, row, startDate, onStatus, onNotes }: {
  task: HubTask;
  row: TaskProgress | undefined;
  startDate: string | null;
  onStatus: (s: TaskStatus) => void;
  onNotes: (n: string) => void;
}) {
  const status = row?.status ?? "NOT_STARTED";
  const due = dueDate(startDate, task.deadlineBucket);
  const overdue = due != null && status !== "COMPLETED" && status !== "NOT_APPLICABLE" && due < new Date().toISOString().slice(0, 10);
  const url = task.trainingUrl ?? HUB_COURSES.find((c) => c.key === task.courseKey)?.externalUrl ?? null;
  const options: TaskStatus[] = task.supervisorSignoffRequired
    ? ["NOT_STARTED", "IN_PROGRESS", "AWAITING_SIGNOFF", "NOT_APPLICABLE"]
    : ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"];
  if (!options.includes(status)) options.splice(options.length - 1, 0, status); // admin-set COMPLETED stays visible

  const dot = status === "COMPLETED" ? "done" : status === "IN_PROGRESS" ? "progress" : status === "AWAITING_SIGNOFF" ? "await" : "";

  return (
    <div className={`task-row ${status === "NOT_APPLICABLE" ? "na" : ""}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className={`task-dot ${dot}`} aria-hidden />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: "var(--text-sm)" }}>{task.title}</b>
          <div className="trend" style={{ marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{CATEGORY_LABELS[task.category]}</span>
            {task.supervisorSignoffRequired ? <span className="pill warn">Supervisor sign-off</span> : null}
            {task.required === false ? <span className="pill neutral">optional</span> : null}
            {task.evidenceRequired ? <span className="pill accent">evidence required</span> : null}
            {due ? <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>Due {due}</span> : null}
          </div>
          {task.description ? <p className="sub" style={{ marginTop: 4, maxWidth: "70ch" }}>{task.description}</p> : null}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <label className="sr-only" htmlFor={`st-${task.key}`}>Status for {task.title}</label>
            <select id={`st-${task.key}`} className="input" style={{ width: "auto", padding: "6px 8px" }}
              value={status} onChange={(e) => onStatus(e.target.value as TaskStatus)}>
              {options.map((o) => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
            </select>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>
                Open material ↗
              </a>
            ) : null}
          </div>

          <details style={{ marginTop: 8 }}>
            <summary className="trend" style={{ cursor: "pointer" }}>Notes{row?.notes ? " (1)" : ""}</summary>
            <textarea
              className="input" rows={2} maxLength={2000} defaultValue={row?.notes ?? ""}
              aria-label={`Notes for ${task.title}`} placeholder="Add a note for yourself or your supervisor…"
              style={{ marginTop: 6 }}
              onChange={(e) => onNotes(e.target.value)}
            />
          </details>
        </div>
      </div>
    </div>
  );
}
