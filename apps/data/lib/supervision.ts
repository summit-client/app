/**
 * Supervision, from both sides.
 *
 * A supervisor writes notes and assigns materials; a supervisee reads what was
 * written about them and confirms it. The same screen serves both, because a
 * supervisor is also somebody's supervisee and two screens would mean two
 * places to look.
 *
 * The two signatures are not the same act, and this module keeps them apart:
 * acknowledging is "I have read this", signing is the supervisor closing the
 * note. Conflating them turns a read receipt into evidence of agreement with a
 * performance judgement.
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

export type SupervisionKind = "clinician" | "client";

export type SupervisionNote = {
  id: string;
  kind: SupervisionKind;
  occurredOn: string;
  setting: string | null;
  observations: string;
  actionItems: string | null;
  nextSteps: string | null;
  acknowledgedAt: string | null;
  signedAt: string | null;
  signedName: string | null;
  superviseeId: string;
  supervisorId: string;
  clientId: number | null;
  materials: number;
  materialsOutstanding: number;
};

export type Material = {
  id: string;
  title: string;
  kind: "training_module" | "policy" | "lesson_resource" | "reading" | "other";
  url: string | null;
  dueOn: string | null;
  confirmedAt: string | null;
};

export function kindLabel(k: SupervisionKind): string {
  return k === "clinician" ? "Clinician supervision" : "Client supervision";
}

/**
 * What still has to happen on this note, in order.
 *
 * Returned as a sentence rather than a status enum because the two signatures
 * are independent: a note can be signed and unacknowledged, or acknowledged
 * and unsigned, and a single status would have to pick one to report.
 */
export function outstanding(n: SupervisionNote): string[] {
  const out: string[] = [];
  if (!n.signedAt) out.push("Waiting for the supervisor to sign");
  if (!n.acknowledgedAt) out.push("Waiting for the supervisee to confirm they have read it");
  if (n.materialsOutstanding > 0) {
    out.push(
      `${n.materialsOutstanding} of ${n.materials} assigned item${n.materials === 1 ? "" : "s"} not yet confirmed`);
  }
  return out;
}

export function isComplete(n: SupervisionNote): boolean {
  return outstanding(n).length === 0;
}

/** Open notes first, then most recent. A signed and confirmed note is history. */
export function sortNotes(notes: SupervisionNote[]): SupervisionNote[] {
  return [...notes].sort((a, b) => {
    const ca = isComplete(a), cb = isComplete(b);
    if (ca !== cb) return ca ? 1 : -1;
    return b.occurredOn.localeCompare(a.occurredOn);
  });
}

const PREVIEW: SupervisionNote[] = [
  {
    id: "sv-1", kind: "clinician", occurredOn: "2026-08-28", setting: "In-person, clinic",
    observations: "Strong pairing at the start of session. Prompt fading was late on three "
      + "trials of the requesting programme; the learner was left at a full physical prompt "
      + "after two independent responses.",
    actionItems: "Review the prompt hierarchy for RC1.01 before Thursday.",
    nextSteps: "Re-observe in two weeks, same programme.",
    acknowledgedAt: null, signedAt: "2026-08-28T16:00:00.000Z", signedName: "A. Supervisor",
    superviseeId: "u-clin", supervisorId: "u-super", clientId: null,
    materials: 2, materialsOutstanding: 1,
  },
  {
    id: "sv-2", kind: "client", occurredOn: "2026-08-20", setting: "Home visit",
    observations: "Observed the home programme. Generalization to the kitchen is holding.",
    actionItems: "Add a second setting to the mastery criteria.",
    nextSteps: "Review data in a month.",
    acknowledgedAt: "2026-08-21T09:00:00.000Z", signedAt: null, signedName: null,
    superviseeId: "u-clin", supervisorId: "u-super", clientId: 1,
    materials: 0, materialsOutstanding: 0,
  },
];

