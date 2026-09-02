/**
 * Workforce administration: the two jobs nothing else can do.
 *
 * 1. Linking a scheduler `staff` row to a login. Sessions are booked against
 *    the first and every HR, credential and pay record hangs off the second,
 *    and until one employment record says they are the same person, hours
 *    cannot be attributed and nothing downstream computes. Migration 0026
 *    explains why this cannot be inferred: names are not unique, are not
 *    always spelled the same in both systems, and a wrong match pays one
 *    person for another's hours.
 *
 * 2. Working the derivation queue. `record_session_delivery` refuses to guess,
 *    so delivered sessions it could not attribute sit in `underived_sessions`
 *    with a stated reason. This is where somebody clears them.
 */
import { createBrowserClient } from "@supabase/ssr";
import { clientSessionFreshness } from "@summit/proxy-auth/client";
import { loginUrl, refreshUrl } from "@summit/portals";

export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/**
 * Same cross-portal refresh-token-race guard as apps/data/lib/data.ts's
 * ensureFreshSession() (see that file's header for the full rationale) -
 * this file also calls sb().auth.getUser() directly from the browser
 * (myClinicId() below) and was flagged in BLOCKED-data.md as having the
 * same unguarded gap.
 */
async function ensureFreshSession(): Promise<void> {
  const freshness = await clientSessionFreshness(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (freshness === "fresh") return;
  if (typeof window === "undefined") return;

  if (freshness === "missing") {
    window.location.href = loginUrl();
  } else {
    const refresh = new URL(refreshUrl());
    refresh.searchParams.set("return_to", window.location.href);
    window.location.href = refresh.toString();
  }
  await new Promise<never>(() => {});
}

/** A person who can log in, with their employment and scheduler link if any. */
export type Person = {
  userId: string;
  fullName: string;
  role: string;
  employmentId: string | null;
  employeeNumber: string | null;
  startDate: string | null;
  positionTitle: string | null;
  staffId: number | null;
  /** The scheduler row's own name, so a mismatch is visible before linking. */
  staffName: string | null;
};

/** A scheduler resource, and whether it is already claimed. */
export type SchedulerResource = {
  id: number;
  name: string;
  role: string | null;
  claimedBy: string | null;   // full name of the person holding it
};

export type StuckSession = {
  sessionId: number;
  sessionDate: string;
  type: string | null;
  clientId: number | null;
  employeeId: number | null;
  blockedBy: string;
};

// --- preview fixtures ------------------------------------------------------
const previewPeople: Person[] = [
  { userId: "u-1", fullName: "Amara Osei", role: "clinician", employmentId: "em-1",
    employeeNumber: "E-1042", startDate: "2025-09-02", positionTitle: "Behaviour Therapist",
    staffId: 7, staffName: "A. Osei" },
  { userId: "u-2", fullName: "Daniel Reyes", role: "clinician", employmentId: "em-2",
    employeeNumber: "E-1071", startDate: "2026-01-05", positionTitle: "Behaviour Therapist",
    staffId: null, staffName: null },
  { userId: "u-3", fullName: "Priya Raman", role: "supervisor", employmentId: "em-3",
    employeeNumber: "E-0980", startDate: "2024-03-11", positionTitle: "Clinical Supervisor",
    staffId: null, staffName: null },
  { userId: "u-4", fullName: "Joanne Whitfield", role: "admin", employmentId: null,
    employeeNumber: null, startDate: null, positionTitle: null, staffId: null, staffName: null },
];

const previewResources: SchedulerResource[] = [
  { id: 7, name: "A. Osei", role: "RBT", claimedBy: "Amara Osei" },
  { id: 8, name: "D. Reyes", role: "RBT", claimedBy: null },
  { id: 9, name: "P. Raman", role: "BCBA", claimedBy: null },
  { id: 11, name: "Locum — Tuesdays", role: "RBT", claimedBy: null },
];

const previewStuck: StuckSession[] = [
  { sessionId: 5210, sessionDate: "2026-08-11", type: "Direct Therapy", clientId: 1, employeeId: 8,
    blockedBy: "staff member is not linked to an employment record" },
  { sessionId: 5214, sessionDate: "2026-08-12", type: "Direct Therapy", clientId: 1, employeeId: 8,
    blockedBy: "staff member is not linked to an employment record" },
  { sessionId: 5233, sessionDate: "2026-08-18", type: "Caregiver session", clientId: 2, employeeId: 7,
    blockedBy: "client has no open budget for that date" },
  { sessionId: 5240, sessionDate: "2026-08-20", type: "Direct Therapy", clientId: 1, employeeId: 7,
    blockedBy: "ready to derive" },
];

let mem = {
  people: previewPeople.map((p) => ({ ...p })),
  resources: previewResources.map((r) => ({ ...r })),
  stuck: previewStuck.map((s) => ({ ...s })),
};

// --- reads -----------------------------------------------------------------

export async function getPeople(): Promise<Person[]> {
  if (IS_PREVIEW) return mem.people;

  const { data: profiles, error } = await sb()
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name");
  if (error) throw new Error(error.message);

  const { data: employments } = await sb()
    .from("employment_records")
    .select("id, user_id, staff_id, employee_number, start_date")
    .is("end_date", null);

  const { data: positions } = await sb()
    .from("current_employment")
    .select("employment_id, position_title");

  const staffIds = (employments ?? []).map((e) => e.staff_id).filter(Boolean) as number[];
  const { data: staffRows } = staffIds.length
    ? await sb().from("staff").select("id, name").in("id", staffIds)
    : { data: [] };

  return (profiles ?? []).map((p) => {
    const em = (employments ?? []).find((e) => e.user_id === p.id);
    const pos = (positions ?? []).find((x) => x.employment_id === em?.id);
    const st = (staffRows ?? []).find((s) => s.id === em?.staff_id);
    return {
      userId: p.id as string,
      fullName: (p.full_name as string) ?? "Unnamed",
      role: (p.role as string) ?? "—",
      employmentId: (em?.id as string) ?? null,
      employeeNumber: (em?.employee_number as string) ?? null,
      startDate: (em?.start_date as string) ?? null,
      positionTitle: (pos?.position_title as string) ?? null,
      staffId: em?.staff_id == null ? null : Number(em.staff_id),
      staffName: (st?.name as string) ?? null,
    };
  });
}

export async function getSchedulerResources(): Promise<SchedulerResource[]> {
  if (IS_PREVIEW) return mem.resources;

  const { data: staffRows, error } = await sb().from("staff").select("id, name, role").order("name");
  if (error) throw new Error(error.message);

  const { data: employments } = await sb()
    .from("employment_records")
    .select("staff_id, user_id")
    .is("end_date", null)
    .not("staff_id", "is", null);

  const userIds = (employments ?? []).map((e) => e.user_id as string);
  const { data: profiles } = userIds.length
    ? await sb().from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };

  return (staffRows ?? []).map((s) => {
    const em = (employments ?? []).find((e) => Number(e.staff_id) === Number(s.id));
    const who = (profiles ?? []).find((p) => p.id === em?.user_id);
    return {
      id: Number(s.id),
      name: s.name as string,
      role: (s.role as string) ?? null,
      claimedBy: (who?.full_name as string) ?? null,
    };
  });
}

