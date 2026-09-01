/**
 * The document center — pages/documents.tsx (list + download) and its
 * upload flow. Backed by `client_documents` (migration 0035) for the
 * metadata row and a Storage bucket (see that migration's footer - a human
 * still needs to create it) for the file itself.
 */

/** Must match the bucket name the storage.objects policies suggested in
 *  migration 0035's footer are written against. Not yet created live - see
 *  that migration's "MANUAL STEPS REQUIRED" block. */
export const DOCUMENTS_BUCKET = "client-documents";

/** Client-side sanity cap so a family gets an immediate, clear error instead
 *  of a slow upload that fails partway through. Not a security boundary
 *  (Storage/RLS don't enforce it) - just a kinder failure mode. Supabase's
 *  own project-level upload limit is configured separately and may be
 *  smaller; this is a floor on friendliness, not a promise about capacity. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type DocumentDirection = "staff_to_client" | "client_to_staff";

export interface ClientDocument {
  id: string;
  title: string;
  direction: DocumentDirection;
  createdAt: string;
  /** A short-lived signed URL, resolved server-side at render time - null
   *  when signing failed (most likely: the Storage bucket from migration
   *  0035's footer hasn't been created yet). Never a stored/public URL. */
  downloadUrl: string | null;
}

/**
 * The exact path convention migration 0035's suggested storage.objects
 * policies assume: `{clinic_id}/{client_id}/{uuid}-{filename}`, so a
 * policy can split_part() the object name to recover the clinic/client
 * boundary without a second lookup. clinic_id first (matches every other
 * clinic-scoped RLS check in this schema being clinic_id-first), client_id
 * second, an unpredictable segment third so two families' same-named
 * uploads ("intake-form.pdf") never collide.
 */
export function buildDocumentPath(clinicId: string, clientId: string | number, filename: string): string {
  return `${clinicId}/${clientId}/${cryptoRandomId()}-${sanitizeFilename(filename)}`;
}

/** Storage object names are URL components under the hood - strip anything
 *  that would need escaping (spaces included, for tidiness) rather than
 *  trust every OS's file-naming rules to already be safe here. */
export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[^\w.\-]+/g, "-");
  return trimmed.length > 0 ? trimmed.slice(-140) : "file";
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for older runtimes without crypto.randomUUID - collision odds
  // are irrelevant here since the filename segment after it still varies.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
