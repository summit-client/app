/**
 * Family messaging, from the clinic's side.
 *
 * The family half shipped first (apps/client, migration 0044), which left
 * families able to send messages that nobody at the clinic could read. This is
 * the other end of that: the queue, the reply, and the internal note.
 *
 * INTERNAL NOTES
 *
 * `visibility: 'internal'` is staff-only, and that is enforced by the family
 * SELECT policy in the database rather than by anything here — a family
 * session cannot return an internal row however the query is shaped. Nothing
 * in this module is what protects it, which is the point: this file is free to
 * treat internal and shared messages as one list, because the boundary is not
 * its job.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not compute unread counts for staff. `my_message_threads` counts
 * unread per reader for a family; a staff queue wants "who has not been
 * answered", which is thread status, not read state. Status is maintained by
 * the trigger in 0044 whenever anyone posts, so it is already true.
 */
import { createBrowserClient } from "@supabase/ssr";

export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

export type ThreadStatus = "open" | "awaiting_family" | "resolved";
export type ThreadCategory =
  "general" | "scheduling" | "billing" | "clinical" | "forms_documents" | "other";

export type Thread = {
  id: string;
  clientId: number | null;
  clientName: string | null;
  householdId: string;
  householdName: string | null;
  subject: string;
  category: ThreadCategory;
  status: ThreadStatus;
  priority: "normal" | "high";
  assignedTo: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type Message = {
  id: string;
  threadId: string;
  body: string;
  authorKind: "family" | "staff";
  authorUserId: string;
  visibility: "shared" | "internal";
  createdAt: string;
};

/** Which queue a thread sits in, in the words a clinic uses. */
export function categoryLabel(c: ThreadCategory): string {
  switch (c) {
    case "scheduling": return "Scheduling";
    case "billing": return "Billing and funding";
    case "clinical": return "Clinical";
    case "forms_documents": return "Forms and documents";
    case "general": return "General";
    default: return "Other";
  }
}

/**
 * What the clinic needs to do about this thread.
 *
 * Read from the clinic's side, unlike the family's label for the same value:
 * `awaiting_family` means the clinic has answered and the ball is elsewhere,
 * which to staff is "waiting on them", not "clinic replied".
 */
export function statusLabel(s: ThreadStatus): string {
  switch (s) {
    case "open": return "Needs a reply";
    case "awaiting_family": return "Waiting on family";
    default: return "Resolved";
  }
}

/**
 * Queue order: what has been waiting longest, at the top.
 *
 * Unanswered first, then high priority, then oldest. Deliberately not
 * newest-first — a queue sorted by recency buries the message that has been
 * sitting since Tuesday under the one that arrived this morning, which is the
 * failure mode a queue exists to prevent.
 */
export function sortQueue(threads: Thread[]): Thread[] {
  const rank = (t: Thread) =>
    t.status === "open" ? 0 : t.status === "awaiting_family" ? 1 : 2;
  return [...threads].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return a.lastMessageAt.localeCompare(b.lastMessageAt);
  });
}

