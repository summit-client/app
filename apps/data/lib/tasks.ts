"use client";

import { createBrowserClient } from "@supabase/ssr";
import { IS_PREVIEW } from "./data";

/**
 * The clinician's own worklist: sign-offs owed, notes due, PD requirements
 * coming due. Backed by `clinician_tasks` (migration 0035) — deliberately
 * NOT apps/employee's hub_task_progress/hub_pd_records, which are HR
 * onboarding-shaped (a fixed template keyed to a hire date), not clinical.
 *
 * This is a personal worklist, not a manager queue: every read/write here is
 * scoped to the signed-in clinician's own rows. RLS on `clinician_tasks`
 * enforces the same thing server-side (clinician_user_id = auth.uid()), so
 * there is nothing to gain from a client-side clinic-wide query even for an
 * admin/supervisor viewing this screen — it would come back empty per the
 * "RLS returns empty sets, not errors" trap, not because the query is wrong,
 * but because no such policy is granted. See migration 0035's own header.
 */

export type TaskType = "sign_off" | "note_due" | "pd_requirement" | "other";
export type TaskStatus = "open" | "completed" | "dismissed";

export interface ClinicianTask {
  id: string;
  taskType: TaskType;
  relatedId: string | null;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  sign_off: "Sign-off owed",
  note_due: "Note due",
  pd_requirement: "PD requirement",
  other: "Other",
};
export { TASK_TYPE_LABEL };

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/* ---- preview fixtures — no real clinic data, exercises every task_type and
   an overdue vs. upcoming due date --------------------------------------- */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let previewTasks: ClinicianTask[] = [
  {
    id: "pt-1", taskType: "note_due", relatedId: "9001",
    title: "Session note due — Arjun S., direct therapy (today, 9:00 AM)",
    status: "open", dueDate: daysFromToday(0), completedAt: null, createdAt: daysFromToday(0),
  },
  {
    id: "pt-2", taskType: "sign_off", relatedId: "sn-204",
    title: "Countersign Maya T.'s session note (awaiting your review)",
    status: "open", dueDate: daysFromToday(-1), completedAt: null, createdAt: daysFromToday(-2),
  },
  {
    id: "pt-3", taskType: "pd_requirement", relatedId: null,
    title: "Log 4 BACB CEUs for this certification cycle",
    status: "open", dueDate: daysFromToday(21), completedAt: null, createdAt: daysFromToday(-30),
  },
  {
    id: "pt-4", taskType: "note_due", relatedId: "9003",
    title: "Session note due — Arjun S., parent coaching (today, 2:00 PM)",
    status: "open", dueDate: daysFromToday(0), completedAt: null, createdAt: daysFromToday(0),
  },
  {
    id: "pt-5", taskType: "sign_off", relatedId: "sn-198",
    title: "Countersign Leo K.'s intake note",
    status: "completed", dueDate: daysFromToday(-4), completedAt: daysFromToday(-3), createdAt: daysFromToday(-6),
  },
];

export async function getMyTasks(): Promise<ClinicianTask[]> {
  if (IS_PREVIEW) return previewTasks;

  const { data, error } = await sb()
    .from("clinician_tasks")
    .select("id, task_type, related_id, title, status, due_date, completed_at, created_at")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    taskType: (t.task_type as TaskType) ?? "other",
    relatedId: (t.related_id as string | null) ?? null,
    title: t.title as string,
    status: (t.status as TaskStatus) ?? "open",
    dueDate: (t.due_date as string | null) ?? null,
    completedAt: (t.completed_at as string | null) ?? null,
    createdAt: t.created_at as string,
  }));
}

/** Marks a task completed (or reopens it back to `open`) — always the
 *  caller's own row; RLS refuses anything else server-side regardless. */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  if (IS_PREVIEW) {
    previewTasks = previewTasks.map((t) =>
      t.id === id ? { ...t, status, completedAt: status === "completed" ? new Date().toISOString() : null } : t);
    return;
  }
  const { error } = await sb()
    .from("clinician_tasks")
    .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}
