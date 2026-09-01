"use client";

import * as React from "react";
import {
  getMyTasks, setTaskStatus, TASK_TYPE_LABEL,
  type ClinicianTask, type TaskType,
} from "@/lib/tasks";

const TYPE_PILL: Record<TaskType, string> = {
  sign_off: "warn", note_due: "danger", pd_requirement: "accent", other: "neutral",
};

function isOverdue(t: ClinicianTask): boolean {
  return t.status === "open" && !!t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
}

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<ClinicianTask[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showCompleted, setShowCompleted] = React.useState(false);

  const load = React.useCallback(() => {
    getMyTasks().then(setTasks).catch(() => setError("Could not load your tasks."));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function toggle(t: ClinicianTask) {
    setBusy(t.id);
    setError(null);
    const next = t.status === "completed" ? "open" : "completed";
    // optimistic — rolled back on failure
    setTasks((cur) => (cur ?? []).map((x) => (x.id === t.id ? { ...x, status: next, completedAt: next === "completed" ? new Date().toISOString() : null } : x)));
    try {
      await setTaskStatus(t.id, next);
    } catch {
      setError("Could not update that task — try again.");
      load();
    } finally {
      setBusy(null);
    }
  }

  const open = (tasks ?? []).filter((t) => t.status === "open");
  const completed = (tasks ?? []).filter((t) => t.status === "completed");
  const overdueCount = open.filter(isOverdue).length;

  const sortedOpen = [...open].sort((a, b) => {
    const ad = a.dueDate ?? "9999-99-99";
    const bd = b.dueDate ?? "9999-99-99";
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });

  return (
    <div>
      <h1 className="h-page">My Tasks</h1>
      <p className="sub">
        Sign-offs owed, notes due and PD requirements — yours only. Nothing here is a clinic-wide queue.
      </p>

      <div className="tiles" style={{ marginTop: 20 }}>
        <div className="card tile">
          <div className="n">{open.length}</div>
          <div className="l">Open</div>
        </div>
        <div className="card tile">
          <div className="n">{overdueCount}</div>
          <div className="l">Overdue</div>
        </div>
        <div className="card tile">
          <div className="n">{completed.length}</div>
          <div className="l">Completed</div>
        </div>
      </div>

      {error ? (
        <div className="card card-pad" style={{ marginTop: 16, borderColor: "var(--danger)" }}>
          <p className="sub" style={{ color: "var(--danger)" }}>{error}</p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {tasks === null ? <p className="sub">Loading your tasks…</p> : null}
        {tasks !== null && sortedOpen.length === 0 ? (
          <div className="card card-pad"><p className="sub">Nothing open — you&rsquo;re caught up.</p></div>
        ) : null}
        {sortedOpen.map((t) => (
          <TaskRow key={t.id} task={t} busy={busy === t.id} onToggle={() => toggle(t)} />
        ))}
      </div>

      {completed.length ? (
        <div style={{ marginTop: 24 }}>
          <button className="btn ghost" onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? "Hide" : "Show"} completed ({completed.length})
          </button>
          {showCompleted ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {completed.map((t) => (
                <TaskRow key={t.id} task={t} busy={busy === t.id} onToggle={() => toggle(t)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({ task, busy, onToggle }: { task: ClinicianTask; busy: boolean; onToggle: () => void }) {
  const done = task.status === "completed";
  const overdue = isOverdue(task);

  return (
    <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", opacity: done ? 0.7 : 1 }}>
      <div style={{ minWidth: 0, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={onToggle}
          aria-label={done ? "Mark as open" : "Mark as complete"}
          style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }}
        />
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`pill ${TYPE_PILL[task.taskType]}`}>{TASK_TYPE_LABEL[task.taskType]}</span>
            {overdue ? <span className="pill danger">Overdue</span> : null}
          </div>
          <p style={{ marginTop: 6, fontSize: "var(--text-sm)", fontWeight: 500, textDecoration: done ? "line-through" : "none" }}>
            {task.title}
          </p>
          {task.dueDate ? (
            <p className="sub" style={{ marginTop: 2 }}>
              {done ? "Was due" : "Due"} {task.dueDate}
            </p>
          ) : null}
        </div>
      </div>
      <button className="btn secondary" disabled={busy} onClick={onToggle}>
        {busy ? "Saving…" : done ? "Reopen" : "Mark complete"}
      </button>
    </div>
  );
}
