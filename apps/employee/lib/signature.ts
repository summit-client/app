"use client";

/**
 * The practitioner's signature.
 *
 * Only the person themself may record one — enforced by RLS and by a trigger
 * in migration 0034, not merely by this module keeping to itself. A signature
 * applied by anyone other than its owner is a forged signature, so there is no
 * code path here that takes a user id from a caller.
 *
 * Superseded, never overwritten. A receipt issued in March should still
 * resolve the signature that was current in March; replacing the row would
 * retroactively change what every past document appears to have been signed
 * with. `save()` closes the current one and inserts a new one.
 */

import { createBrowserClient } from "@supabase/ssr";
import { IS_PREVIEW, type Session } from "./session";

export interface StoredSignature {
  id: string;
  imageDataUri: string;
  signedName: string;
  effectiveFrom: string;
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

function describe(c: unknown): string {
  if (typeof c === "object" && c && "message" in c) return String((c as { message: unknown }).message);
  return String(c);
}

export class SignatureError extends Error {
  constructor(op: string, cause: unknown) {
    super(`Could not ${op}: ${describe(cause)}`);
    this.name = "SignatureError";
  }
}

const PREVIEW_KEY = "summit-signature";

/** Matches the CHECK constraint in 0034. Validated before the round trip so a
 *  bad file is rejected with a sentence rather than a constraint name. */
export function isSupportedSignature(dataUri: string): boolean {
  return /^data:image\/(png|jpeg|svg\+xml);base64,/.test(dataUri);
}

/** The 400 KB ceiling the column carries. A drawn signature is a few KB; this
 *  only ever catches someone uploading a photograph. */
export const MAX_SIGNATURE_BYTES = 400_000;

export async function currentSignature(session: Session): Promise<StoredSignature | null> {
  if (IS_PREVIEW) {
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      return raw ? (JSON.parse(raw) as StoredSignature) : null;
    } catch { return null; }
  }

  const { data, error } = await sb()
    .from("employee_signatures")
    .select("id, image_data_uri, signed_name, effective_from")
    .eq("user_id", session.userId)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) throw new SignatureError("load your signature", error);
  if (!data) return null;

  return {
    id: data.id as string,
    imageDataUri: data.image_data_uri as string,
    signedName: data.signed_name as string,
    effectiveFrom: data.effective_from as string,
  };
}

export async function saveSignature(
  session: Session,
  imageDataUri: string,
  signedName: string,
): Promise<StoredSignature> {
  if (!isSupportedSignature(imageDataUri)) {
    throw new SignatureError("save your signature", "that is not a PNG, JPEG or SVG image");
  }
  if (imageDataUri.length > MAX_SIGNATURE_BYTES) {
    throw new SignatureError("save your signature", "the image is too large — draw it here rather than uploading a photo");
  }
  if (!signedName.trim()) {
    throw new SignatureError("save your signature", "a printed name is needed alongside the mark");
  }

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const effectiveFrom = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (IS_PREVIEW) {
    const row: StoredSignature = { id: `sig-${Date.now()}`, imageDataUri, signedName, effectiveFrom };
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(row)); } catch { /* storage unavailable */ }
    return row;
  }

  const db = sb();

  // Close the current one first. The partial unique index in 0034 permits only
  // one un-superseded signature per person, so this is what makes room —
  // and doing it in this order means a failed insert leaves the person with no
  // current signature rather than two, which the next save recovers from.
  const closed = await db
    .from("employee_signatures")
    .update({ superseded_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("superseded_at", null);
  if (closed.error) throw new SignatureError("replace your signature", closed.error);

  const { data, error } = await db
    .from("employee_signatures")
    .insert({
      clinic_id: session.clinicId,
      user_id: session.userId,
      image_data_uri: imageDataUri,
      signed_name: signedName.trim(),
      effective_from: effectiveFrom,
      created_by: session.userId,
    })
    .select("id, image_data_uri, signed_name, effective_from")
    .single();
  if (error) throw new SignatureError("save your signature", error);

  return {
    id: data.id as string,
    imageDataUri: data.image_data_uri as string,
    signedName: data.signed_name as string,
    effectiveFrom: data.effective_from as string,
  };
}
