"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getClients, getPrograms } from "@/lib/data";
import { administrations, instrumentById, overallPct } from "@/lib/instruments";
import { blockFor, DOC_TEMPLATES, loadDoc, saveDoc, type DocDraft, type DocTemplate } from "@/lib/clinical-docs";
import { PdfExport, PrintSection } from "@/components/pdf-export";
import type { ClientRow, Program } from "@/lib/types";

/**
 * Structured clinical documents (BAR Treatment Plan Report, End of Block
 * Summary). Evidence sections auto-fill from the client record; narrative
 * sections are written in place. Draft → Proofed → Final replaces the
 * copy-in-Drive / upload-to-JaneApp loop: the signed final IS the submission.
 */
export default function ClinicalDocPage() {
  const params = useParams<{ id: string; template: string }>();
  const clientId = Number(params.id);
  const template = DOC_TEMPLATES.find((t) => t.slug === params.template);
  const [client, setClient] = React.useState<ClientRow | null>(null);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [doc, setDoc] = React.useState<DocDraft | null>(null);

  React.useEffect(() => {
    void getClients().then((cs) => setClient(cs.find((c) => c.id === clientId) ?? null));
    void getPrograms(clientId).then(setPrograms);
  }, [clientId]);

  React.useEffect(() => {
    if (!template) return;
    setDoc(loadDoc(clientId, template.slug) ?? {
      clientId, slug: template.slug, content: {}, status: "draft", writtenBy: "", proofedBy: "", updatedAt: "",
    });
  }, [clientId, template]);

  if (!template) return <p className="sub">Unknown document template.</p>;
  if (!client || !doc) return <p className="sub">Loading…</p>;

  const autofillText = (section: DocTemplate["sections"][number]): string => {
    switch (section.autofill) {
      case "client_info": {
        const b = blockFor(clientId);
        return [
          `Name: ${client.name}`,
          client.age != null ? `Age: ${client.age}` : null,
          `Service: ${client.serviceType ?? "—"} · ${client.funding ?? "—"}`,
          client.supervisor ? `Supervisor: ${client.supervisor}` : null,
          b ? `Treatment block: ${b.name} (${b.start} → ${b.end})` : null,
        ].filter(Boolean).join("\n");
      }
      case "goals":
        return programs
          .filter((p) => p.status === "active" || p.status === "maintenance")
          .map((p, i) => {
            const latest = p.last5.at(-1);
            return `Goal #${i + 1} — ${p.name} (${p.domain ?? "—"}): ${p.operationalDefinition} Mastery: ${p.masteryCriteria}.${latest != null ? ` Current: ${latest}${p.mode === "frequency" ? "/hr" : "%"}.` : ""}`;
          }).join("\n\n");
      case "assessments": {
        const past = administrations(clientId);
        if (!past.length) return "No assessment administrations recorded yet — administer from the Assessments tab and this section fills itself.";
        return past.map((a) => {
          const ins = instrumentById(a.instrumentId)!;
          return `${ins.name}: administered ${a.date.slice(0, 10)}, overall ${overallPct(ins, a)}% mastery.${a.notes ? ` Notes: ${a.notes}` : ""}`;
        }).join("\n");
      }
      case "service_delivery":
        return `ABA services are delivered in a structured format targeting social, communication and self-regulation skills. Sessions incorporate evidence-based strategies including modeling, prompting, reinforcement and guided practice to support skill acquisition and generalization, following a consistent routine to promote predictability, engagement and participation.`;
      case "school_info":
        return "School, grade/classroom type, teacher, accommodations — from the caregiver interview when completed.";
      default:
        return "";
    }
  };

  const valueFor = (s: DocTemplate["sections"][number]) => doc.content[s.id] ?? autofillText(s);
  const patch = (id: string, v: string) => setDoc({ ...doc, content: { ...doc.content, [id]: v } });
  const persist = (next?: Partial<DocDraft>) => {
    const merged = { ...doc, ...next };
    // freeze current autofill text into the draft so what was proofed is what is signed
    for (const s of template.sections) if (merged.content[s.id] == null) merged.content[s.id] = autofillText(s);
    saveDoc(merged);
    setDoc(merged);
  };

  const statusPill = doc.status === "final" ? "good" : doc.status === "proofed" ? "accent" : "warn";

  return (
    <div>
      <Link href={`/clients/${clientId}/report`} className="sub" style={{ color: "var(--accent)" }}>← Back to reports</Link>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{template.name}</h2>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className={`pill ${statusPill}`}>{doc.status}</span>
          <PdfExport title={template.name} subtitle={`${client.name} · status: ${doc.status}`}>
            {template.sections.map((s) => <PrintSection key={s.id} heading={s.title} text={valueFor(s)} />)}
            <PrintSection heading="Sign-off" text={`Written by: ${doc.writtenBy || "—"}\nProofed by: ${doc.proofedBy || "—"}\nStatus: ${doc.status}${doc.updatedAt ? ` (${doc.updatedAt.slice(0, 10)})` : ""}`} />
          </PdfExport>
        </span>
      </div>
      <p className="sub">{template.cadence} The signed final is the clinical documentation submission — no separate upload.</p>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {template.sections.map((s) => (
          <div key={s.id} className="field">
            <label htmlFor={`doc-${s.id}`}>
              {s.title}{s.autofill ? <span className="pill accent" style={{ marginLeft: 8 }}>auto-filled from record</span> : null}
            </label>
            <p className="sub" style={{ marginTop: 0, marginBottom: 4 }}>{s.guidance}</p>
            <textarea id={`doc-${s.id}`} className="input" rows={s.autofill ? 5 : 3}
              value={valueFor(s)} onChange={(e) => patch(s.id, e.target.value)} disabled={doc.status === "final"} />
          </div>
        ))}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", maxWidth: 560 }}>
          <div className="field"><label htmlFor="doc-writer">Written by</label>
            <input id="doc-writer" className="input" value={doc.writtenBy} disabled={doc.status === "final"}
              onChange={(e) => setDoc({ ...doc, writtenBy: e.target.value })} /></div>
          <div className="field"><label htmlFor="doc-proofer">Proofed by</label>
            <input id="doc-proofer" className="input" value={doc.proofedBy} disabled={doc.status === "final"}
              onChange={(e) => setDoc({ ...doc, proofedBy: e.target.value })} /></div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {doc.status === "draft" ? (
            <>
              <button className="btn secondary" onClick={() => persist()}>Save draft</button>
              <button className="btn" onClick={() => persist({ status: "proofed" })} disabled={!doc.writtenBy.trim() || !doc.proofedBy.trim()}>
                Mark proofed (peer/supervisor reviewed)
              </button>
            </>
          ) : null}
          {doc.status === "proofed" ? (
            <>
              <button className="btn secondary" onClick={() => persist({ status: "draft" })}>Return to draft</button>
              <button className="btn" onClick={() => persist({ status: "final" })}>Finalize — sign &amp; file</button>
            </>
          ) : null}
          {doc.status === "final" ? (
            <p className="sub">Finalized {doc.updatedAt.slice(0, 10)} · written by {doc.writtenBy} · proofed by {doc.proofedBy}. Amendments require a new version.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
