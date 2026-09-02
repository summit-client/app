/**
 * Who can see a particular record.
 *
 * Three choices, made by an admin or a supervisor: internal, the whole family,
 * or named guardians. The database enforces every one of them - migration 0069
 * gates the change on `clinical.record.share` and the read policies consult the
 * value. Nothing in this file is what protects a record; this decides how the
 * choice is presented and worded.
 *
 * WHY THE WORDING MATTERS MORE THAN USUAL
 *
 * A supervisor picking the wrong option here does not see an error. They see
 * nothing at all, and a parent either reads something they should not have or
 * misses something they needed. The labels below say who ends up able to read
 * the record, in those words, rather than naming the internal state.
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

export type Visibility = "internal" | "family" | "specific";
export type RecordType = "client_document" | "family_milestone" | "session_note";

export interface ShareableRecord {
  recordType: RecordType;
  recordId: string;
  clientId: number | null;
  clientName: string | null;
  label: string;
  visibility: Visibility;
  setBy: string | null;
  setByName: string | null;
  setAt: string | null;
  namedGuardians: number;
}

export interface GuardianOption {
  userId: string;
  name: string;
  relationship: string | null;
  /** Whether they hold the permission this record's surface needs. */
  canReachSurface: boolean;
}

/**
 * The three choices, in the words a supervisor should be reading.
 *
 * Deliberately phrased as who ends up able to see it, not as a state name.
 * "Internal" tells you what the record is filed as; "Nobody in the family"
 * tells you what happens, which is the thing being decided.
 */
export const VISIBILITY_OPTIONS: {
  value: Visibility; label: string; detail: string;
}[] = [
  {
    value: "internal",
    label: "Clinic only",
    detail: "Nobody in the family sees this, whatever their permissions allow.",
  },
  {
    value: "family",
    label: "Everyone on the family record",
    detail: "Every guardian who can already reach this kind of record.",
  },
  {
    value: "specific",
    label: "Only the people I name",
    detail: "Named guardians, and nobody else on the family record.",
  },
];

export function visibilityLabel(v: Visibility): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? "Clinic only";
}

/**
 * The line under a record in the list.
 *
 * `specific` with nothing named is its own state and says so. It is reachable
 * in one click - choose "only the people I name", name nobody - and it looks
 * identical to "shared" in a list that only prints the label. It is not: it is
 * invisible to the entire family.
 */
export function visibilitySummary(r: ShareableRecord): string {
  if (r.visibility === "internal") return "Clinic only";
  if (r.visibility === "family") return "Everyone on the family record";
  if (r.namedGuardians === 0) return "Nobody named yet, so nobody can see it";
  return r.namedGuardians === 1
    ? "One named guardian"
    : `${r.namedGuardians} named guardians`;
}

/** Whether a record needs a supervisor to finish deciding. */
export function needsAttention(r: ShareableRecord): boolean {
  return r.visibility === "specific" && r.namedGuardians === 0;
}

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  client_document: "Document",
  family_milestone: "Milestone",
  session_note: "Session note",
};

// ---------------------------------------------------------------------------
// Preview data, so the screen is developable without a database.
// ---------------------------------------------------------------------------
const mem: { records: ShareableRecord[]; grants: Record<string, string[]> } = {
  records: [
    {
      recordType: "client_document", recordId: "d-1", clientId: 1, clientName: "Maya",
      label: "Assessment report — Spring 2026", visibility: "family",
      setBy: null, setByName: null, setAt: null, namedGuardians: 0,
    },
    {
      recordType: "client_document", recordId: "d-2", clientId: 1, clientName: "Maya",
      label: "Custody arrangement correspondence", visibility: "specific",
      setBy: "u-super", setByName: "R. Okafor", setAt: "2026-08-28T10:00:00.000Z",
      namedGuardians: 1,
    },
    {
      recordType: "family_milestone", recordId: "m-1", clientId: 2, clientName: "Noah",
      label: "First independent request", visibility: "internal",
      setBy: null, setByName: null, setAt: null, namedGuardians: 0,
    },
  ],
  grants: { "d-2": ["u-parent-a"] },
};

const PREVIEW_GUARDIANS: GuardianOption[] = [
  { userId: "u-parent-a", name: "A. Yankov", relationship: "parent", canReachSurface: true },
  { userId: "u-parent-b", name: "D. Yankov", relationship: "parent", canReachSurface: true },
  { userId: "u-gran", name: "S. Levin", relationship: "grandparent", canReachSurface: false },
];

