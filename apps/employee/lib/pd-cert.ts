"use client";

/**
 * PD certificate reading + CEU classification.
 *
 * The uploaded PDF's text is extracted in the browser (streams inflated with
 * DecompressionStream, so nothing is uploaded anywhere in preview) and matched
 * against CEU issuer markers:
 *
 *  - BACB: Behavior Analyst Certification Board CEUs require an ACE provider;
 *            we look for BACB/ACE markers and a provider number, and read the
 *            CEU count and type (Learning / Ethics / Supervision) when printed.
 *  - CPBAO: College of Psychologists and Behaviour Analysts of Ontario CE.
 *  - IBAO: International Behavior Analysis Organization CEUs.
 *
 * Anything without recognizable issuer markers is classified General PD.
 * Keyword-level reading is a triage, not an authority: the admin verification
 * step remains the human check, and certificates whose text is not
 * machine-readable (scanned or outline-embedded) say so explicitly.
 */

export type PdCategory = "BACB_CEU" | "CPBAO_CE" | "IBAO_CEU" | "GENERAL_PD";

export const PD_CATEGORY_LABEL: Record<PdCategory, string> = {
  BACB_CEU: "BACB CEU",
  CPBAO_CE: "CPBAO CE",
  IBAO_CEU: "IBAO CEU",
  GENERAL_PD: "General PD",
};

export interface PdClassification {
  category: PdCategory;
  ceuUnits: number | null;
  detail: string;          // what was detected, or why it fell back
  readable: boolean;       // whether any machine-readable text was found
}

/** Inflate every Flate stream and collect printable runs from raw + inflated bytes. */
export async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const chunks: Uint8Array[] = [bytes];

  const findAll = (needle: string): number[] => {
    const out: number[] = [];
    const n = needle.split("").map((c) => c.charCodeAt(0));
    for (let i = 0; i < bytes.length - n.length; i++) {
      let ok = true;
      for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) { ok = false; break; }
      if (ok) out.push(i);
    }
    return out;
  };

  const starts = findAll("stream");
  const ends = findAll("endstream");
  for (const s of starts) {
    const e = ends.find((x) => x > s);
    if (!e) continue;
    let from = s + 6;
    if (bytes[from] === 13) from++;
    if (bytes[from] === 10) from++;
    const raw = bytes.slice(from, e);
    try {
      const ds = new DecompressionStream("deflate");
      const inflated = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
      chunks.push(inflated);
    } catch { /* not deflate; raw bytes already included */ }
  }

  // Printable ASCII runs of 4+ chars from every chunk.
  let text = "";
  for (const c of chunks) {
    let run = "";
    for (const b of c) {
      if (b >= 32 && b < 127) run += String.fromCharCode(b);
      else {
        if (run.length >= 4) text += run + "\n";
        run = "";
      }
    }
    if (run.length >= 4) text += run + "\n";
  }
  return text;
}

export function classifyPdCertificate(text: string): PdClassification {
  const t = text.toLowerCase();
  const readable = /[a-z]{4,}/.test(t) && t.length > 40;

  const ceuMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:type\s*)?(?:learning\s+|ethics\s+|supervision\s+)?ceus?\b/i)
    ?? text.match(/ceus?\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  const ceuUnits = ceuMatch ? Number(ceuMatch[1]) : null;

  if (/bacb|behavior analyst certification board|\bace provider\b|\bace #|\bace no/i.test(text)) {
    const provider = text.match(/ace\s*(?:provider)?\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z]{2}-?\d{2,}|\d{4,})/i)?.[1] ?? null;
    const kind = /ethics\s+ceu/i.test(text) ? "Ethics" : /supervision\s+ceu/i.test(text) ? "Supervision" : "Learning";
    return {
      category: "BACB_CEU",
      ceuUnits,
      readable,
      detail: `BACB markers detected · ${kind} CEU${ceuUnits != null ? ` · ${ceuUnits} CEU` : " · CEU count not printed"}${provider ? ` · ACE provider ${provider}` : " · ACE provider number not detected, so a supervisor should confirm"}`,
    };
  }
  if (/cpbao|college of psychologists and behaviour analysts/i.test(text)) {
    return {
      category: "CPBAO_CE",
      ceuUnits,
      readable,
      detail: `CPBAO markers detected${ceuUnits != null ? ` · ${ceuUnits} CE` : ""}. Counts toward Ontario college continuing education.`,
    };
  }
  if (/ibao|international behavior analysis organization|\biba\s+ceu/i.test(text)) {
    return {
      category: "IBAO_CEU",
      ceuUnits,
      readable,
      detail: `IBAO markers detected${ceuUnits != null ? ` · ${ceuUnits} CEU` : ""}.`,
    };
  }
  return {
    category: "GENERAL_PD",
    ceuUnits,
    readable,
    detail: readable
      ? "No BACB, CPBAO or IBAO issuer markers found. Logged as General PD."
      : "Certificate text is not machine-readable (scanned or outline-embedded). Logged as General PD; supervisor verification confirms any CEU claim.",
  };
}
