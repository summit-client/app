"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  MinusCircle,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { taskCategoryLabels } from "@/content/hub/onboarding";

export interface TaskVM {
  id: string;
  key: string;
  week: number;
  section: string;
  category: keyof typeof taskCategoryLabels;
  title: string;
  description: string | null;
  required: boolean;
  signoff: boolean;
  evidenceRequired: boolean;
  url: string | null;
  due: string | null; // ISO
  status: string;
  applicable: boolean;
  notes: string;
}

type Save = "idle" | "saving" | "saved" | "error";
type Row = { status: string; notes: string; save: Save };

const STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  NOT_STARTED: { label: "Not started", icon: Circle, cls: "text-muted-foreground" },
  IN_PROGRESS: { label: "In progress", icon: CircleDot, cls: "text-forest" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, cls: "text-forest" },
  AWAITING_SIGNOFF: { label: "Ready for sign-off", icon: Clock, cls: "text-ember-600" },
  NOT_APPLICABLE: { label: "Not applicable", icon: MinusCircle, cls: "text-muted-foreground" },
};

function fmtDue(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function OnboardingBoard({
  tasks,
  vscStatus,
  weekSubtitles,
}: {
  tasks: TaskVM[];
  vscStatus: string;
  weekSubtitles: Record<number, string>;
}) {
  const [rows, setRows] = React.useState<Record<string, Row>>(() =>
    Object.fromEntries(tasks.map((t) => [t.id, { status: t.status, notes: t.notes, save: "idle" as Save }])),
  );
  const [vsc, setVsc] = React.useState(vscStatus);
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const persist = React.useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    setRows((r) => ({ ...r, [taskId]: { ...r[taskId], save: "saving" } }));
    try {
      const res = await fetch("/api/hub/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setRows((r) => ({
          ...r,
          // sync status from server (authoritative), keep local notes to avoid clobbering typing
          [taskId]: { ...r[taskId], status: data.progress?.status ?? r[taskId].status, save: "saved" },
        }));
        setTimeout(
          () => setRows((r) => (r[taskId]?.save === "saved" ? { ...r, [taskId]: { ...r[taskId], save: "idle" } } : r)),
          1500,
        );
      } else {
        setRows((r) => ({ ...r, [taskId]: { ...r[taskId], save: "error" } }));
      }
    } catch {
      setRows((r) => ({ ...r, [taskId]: { ...r[taskId], save: "error" } }));
    }
  }, []);

  const setStatus = (taskId: string, status: string) => {
    setRows((r) => ({ ...r, [taskId]: { ...r[taskId], status } }));
    void persist(taskId, { status });
  };
  const setNotes = (taskId: string, notes: string) => {
    setRows((r) => ({ ...r, [taskId]: { ...r[taskId], notes } }));
    clearTimeout(timers.current[taskId]);
    timers.current[taskId] = setTimeout(() => void persist(taskId, { notes }), 800);
  };
  const retry = (taskId: string) => void persist(taskId, { status: rows[taskId].status, notes: rows[taskId].notes });

  // Progress, required + applicable only.
  const required = tasks.filter((t) => t.required);
  const applicableRequired = required.filter((t) => rows[t.id].status !== "NOT_APPLICABLE");
  const completed = applicableRequired.filter((t) => rows[t.id].status === "COMPLETED").length;
  const percent = applicableRequired.length ? Math.round((completed / applicableRequired.length) * 100) : 0;

  const anyError = Object.values(rows).some((r) => r.save === "error");
  const anySaving = Object.values(rows).some((r) => r.save === "saving");
  const anySaved = Object.values(rows).some((r) => r.save === "saved");

  // Group by week → section (preserve order).
  const weeks = Array.from(new Set(tasks.map((t) => t.week))).sort();

  return (
    <div className="space-y-6">
      {/* Progress + global save state */}
      <div className="sticky top-16 z-10 rounded-lg border border-border bg-card/95 p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {completed} of {applicableRequired.length} required items · {percent}%
          </p>
          <span aria-live="polite" className="text-xs font-medium">
            {anyError ? (
              <span className="text-ember-600">We couldn&apos;t save your latest changes.</span>
            ) : anySaving ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
              </span>
            ) : anySaved ? (
              <span className="text-forest">Saved ✓</span>
            ) : (
              <span className="text-muted-foreground">Changes save automatically</span>
            )}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="hub-bar-fill h-full rounded-full bg-forest transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* VSC gate */}
      {vsc === "CLEARED" ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/60 p-3 text-sm text-charcoal">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Vulnerable Sector Check cleared.
        </div>
      ) : (
        <VscBanner vsc={vsc} onChange={setVsc} />
      )}

      {weeks.map((week) => {
        const weekTasks = tasks.filter((t) => t.week === week);
        const sections = Array.from(new Set(weekTasks.map((t) => t.section)));
        return (
          <section key={week} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Week {week}</h2>
              {weekSubtitles[week] ? <p className="text-sm text-muted-foreground">{weekSubtitles[week]}</p> : null}
            </div>
            {sections.map((section) => (
              <div key={section} className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-3 px-1 text-sm font-semibold text-forest">{section}</h3>
                <ul className="space-y-2">
                  {weekTasks
                    .filter((t) => t.section === section)
                    .map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        row={rows[t.id]}
                        onStatus={setStatus}
                        onNotes={setNotes}
                        onRetry={retry}
                      />
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function VscBanner({ vsc, onChange }: { vsc: string; onChange: (s: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  const report = async (status: string) => {
    setBusy(true);
    onChange(status);
    try {
      await fetch("/api/hub/vsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(false);
    }
  };
  const label: Record<string, string> = {
    NOT_SUBMITTED: "Not submitted",
    APPLIED: "Applied",
    PENDING: "Pending",
    REQUIRES_FOLLOWUP: "Requires follow-up",
  };
  return (
    <div className="rounded-md border border-ember/30 bg-ember/5 p-4">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ember-600" aria-hidden />
        <div className="text-sm text-charcoal">
          <p className="font-medium">Vulnerable Sector Check</p>
          <p className="mt-0.5 text-muted-foreground">
            On-site client observation begins once your VSC is cleared. Until then, complete
            observation through sample videos. Your check is verified by the office.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status: {label[vsc] ?? "Not submitted"}</span>
        {vsc !== "REQUIRES_FOLLOWUP" ? (
          <>
            <span className="text-xs text-muted-foreground">· Update:</span>
            {(["APPLIED", "PENDING"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || vsc === s}
                onClick={() => report(s)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:border-forest hover:text-forest disabled:opacity-50"
              >
                {label[s]}
              </button>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  row,
  onStatus,
  onNotes,
  onRetry,
}: {
  task: TaskVM;
  row: Row;
  onStatus: (id: string, status: string) => void;
  onNotes: (id: string, notes: string) => void;
  onRetry: (id: string) => void;
}) {
  const meta = STATUS_META[row.status] ?? STATUS_META.NOT_STARTED;
  const Icon = meta.icon;
  const due = fmtDue(task.due);
  const overdue =
    task.due && row.status !== "COMPLETED" && row.status !== "NOT_APPLICABLE" && new Date(task.due) < new Date();

  const options = task.signoff
    ? ["NOT_STARTED", "IN_PROGRESS", "AWAITING_SIGNOFF", "NOT_APPLICABLE"]
    : ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"];
  if (!options.includes(row.status)) options.splice(options.length - 1, 0, row.status); // include admin-set COMPLETED

  return (
    <li className={cn("rounded-md border border-border p-3", row.status === "NOT_APPLICABLE" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <Icon
          className={cn("mt-0.5 h-5 w-5 shrink-0", meta.cls, row.status === "COMPLETED" && "hub-pop")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{task.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{taskCategoryLabels[task.category]}</span>
            {task.signoff ? (
              <span className="rounded bg-ember/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-ember-600">
                Supervisor sign-off
              </span>
            ) : null}
            {due ? <span className={cn(overdue && "font-medium text-ember-600")}>Due {due}</span> : null}
          </div>
          {task.description ? <p className="mt-1 text-sm text-muted-foreground">{task.description}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`status-${task.id}`}>
              Status for {task.title}
            </label>
            <select
              id={`status-${task.id}`}
              value={row.status}
              onChange={(e) => onStatus(task.id, e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {STATUS_META[o]?.label ?? o}
                </option>
              ))}
            </select>

            {task.url ? (
              <a
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-forest/30 px-2.5 py-1.5 text-xs font-medium text-forest hover:bg-forest/5"
              >
                Open training <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}

            {/* per-row save state */}
            <span aria-live="polite" className="text-xs">
              {row.save === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
              ) : row.save === "saved" ? (
                <span className="text-forest">Saved ✓</span>
              ) : row.save === "error" ? (
                <button type="button" onClick={() => onRetry(task.id)} className="font-medium text-ember-600 underline">
                  Try again
                </button>
              ) : null}
            </span>
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-forest">
              Notes{row.notes ? " (1)" : ""}
            </summary>
            <textarea
              value={row.notes}
              onChange={(e) => onNotes(task.id, e.target.value)}
              rows={2}
              maxLength={2000}
              aria-label={`Notes for ${task.title}`}
              placeholder="Add a note for yourself or your supervisor…"
              className="mt-2 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </details>
        </div>
      </div>
    </li>
  );
}
