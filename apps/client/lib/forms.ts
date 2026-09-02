/**
 * Forms and consents, shaped for the portal.
 *
 * The field definitions live in the template as JSON (migration 0053), which
 * means this file has to treat them as untrusted-ish input: a template written
 * by a clinic can be malformed, and a form that renders half its questions is
 * worse than one that refuses to render.
 *
 * Answer validation runs here AND on the server. Not belt-and-braces for its
 * own sake: the same function produces the message shown beside the field and
 * the message returned by the API, so a family never sees two different
 * accounts of what is wrong.
 */

export type FieldType = "text" | "longtext" | "number" | "date" | "choice" | "checkbox";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** For type "choice". Empty for every other type. */
  options: string[];
  help: string | null;
}

export interface FormItem {
  assignmentId: string;
  clientId: number;
  templateId: string;
  key: string;
  version: number;
  title: string;
  description: string | null;
  kind: "form" | "consent";
  fields: FormField[];
  consentStatement: string | null;
  dueOn: string | null;
  isRequired: boolean;
  assignedAt: string;
  completedAt: string | null;
  signedName: string | null;
}

export interface ConsentItem {
  consentId: string;
  clientId: number;
  title: string;
  consentStatement: string | null;
  key: string;
  grantedAt: string;
  signedName: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  isActive: boolean;
}

const TYPES: FieldType[] = ["text", "longtext", "number", "date", "choice", "checkbox"];

/**
 * Fields from a template's JSON.
 *
 * A field with no id or no label is dropped: it cannot be answered (there is
 * no key to store it under) and it cannot be read (there is nothing to show).
 * Rendering it as an unlabelled box would collect an answer to a question
 * nobody asked.
 *
 * An unrecognized type becomes "text" rather than being dropped, because the
 * question is still answerable — a clinic that adds a "signature" type to a
 * newer template should get a text box from an older portal, not a gap.
 */
export function fieldsFrom(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FormField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const id = typeof f.id === "string" ? f.id.trim() : "";
    const label = typeof f.label === "string" ? f.label.trim() : "";
    // A duplicate id would have two inputs writing to one answer key, where
    // the last one silently wins.
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const type = TYPES.includes(f.type as FieldType) ? (f.type as FieldType) : "text";
    out.push({
      id,
      label,
      type,
      required: f.required === true,
      options: type === "choice" && Array.isArray(f.options)
        ? f.options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
        : [],
      help: typeof f.help === "string" && f.help.trim() ? f.help.trim() : null,
    });
  }
  return out;
}

interface FormRow {
  assignment_id: string;
  client_id: number | string;
  template_id: string;
  key: string;
  version: number | string;
  title: string;
  description: string | null;
  kind: string;
  fields: unknown;
  consent_statement: string | null;
  due_on: string | null;
  is_required: boolean;
  assigned_at: string;
  completed_at: string | null;
  signed_name: string | null;
}

export function formsFromRows(rows: FormRow[]): FormItem[] {
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    clientId: Number(r.client_id),
    templateId: r.template_id,
    key: r.key,
    version: Number(r.version),
    title: r.title,
    description: r.description,
    kind: r.kind === "consent" ? "consent" : "form",
    fields: fieldsFrom(r.fields),
    consentStatement: r.consent_statement,
    dueOn: r.due_on,
    isRequired: Boolean(r.is_required),
    assignedAt: r.assigned_at,
    completedAt: r.completed_at,
    signedName: r.signed_name,
  }));
}

interface ConsentRow {
  consent_id: string;
  client_id: number | string;
  title: string;
  consent_statement: string | null;
  key: string;
  granted_at: string;
  signed_name: string | null;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  is_active: boolean;
}

export function consentsFromRows(rows: ConsentRow[]): ConsentItem[] {
  return rows.map((r) => ({
    consentId: r.consent_id,
    clientId: Number(r.client_id),
    title: r.title,
    consentStatement: r.consent_statement,
    key: r.key,
    grantedAt: r.granted_at,
    signedName: r.signed_name,
    withdrawnAt: r.withdrawn_at,
    withdrawalReason: r.withdrawal_reason,
    isActive: Boolean(r.is_active),
  }));
}

/**
 * Outstanding forms first, overdue at the top, then by due date.
 *
 * Completed forms stay in the list rather than disappearing: "did I already
 * send that?" is the question a family asks most often about a form, and a
 * list that only shows what is outstanding cannot answer it.
 */
export function sortForms(items: FormItem[], today: string): FormItem[] {
  const rank = (f: FormItem) => {
    if (f.completedAt) return 3;
    if (f.dueOn && f.dueOn < today) return 0;   // overdue
    if (f.isRequired) return 1;
    return 2;
  };
  return [...items].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99");
  });
}

/** How a form's state reads, in the family's terms. */
export function formStatus(f: FormItem, today: string): string {
  if (f.completedAt) return "Completed";
  if (f.dueOn && f.dueOn < today) return "Overdue";
  if (f.dueOn) return `Due ${f.dueOn}`;
  return f.isRequired ? "Needed" : "Optional";
}

/**
 * What is wrong with these answers, per field. Empty means it can be sent.
 *
 * Keyed by field id so each message renders beside its own question. A single
 * "please fill in the required fields" at the top of a long form makes a person
 * hunt for which one.
 */
export function answerProblems(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const v = answers[f.id];
    const empty =
      v === undefined || v === null ||
      (typeof v === "string" && v.trim() === "") ||
      // An unticked checkbox is a real answer ("no") unless it is required,
      // where the only way to satisfy it is to tick it.
      (f.type === "checkbox" && v === false && f.required);

    if (f.required && empty) {
      problems[f.id] = f.type === "checkbox"
        ? "This needs to be ticked."
        : "This one is needed.";
      continue;
    }
    if (empty) continue;

    if (f.type === "number" && Number.isNaN(Number(v))) {
      problems[f.id] = "Enter a number.";
    }
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
      problems[f.id] = "Enter a date as YYYY-MM-DD.";
    }
    if (f.type === "choice" && f.options.length > 0 && !f.options.includes(String(v))) {
      // A value outside the options means a stale page or a hand-made request,
      // not a typo, so the message says what is acceptable rather than
      // apologising.
      problems[f.id] = "Choose one of the listed options.";
    }
  }
  return problems;
}

/**
 * Answers reduced to the fields this template actually defines.
 *
 * Anything else is dropped rather than stored. Without this, a crafted request
 * can put arbitrary keys into a jsonb column that staff later read as though a
 * clinician had defined them.
 */
export function pruneAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(fields.map((f) => f.id));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

export const MAX_SIGNED_NAME = 120;

/** Why this signature cannot be accepted, or null. */
export function signatureProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Type your name to sign.";
  if (trimmed.length > MAX_SIGNED_NAME) {
    return `Names can be up to ${MAX_SIGNED_NAME} characters.`;
  }
  return null;
}