function toNote(r: Record<string, unknown>): SupervisionNote {
  return {
    id: r.id as string,
    kind: r.kind as SupervisionKind,
    occurredOn: String(r.occurred_on).slice(0, 10),
    setting: (r.setting as string | null) ?? null,
    observations: r.observations as string,
    actionItems: (r.action_items as string | null) ?? null,
    nextSteps: (r.next_steps as string | null) ?? null,
    acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
    signedAt: (r.signed_at as string | null) ?? null,
    signedName: (r.signed_name as string | null) ?? null,
    superviseeId: r.supervisee_id as string,
    supervisorId: r.supervisor_id as string,
    clientId: r.client_id == null ? null : Number(r.client_id),
    materials: Number(r.materials ?? 0),
    materialsOutstanding: Number(r.materials_outstanding ?? 0),
  };
}

export async function getNotes(): Promise<SupervisionNote[]> {
  if (IS_PREVIEW) return sortNotes(PREVIEW);
  const { data, error } = await sb()
    .from("my_supervision").select("*").order("occurred_on", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return sortNotes((data ?? []).map(toNote));
}

export async function getMaterials(noteId: string): Promise<Material[]> {
  if (IS_PREVIEW) {
    return [
      { id: "m1", title: "Prompt hierarchy refresher", kind: "training_module",
        url: null, dueOn: "2026-09-05", confirmedAt: null },
      { id: "m2", title: "Right to Disconnect Policy", kind: "policy",
        url: "/hub-docs/right-to-disconnect-policy.docx", dueOn: null,
        confirmedAt: "2026-08-29T10:00:00.000Z" },
    ];
  }
  const { data, error } = await sb()
    .from("supervision_materials")
    .select("id, title, kind, url, due_on, confirmed_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    title: r.title as string,
    kind: r.kind as Material["kind"],
    url: (r.url as string | null) ?? null,
    dueOn: (r.due_on as string | null) ?? null,
    confirmedAt: (r.confirmed_at as string | null) ?? null,
  }));
}

export type NewNote = {
  kind: SupervisionKind;
  superviseeId: string;
  clientId: number | null;
  occurredOn: string;
  setting: string;
  observations: string;
  actionItems: string;
  nextSteps: string;
};

export function noteProblems(n: NewNote): Record<string, string> {
  const p: Record<string, string> = {};
  if (!n.superviseeId) p.superviseeId = "Who was supervised?";
  if (n.kind === "client" && !n.clientId) p.clientId = "Which client was observed?";
  if (n.kind === "clinician" && n.clientId) {
    // The database refuses this outright; saying so here avoids a constraint
    // name reaching a supervisor mid-write.
    p.clientId = "A clinician-supervision note does not name a client.";
  }
  if (!n.observations.trim()) p.observations = "Write what you observed.";
  else if (n.observations.trim().length < 20) {
    p.observations = "Too short to be a record of what happened.";
  }
  return p;
}

export async function createNote(n: NewNote): Promise<void> {
  const problems = noteProblems(n);
  if (Object.keys(problems).length) throw new Error(Object.values(problems)[0]);
  if (IS_PREVIEW) return;
  const client = sb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await client
    .from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!profile?.clinic_id) throw new Error("Couldn't resolve your clinic.");

  const { error } = await client.from("supervision_notes").insert({
    clinic_id: profile.clinic_id,
    kind: n.kind,
    supervisee_id: n.superviseeId,
    client_id: n.kind === "client" ? n.clientId : null,
    // Always the caller. The insert policy refuses anything else, so this is
    // the app not asking for what the database would reject.
    supervisor_id: user.id,
    occurred_on: n.occurredOn,
    setting: n.setting.trim() || null,
    observations: n.observations.trim(),
    action_items: n.actionItems.trim() || null,
    next_steps: n.nextSteps.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** The supervisee confirming they have read it. Not agreement. */
export async function acknowledge(noteId: string): Promise<void> {
  if (IS_PREVIEW) return;
  const { error } = await sb()
    .from("supervision_notes")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
}

/** The supervisor signing, which closes the note to further edits. */
export async function sign(noteId: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error("Type your name to sign.");
  if (IS_PREVIEW) return;
  const { error } = await sb()
    .from("supervision_notes")
    .update({ signed_at: new Date().toISOString(), signed_name: name.trim() })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
}

export async function confirmMaterial(materialId: string): Promise<void> {
  if (IS_PREVIEW) return;
  const { error } = await sb()
    .from("supervision_materials")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", materialId);
  if (error) throw new Error(error.message);
}