export async function getStuckSessions(): Promise<StuckSession[]> {
  if (IS_PREVIEW) return mem.stuck;

  const { data, error } = await sb()
    .from("underived_sessions")
    .select("session_id, session_date, type, client_id, employee_id, blocked_by")
    .order("session_date", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    sessionId: Number(r.session_id),
    sessionDate: r.session_date as string,
    type: (r.type as string) ?? null,
    clientId: r.client_id == null ? null : Number(r.client_id),
    employeeId: r.employee_id == null ? null : Number(r.employee_id),
    blockedBy: r.blocked_by as string,
  }));
}

// --- writes ----------------------------------------------------------------

/**
 * Claim a scheduler resource for an employment.
 *
 * Refused if another live employment already holds it. The database has a
 * partial unique index that would refuse it too; this check exists so the
 * person gets a sentence instead of a constraint name.
 */
export async function linkStaffToEmployment(employmentId: string, staffId: number | null): Promise<void> {
  if (IS_PREVIEW) {
    if (staffId != null) {
      const holder = mem.people.find((p) => p.staffId === staffId && p.employmentId !== employmentId);
      if (holder) throw new Error(`That scheduler record is already linked to ${holder.fullName}.`);
    }
    const resource = mem.resources.find((r) => r.id === staffId);
    mem.people = mem.people.map((p) =>
      p.employmentId === employmentId
        ? { ...p, staffId, staffName: resource?.name ?? null }
        : p);
    const person = mem.people.find((p) => p.employmentId === employmentId);
    mem.resources = mem.resources.map((r) => {
      if (r.id === staffId) return { ...r, claimedBy: person?.fullName ?? null };
      if (r.claimedBy && person && r.claimedBy === person.fullName) return { ...r, claimedBy: null };
      return r;
    });
    return;
  }

  if (staffId != null) {
    const { data: clash } = await sb()
      .from("employment_records")
      .select("id")
      .eq("staff_id", staffId)
      .is("end_date", null)
      .neq("id", employmentId)
      .maybeSingle();
    if (clash) throw new Error("That scheduler record is already linked to another employee.");
  }

  const { error } = await sb()
    .from("employment_records")
    .update({ staff_id: staffId })
    .eq("id", employmentId);
  if (error) throw new Error(error.message);
}

/** Run the derivation for every completed session that has no time entry yet. */
export async function derivePending(): Promise<{ derived: number; stillBlocked: number }> {
  if (IS_PREVIEW) {
    const ready = mem.stuck.filter((s) => s.blockedBy === "ready to derive");
    mem.stuck = mem.stuck.filter((s) => s.blockedBy !== "ready to derive");
    return { derived: ready.length, stillBlocked: mem.stuck.length };
  }

  const clinicId = await myClinicId();
  if (!clinicId) throw new Error("No clinic on your profile.");

  const { data, error } = await sb().rpc("derive_pending_session_deliveries", { p_clinic: clinicId });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { time_entry_id: string | null }[];
  const derived = rows.filter((r) => r.time_entry_id).length;
  return { derived, stillBlocked: rows.length - derived };
}

async function myClinicId(): Promise<string | null> {
  await ensureFreshSession();
  const user = (await sb().auth.getUser()).data.user;
  if (!user) return null;
  const { data } = await sb().from("profiles").select("clinic_id").eq("id", user.id).single();
  return (data?.clinic_id as string) ?? null;
}
