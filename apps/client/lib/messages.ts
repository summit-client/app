/**
 * Secure messaging, shaped for the family portal.
 *
 * Everything here is presentation. The one rule that actually protects a family
 * from reading an internal staff note lives in migration 0044's RLS policy, not
 * in this file — deliberately, because a filter written here would be one
 * forgotten `.eq()` away from a leak. If a message reaches this code, the
 * database has already decided the reader may see it.
 *
 * What this file is responsible for: saying when something happened in words a
 * person reads, naming a category the way a parent would, and refusing to send
 * a message that would arrive empty.
 */

export type ThreadCategory =
  | "general" | "scheduling" | "billing" | "clinical" | "forms_documents" | "other";

export type ThreadStatus = "open" | "awaiting_family" | "resolved";

export interface Thread {
  threadId: string;
  /** Null for a thread about the household rather than one child. */
  clientId: number | null;
  householdId: string;
  subject: string;
  category: ThreadCategory;
  status: ThreadStatus;
  lastMessageAt: string;
  createdAt: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageFrom: "family" | "staff" | null;
}

export interface Message {
  id: string;
  body: string;
  authorKind: "family" | "staff";
  authorName: string | null;
  createdAt: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface ThreadRow {
  thread_id: string;
  client_id: number | string | null;
  household_id: string;
  subject: string;
  category: string;
  status: string;
  last_message_at: string;
  created_at: string;
  unread_count: number | string;
  last_message_preview: string | null;
  last_message_from: string | null;
}

const CATEGORIES: ThreadCategory[] =
  ["general", "scheduling", "billing", "clinical", "forms_documents", "other"];

export function threadsFromRows(rows: ThreadRow[]): Thread[] {
  return rows.map((r) => ({
    threadId: r.thread_id,
    clientId: r.client_id == null ? null : Number(r.client_id),
    householdId: r.household_id,
    subject: r.subject,
    category: (CATEGORIES.includes(r.category as ThreadCategory)
      ? r.category : "other") as ThreadCategory,
    status: (["open", "awaiting_family", "resolved"].includes(r.status)
      ? r.status : "open") as ThreadStatus,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
    unreadCount: Number(r.unread_count ?? 0),
    lastMessagePreview: r.last_message_preview,
    lastMessageFrom:
      r.last_message_from === "family" || r.last_message_from === "staff"
        ? r.last_message_from : null,
  }));
}

/**
 * What a parent would call this conversation.
 *
 * "Clinical" is "About care" here. A parent asking whether their child seemed
 * tired on Tuesday is not filing a clinical enquiry, and a form that says so
 * makes them pick "Other".
 */
export function categoryLabel(c: ThreadCategory): string {
  switch (c) {
    case "scheduling": return "Scheduling";
    case "billing": return "Billing and funding";
    case "clinical": return "About care";
    case "forms_documents": return "Forms and documents";
    case "general": return "General";
    default: return "Other";
  }
}

export const CATEGORY_OPTIONS: { value: ThreadCategory; label: string }[] = [
  // "Other" last rather than in its alphabetical place, because a list that
  // ends in Other reads as a fallback and one that has it in the middle reads
  // as a category.
  ...CATEGORIES.filter((c) => c !== "other"),
  "other" as ThreadCategory,
].map((c) => ({ value: c, label: categoryLabel(c) }));

/**
 * The status, said from the family's side of the conversation.
 *
 * `awaiting_family` is a queue state — it means the clinic replied and is
 * waiting. To the family that is not "awaiting family", it is "the clinic
 * replied", which is the useful half of the same fact.
 */
export function statusLabel(s: ThreadStatus): string {
  switch (s) {
    case "awaiting_family": return "Clinic replied";
    case "resolved": return "Resolved";
    default: return "Open";
  }
}

/**
 * When something happened, in words.
 *
 * `now` is a parameter rather than a call to Date.now() so this is testable
 * and so server and client render the same string — a relative time computed
 * independently on both sides is the classic hydration mismatch.
 */
export function whenLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms)) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** One line of the last message, for the inbox list. Never mid-word. */
export function previewOf(text: string | null, max = 90): string {
  if (!text) return "No messages yet";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function unreadTotal(threads: Thread[]): number {
  return threads.reduce((n, t) => n + t.unreadCount, 0);
}

/**
 * Threads newest-first, with unread ones lifted to the top.
 *
 * Recency alone buries a three-day-old unread reply under a resolved thread
 * someone glanced at this morning.
 */
export function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_SUBJECT_LENGTH = 120;

/**
 * Why this draft cannot be sent, or null if it can.
 *
 * A sentence rather than a boolean, because a disabled Send button with no
 * explanation is the failure mode this exists to replace. The same string is
 * shown in the composer and returned by the API route, so a parent who trips
 * the limit reads the identical wording either way.
 *
 * `string | null` rather than a tagged union on purpose: this app compiles with
 * `strict: false`, where narrowing `{ok: true} | {ok: false, reason}` on `!ok`
 * does not happen and every call site would need a cast.
 */
export function messageProblem(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Write a message before sending.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `That is ${trimmed.length - MAX_MESSAGE_LENGTH} characters over the limit. `
      + `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`;
  }
  return null;
}

export function subjectProblem(subject: string): string | null {
  const trimmed = subject.trim();
  if (!trimmed) return "Give the conversation a subject.";
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    return `Subjects can be up to ${MAX_SUBJECT_LENGTH} characters.`;
  }
  return null;
}

/**
 * Who a thread is about, for the inbox row.
 *
 * `names` maps client id to the name the family uses. A thread about a child
 * who is no longer in this guardian's set still has a client_id, so an unknown
 * id says "a child" rather than rendering the raw number.
 */
export function regardingLabel(t: Thread, names: Map<number, string>): string {
  if (t.clientId == null) return "Your family";
  return names.get(t.clientId) ?? "A child on your file";
}
