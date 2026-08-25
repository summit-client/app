/**
 * Clinical document templates — the organization's master Word templates (BAR
 * Treatment Plan Report, End of Block Summary) rebuilt as structured documents:
 * evidence-backed sections auto-fill from the client record; narrative sections
 * are written in place; the draft → proofed → final workflow replaces the
 * "make a copy in Google Drive, upload the PDF to JaneApp" loop. Signed finals
 * are the clinical documentation submission.
 */

export interface DocSection {
  id: string;
  title: string;
  guidance: string;         // the template's own instruction, kept as helper text
  autofill?: "client_info" | "goals" | "assessments" | "service_delivery" | "school_info";
}

export interface DocTemplate {
  slug: string;
  name: string;
  cadence: string;
  sections: DocSection[];
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    slug: "bar",
    name: "BAR — Treatment Plan Report",
    cadence: "Refresh every 3 months. Peer/supervisor proof before final.",
    sections: [
      { id: "client", title: "Client information", guidance: "Report dates, session frequency & duration, format (1:1 / group / parent coaching), identifiers.", autofill: "client_info" },
      { id: "bio", title: "Background & history — biological factors", guidance: "Body & brain: sleep, nutrition, medical conditions, medication effects, sensory processing, fatigue. Based on caregiver assessment & reporting." },
      { id: "psych", title: "Background & history — psychological factors", guidance: "How the child thinks, processes, regulates and understands their environment." },
      { id: "social", title: "Background & history — social factors", guidance: "Family, peers, school and community context." },
      { id: "observations", title: "Behavioural observations", guidance: "3–5 sentences: entry, engagement, interaction, prompting; one strength and one need." },
      { id: "assessment", title: "Curriculum selection rationale & assessment findings", guidance: "Auto-filled from the client's assessment administrations; add rationale.", autofill: "assessments" },
      { id: "needs", title: "Summary of clinical needs", guidance: "The clinical picture the goals respond to." },
      { id: "targets", title: "Preliminary ABA program targets", guidance: "Auto-filled from active programming.", autofill: "goals" },
      { id: "delivery", title: "Summary of service delivery", guidance: "Structure, schedule, strategies (modeling, prompting, reinforcement, guided practice), generalization plan.", autofill: "service_delivery" },
    ],
  },
  {
    slug: "block-summary",
    name: "End of Block Summary",
    cadence: "Complete within the final 2 weeks of the treatment block; book the parent meeting at least 2 weeks before block end.",
    sections: [
      { id: "client", title: "Basic information", guidance: "Identifiers and contacts.", autofill: "client_info" },
      { id: "school", title: "School information", guidance: "School, grade and classroom type, teacher, accommodations / modifications.", autofill: "school_info" },
      { id: "strengths", title: "Strengths and needs", guidance: "Learning strengths; learning needs." },
      { id: "goals", title: "Current goals", guidance: "Auto-filled from active programming with block performance.", autofill: "goals" },
      { id: "recap", title: "Initial assessment review / recap", guidance: "Summarize the assessments that informed placement: key developmental areas, social communication, play skills, sensory considerations, behavioural supports.", autofill: "assessments" },
      { id: "progress", title: "Block progress summary", guidance: "What moved this block, with the data; what held steady; what changed in programming and why." },
      { id: "continuity", title: "Follow-up & continuity of treatment planning", guidance: "Findings discussed with the family, revised parent-interview questionnaire, and the plan into the next block." },
    ],
  },
];

export interface DocDraft {
  clientId: number;
  slug: string;
  content: Record<string, string>;   // sectionId -> text (autofill sections may be edited after fill)
  status: "draft" | "proofed" | "final";
  writtenBy: string;
  proofedBy: string;
  updatedAt: string;
}

const DKEY = "summit-clinical-docs";

export function loadDoc(clientId: number, slug: string): DocDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(sessionStorage.getItem(DKEY) ?? "[]") as DocDraft[];
    return all.find((d) => d.clientId === clientId && d.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export function saveDoc(doc: DocDraft): void {
  const all = ((): DocDraft[] => {
    try { return JSON.parse(sessionStorage.getItem(DKEY) ?? "[]") as DocDraft[]; } catch { return []; }
  })().filter((d) => !(d.clientId === doc.clientId && d.slug === doc.slug));
  all.push({ ...doc, updatedAt: new Date().toISOString() });
  sessionStorage.setItem(DKEY, JSON.stringify(all));
}

/* ---- treatment blocks (caseload calendar) ------------------------------------- */

export interface TreatmentBlock {
  name: string;
  start: string;   // ISO
  end: string;     // ISO
}

/** Preview block calendar; live mode reads the organization's block table. */
export const PREVIEW_BLOCKS: Record<number, TreatmentBlock> = {
  101: { name: "Summer 2026 Block", start: "2026-06-29", end: "2026-09-05" },
  102: { name: "Summer 2026 Block", start: "2026-06-29", end: "2026-09-05" },
  103: { name: "Fall 2026 Block", start: "2026-09-08", end: "2026-12-18" },
  104: { name: "Fall 2026 Block", start: "2026-09-08", end: "2026-12-18" },
};

export function blockFor(clientId: number): TreatmentBlock | null {
  return PREVIEW_BLOCKS[clientId] ?? null;
}

/** Within the final two weeks of the block, the End of Block Summary is due. */
export function blockEndingSoon(b: TreatmentBlock, today = new Date()): boolean {
  const end = new Date(b.end).getTime();
  const days = (end - today.getTime()) / 86_400_000;
  return days >= 0 && days <= 14;
}
