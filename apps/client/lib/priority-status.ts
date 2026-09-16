/**
 * The nav bar's profile-ring data for the client (family/guardian) role.
 * Mirrors apps/employee's computeStaffPriorityStatus() - same shape, same
 * "fully self-contained, no snapshot provider needed" reasoning - but reads
 * household/child data instead of staff data, per the agreed table:
 *
 *   critical: emergency contact, mailing address + phone, contact email,
 *             availability (client_availability, at least one child)
 *   important: home session preference (home_session_preferences)
 *
 * Unlike the staff version, "critical" here is evaluated across the whole
 * family, not per-child - a guardian with several children only needs one
 * of them to have availability set (or a preference chosen) for that item
 * to count done; the mailing address/emergency contact/phone/email items
 * are household-level facts, not per-child at all.
 */

import { browserClient } from "./supabase-browser";

export interface PriorityStatus {
  percent: number;
  state: "critical" | "important" | "complete";
  label: string;
}

export async function computeClientPriorityStatus(): Promise<PriorityStatus | null> {
  const sb = browserClient();

  const { data: familyRows } = await sb
    .from("my_family")
    .select("client_id, household_id");
  if (!familyRows || familyRows.length === 0) return null;

  const clientIds = familyRows.map((r) => r.client_id as number);
  const householdId = familyRows[0].household_id as string | null;
  if (!householdId) return null;

  const [householdRes, contactsRes, availRes, prefRes] = await Promise.all([
    sb.from("households").select("address_line1, phone, email").eq("id", householdId).maybeSingle(),
    sb.from("household_members").select("id").eq("household_id", householdId).eq("is_emergency_contact", true).limit(1),
    sb.from("client_availability").select("id").in("client_id", clientIds).limit(1),
    sb.from("home_session_preferences").select("client_id").in("client_id", clientIds).limit(1),
  ]);

  const household = householdRes.data as { address_line1: string | null; phone: string | null; email: string | null } | null;

  const critical = [
    { done: !!(contactsRes.data && contactsRes.data.length > 0) },
    { done: !!household?.address_line1 },
    { done: !!household?.phone },
    { done: !!household?.email },
    { done: !!(availRes.data && availRes.data.length > 0) },
  ];
  const important = [
    { done: !!(prefRes.data && prefRes.data.length > 0) },
  ];

  const criticalOutstanding = critical.filter((i) => !i.done).length;
  const importantOutstanding = important.filter((i) => !i.done).length;
  const total = critical.length + important.length;
  const done = total - criticalOutstanding - importantOutstanding;
  const percent = total ? Math.round((done / total) * 100) : 100;
  const state: PriorityStatus["state"] =
    criticalOutstanding > 0 ? "critical" : importantOutstanding > 0 ? "important" : "complete";
  const label = state === "complete"
    ? "Profile complete"
    : [
        criticalOutstanding > 0 ? `${criticalOutstanding} critical item${criticalOutstanding === 1 ? "" : "s"} left` : null,
        importantOutstanding > 0 ? `${importantOutstanding} item${importantOutstanding === 1 ? "" : "s"} left` : null,
      ].filter(Boolean).join(", ");

  return { percent, state, label };
}
