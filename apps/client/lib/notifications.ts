/**
 * The notification centre, and clinic announcements.
 *
 * `my_notifications()` (migration 0051) assembles everything waiting on a
 * family from live rows at read time: unread replies, unread announcements,
 * and the tasks `family_tasks` derives. Nothing is stored, so a notification
 * cannot outlive the thing that caused it — an appointment that gets cancelled
 * takes its own reminder with it, with nothing to unwind.
 *
 * This file decides the order they appear in and how each one reads. It does
 * not decide which ones a family may see; the function applies each child's
 * permissions per row, so a guardian with appointments but not billing never
 * learns from this list that funding is low.
 */

export type NotificationSource = "message" | "announcement" | "task";

export interface Notification {
  source: NotificationSource;
  /** Unique within a source. Stable across reloads, so React keys are honest. */
  refId: string;
  title: string;
  detail: string | null;
  occurredAt: string | null;
  isUrgent: boolean;
  href: string;
}

export interface Announcement {
  announcementId: string;
  title: string;
  body: string;
  category: string;
  isUrgent: boolean;
  publishAt: string;
  isUnread: boolean;
}

interface NotificationRow {
  source: string;
  ref_id: string;
  title: string;
  detail: string | null;
  occurred_at: string | null;
  is_urgent: boolean;
  href: string;
}

interface AnnouncementRow {
  announcement_id: string;
  title: string;
  body: string;
  category: string;
  is_urgent: boolean;
  publish_at: string;
  is_unread: boolean;
}

const SOURCES: NotificationSource[] = ["message", "announcement", "task"];

export function notificationsFromRows(rows: NotificationRow[]): Notification[] {
  return rows
    // A row whose source this build does not know is dropped rather than
    // rendered with a blank icon and no working link. A newer database can
    // add a source; an older portal should not guess what it means.
    .filter((r) => SOURCES.includes(r.source as NotificationSource))
    .map((r) => ({
      source: r.source as NotificationSource,
      refId: r.ref_id,
      title: r.title,
      detail: r.detail,
      occurredAt: r.occurred_at,
      isUrgent: Boolean(r.is_urgent),
      href: r.href,
    }));
}

export function announcementsFromRows(rows: AnnouncementRow[]): Announcement[] {
  return rows.map((r) => ({
    announcementId: r.announcement_id,
    title: r.title,
    body: r.body,
    category: r.category,
    isUrgent: Boolean(r.is_urgent),
    publishAt: r.publish_at,
    isUnread: Boolean(r.is_unread),
  }));
}

/**
 * What a family sees first.
 *
 * Urgent above everything, then oldest first within each group — not newest.
 * A notification centre sorted newest-first buries the thing that has been
 * waiting longest under whatever arrived this morning, which is the opposite
 * of what a list of outstanding items is for.
 *
 * A row with no timestamp sorts last rather than first: an unknown date is not
 * evidence of urgency.
 */
export function sortNotifications(items: Notification[]): Notification[] {
  return [...items].sort((a, b) => {
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    if (!a.occurredAt && !b.occurredAt) return 0;
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return a.occurredAt.localeCompare(b.occurredAt);
  });
}

/** How a source reads in the list. Words, never an icon on its own. */
export function sourceLabel(source: NotificationSource): string {
  switch (source) {
    case "message": return "Message";
    case "announcement": return "From the clinic";
    default: return "Needs you";
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  closure: "Closure",
  policy: "Policy update",
  event: "Event",
  billing: "Billing",
  safety: "Safety",
  general: "Notice",
};

export function announcementCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? "Notice";
}

/**
 * The line the dashboard shows above the list.
 *
 * Counts what is there. When nothing is waiting it says so plainly rather than
 * congratulating anyone — a family whose child has a session tomorrow does not
 * need "You're all caught up!" with an exclamation mark.
 */
export function summaryLine(items: Notification[]): string {
  if (items.length === 0) return "Nothing needs your attention right now.";
  const urgent = items.filter((i) => i.isUrgent).length;
  const noun = items.length === 1 ? "item" : "items";
  return urgent > 0
    ? `${items.length} ${noun} waiting, ${urgent} marked urgent.`
    : `${items.length} ${noun} waiting.`;
}

/**
 * Announcements for the updates page: urgent pinned, then newest first.
 *
 * The opposite order to the notification centre, deliberately. That list is
 * work outstanding, where the oldest matters most; this one is news, where the
 * most recent does.
 */
export function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((a, b) => {
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    return b.publishAt.localeCompare(a.publishAt);
  });
}