export async function getShareableRecords(): Promise<ShareableRecord[]> {
  if (IS_PREVIEW) return mem.records;
  const { data, error } = await sb()
    .from("record_visibility_summary")
    .select("record_type, record_id, client_id, label, visibility, visibility_set_by, visibility_set_at, named_guardians, clients(name), profiles!visibility_set_by(full_name)")
    .order("visibility_set_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    recordType: r.record_type as RecordType,
    recordId: String(r.record_id),
    clientId: r.client_id == null ? null : Number(r.client_id),
    clientName: pickName(r.clients),
    label: (r.label as string) ?? "Untitled",
    visibility: (r.visibility as Visibility) ?? "internal",
    setBy: (r.visibility_set_by as string | null) ?? null,
    setByName: pickName(r.profiles),
    setAt: (r.visibility_set_at as string | null) ?? null,
    namedGuardians: Number(r.named_guardians ?? 0),
  }));
}

function pickName(v: unknown): string | null {
  if (!v) return null;
  const row = Array.isArray(v) ? v[0] : v;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return (r.name as string) ?? (r.full_name as string) ?? null;
}

/**
 * The guardians a record could be named to.
 *
 * `canReachSurface` is carried through rather than filtering the list. A
 * guardian who lacks the permission this record's surface needs still belongs
 * on screen - naming them is legitimate and takes effect the moment the
 * permission is granted - but choosing them without knowing looks like sharing
 * and results in nothing. The screen says so next to their name.
 */
export async function getGuardiansFor(
  clientId: number, permission: string,
): Promise<GuardianOption[]> {
  if (IS_PREVIEW) return PREVIEW_GUARDIANS;
  const { data, error } = await sb()
    .from("guardian_relationships")
    .select("user_id, relationship, status, household_members(full_name), relationship_permissions(permission, granted)")
    .eq("client_id", clientId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  return (data ?? []).map((g: Record<string, unknown>) => {
    const perms = (g.relationship_permissions ?? []) as { permission: string; granted: boolean }[];
    return {
      userId: g.user_id as string,
      name: pickName(g.household_members) ?? "A guardian",
      relationship: (g.relationship as string | null) ?? null,
      canReachSurface: perms.some((p) => p.permission === permission && p.granted),
    };
  });
}

/** Which permission governs the surface a record type is read through. */
export function permissionFor(t: RecordType): string {
  return t === "client_document" ? "view_shared_documents" : "view_clinical_progress";
}

const TABLE: Record<RecordType, string> = {
  client_document: "client_documents",
  family_milestone: "family_milestones",
  session_note: "session_notes",
};

export async function setVisibility(
  t: RecordType, id: string, visibility: Visibility,
): Promise<void> {
  if (IS_PREVIEW) {
    const r = mem.records.find((x) => x.recordId === id);
    if (r) { r.visibility = visibility; r.setAt = new Date().toISOString(); }
    return;
  }
  const { error } = await sb().from(TABLE[t]).update({ visibility }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getGrants(t: RecordType, id: string): Promise<string[]> {
  if (IS_PREVIEW) return mem.grants[id] ?? [];
  const { data, error } = await sb()
    .from("record_visibility_grants")
    .select("guardian_user_id")
    .eq("record_type", t)
    .eq("record_id", id);
  if (error) throw new Error(error.message);
  return (data ?? []).map((g: { guardian_user_id: string }) => g.guardian_user_id);
}

export async function setGrant(
  t: RecordType, id: string, clinicId: string, guardianUserId: string, granted: boolean,
): Promise<void> {
  if (IS_PREVIEW) {
    const cur = new Set(mem.grants[id] ?? []);
    if (granted) cur.add(guardianUserId); else cur.delete(guardianUserId);
    mem.grants[id] = [...cur];
    const r = mem.records.find((x) => x.recordId === id);
    if (r) r.namedGuardians = cur.size;
    return;
  }
  const client = sb();
  if (granted) {
    const { data: me } = await client.auth.getUser();
    const { error } = await client.from("record_visibility_grants").insert({
      clinic_id: clinicId, record_type: t, record_id: id,
      guardian_user_id: guardianUserId, granted_by: me.user?.id,
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("record_visibility_grants").delete()
      .eq("record_type", t).eq("record_id", id).eq("guardian_user_id", guardianUserId);
    if (error) throw new Error(error.message);
  }
}