/** How long a thread has been waiting, for a queue that has to be triaged. */
export function waitingFor(thread: Thread, now: Date): string {
  const ms = now.getTime() - new Date(thread.lastMessageAt).getTime();
  if (!Number.isFinite(ms)) return "";
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Threads a clinic has that are older than a working day and unanswered. */
export function overdue(threads: Thread[], now: Date, hours = 24): Thread[] {
  return threads.filter(
    (t) => t.status === "open"
      && now.getTime() - new Date(t.lastMessageAt).getTime() > hours * 3600000,
  );
}

export const MAX_MESSAGE_LENGTH = 5000;

/** Why this reply cannot be sent, or null. */
export function replyProblem(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Write a reply before sending.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `That is ${trimmed.length - MAX_MESSAGE_LENGTH} characters over the limit.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview data, so the screen is developable without a database. Mirrors the
// shape the queries below return, never a different one.
// ---------------------------------------------------------------------------
const mem: { threads: Thread[]; messages: Message[] } = {
  threads: [
    {
      id: "t-1", clientId: 1, clientName: "Maya", householdId: "h-1",
      householdName: "Yankov Family", subject: "Moving Tuesday's session",
      category: "scheduling", status: "open", priority: "normal", assignedTo: null,
      lastMessageAt: "2026-08-30T09:12:00.000Z", createdAt: "2026-08-30T09:12:00.000Z",
    },
    {
      id: "t-2", clientId: null, householdId: "h-1", clientName: null,
      householdName: "Yankov Family", subject: "Address change",
      category: "general", status: "awaiting_family", priority: "normal", assignedTo: null,
      lastMessageAt: "2026-08-28T14:00:00.000Z", createdAt: "2026-08-27T10:00:00.000Z",
    },
  ],
  messages: [
    { id: "m-1", threadId: "t-1", body: "Could we move Tuesday to Thursday?",
      authorKind: "family", authorUserId: "u-parent", visibility: "shared",
      createdAt: "2026-08-30T09:12:00.000Z" },
  ],
};

export async function getThreads(): Promise<Thread[]> {
  if (IS_PREVIEW) return mem.threads;
  const { data, error } = await sb()
    .from("message_threads")
    .select("id, client_id, household_id, subject, category, status, priority, assigned_to, last_message_at, created_at, clients(name), households(name)")
    .order("last_message_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    clientId: t.client_id == null ? null : Number(t.client_id),
    // A nested select comes back as an object or an array depending on the
    // relationship PostgREST infers; normalized here so the screen does not
    // have to know which.
    clientName: pickName(t.clients),
    householdId: t.household_id as string,
    householdName: pickName(t.households),
    subject: t.subject as string,
    category: t.category as ThreadCategory,
    status: t.status as ThreadStatus,
    priority: (t.priority as "normal" | "high") ?? "normal",
    assignedTo: (t.assigned_to as string | null) ?? null,
    lastMessageAt: t.last_message_at as string,
    createdAt: t.created_at as string,
  }));
}

function pickName(v: unknown): string | null {
  if (!v) return null;
  const row = Array.isArray(v) ? v[0] : v;
  const name = (row as { name?: unknown } | undefined)?.name;
  return typeof name === "string" ? name : null;
}

export async function getMessages(threadId: string): Promise<Message[]> {
  if (IS_PREVIEW) return mem.messages.filter((m) => m.threadId === threadId);
  const { data, error } = await sb()
    .from("messages")
    .select("id, thread_id, body, author_kind, author_user_id, visibility, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    threadId: m.thread_id as string,
    body: m.body as string,
    authorKind: m.author_kind as "family" | "staff",
    authorUserId: m.author_user_id as string,
    visibility: m.visibility as "shared" | "internal",
    createdAt: m.created_at as string,
  }));
}

/**
 * Post a reply, or an internal note.
 *
 * `clinic_id` is not supplied: the trigger in 0047 derives it from the thread,
 * so a caller cannot put a message in the wrong clinic's queue by getting a
 * field wrong.
 */
export async function postReply(
  threadId: string, body: string, visibility: "shared" | "internal",
): Promise<void> {
  if (IS_PREVIEW) {
    mem.messages.push({
      id: `m-${mem.messages.length + 1}`, threadId, body,
      authorKind: "staff", authorUserId: "u-staff", visibility,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const client = sb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  // clinic_id is required by the column but overwritten by the trigger; the
  // thread's own value is passed so the insert satisfies not-null without the
  // caller inventing one.
  const { data: thread, error: threadError } = await client
    .from("message_threads").select("clinic_id").eq("id", threadId).maybeSingle();
  if (threadError) throw new Error(threadError.message);
  if (!thread) throw new Error("That conversation is not available.");

  const { error } = await client.from("messages").insert({
    clinic_id: thread.clinic_id,
    thread_id: threadId,
    author_user_id: user.id,
    author_kind: "staff",
    body: body.trim(),
    visibility,
  });
  if (error) throw new Error(error.message);
}

/** Set a thread's status, priority or assignee. Staff-only by RLS. */
export async function updateThread(
  threadId: string,
  patch: { status?: ThreadStatus; priority?: "normal" | "high"; assignedTo?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status) {
    row.status = patch.status;
    // The check constraint ties resolved_at to the status, so both move
    // together or neither does.
    row.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;
    if (patch.status !== "resolved") row.resolved_by = null;
  }
  if (patch.priority) row.priority = patch.priority;
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;

  if (IS_PREVIEW) {
    const t = mem.threads.find((x) => x.id === threadId);
    if (t) Object.assign(t, patch.status ? { status: patch.status } : {},
                            patch.priority ? { priority: patch.priority } : {});
    return;
  }
  const client = sb();
  if (patch.status === "resolved") {
    const { data: { user } } = await client.auth.getUser();
    row.resolved_by = user?.id ?? null;
  }
  const { error } = await client.from("message_threads").update(row).eq("id", threadId);
  if (error) throw new Error(error.message);
}
