"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ClinicalEvidencePacket, GeneratedClinicalReport, ReportBlock } from "@summit/clinical-ai";
import { PdfExport, PrintSection } from "@/components/pdf-export";
import { getLatestClinicalReport, reviseClinicalReport, saveClinicalReportProgress } from "@/lib/data";

type Status = "draft" | "reviewed" | "approved" | "signed";
const STATUS_FLOW: Status[] = ["draft", "reviewed", "approved", "signed"];
const STATUS_LABEL: Record<Status, string> = {
  draft: "AI Generated Draft", reviewed: "Clinician Reviewed", approved: "Approved", signed: "Signed · Locked",
};

export default function ReportWorkspacePage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = React.useState(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [end, setEnd] = React.useState(today);
  const [tone, setTone] = React.useState<"clinical" | "parent_friendly" | "funder_friendly">("clinical");
  const [busy, setBusy] = React.useState(false);
  const [packet, setPacket] = React.useState<ClinicalEvidencePacket | null>(null);
  const [report, setReport] = React.useState<GeneratedClinicalReport | null>(null);
  const [aiMessage, setAiMessage] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<Status>("draft");
  const [version, setVersion] = React.useState(1);
  // Identifies this document (stable across revisions) in `clinical_reports`.
  // Null until the first generate() or an existing report is resumed below.
  const [reportGroup, setReportGroup] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [resuming, setResuming] = React.useState(true);
  // Set right before a resume-from-DB load applies state, so the very next
  // autosave effect run (which would otherwise immediately re-upsert the
  // exact row we just read - a no-op the immutability trigger would still
  // reject once it's signed) is skipped instead.
  const suppressNextSave = React.useRef(false);

  // Resume an in-progress or already-signed report instead of always
  // starting from a blank draft — previously this workspace had no memory
  // at all: every reload (or every visit to a client whose report was
  // already signed) started over from "draft" with nothing generated.
  React.useEffect(() => {
    let cancelled = false;
    setResuming(true);
    getLatestClinicalReport(clientId)
      .then((rec) => {
        if (cancelled || !rec) return;
        suppressNextSave.current = true;
        setReportGroup(rec.reportGroup);
        setVersion(rec.version);
        // "locked" is a further step this workspace's own flow never
        // produces, but could exist from another surface — treat it the
        // same as "signed": fully reviewed, no more edits.
        setStatus(rec.status === "locked" ? "signed" : (rec.status as Status));
        setStart(rec.periodStart);
        setEnd(rec.periodEnd);
        setPacket(rec.packet);
        setReport({
          reportId: `${rec.reportGroup}-v${rec.version}`,
          packetId: rec.packetId ?? "", blocks: rec.blocks, modelNote: rec.modelNote ?? "",
        });
      })
      .catch((e) => setAiMessage(e instanceof Error ? e.message : "Could not load an existing report for this client."))
      .finally(() => { if (!cancelled) setResuming(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  // Debounced autosave: any time the report's content or status changes
  // while it isn't yet signed, persist it. This is what actually makes
  // "Sign & lock" durable — without it, the whole review flow was React
  // state only and a reload silently discarded a "locked" report.
  React.useEffect(() => {
    if (!report || !reportGroup) return;
    if (suppressNextSave.current) { suppressNextSave.current = false; return; }
    const t = setTimeout(() => {
      setSaveError(null);
      void saveClinicalReportProgress({
        reportGroup, version, clientId, periodStart: start, periodEnd: end,
        packetId: report.packetId || null, blocks: report.blocks, modelNote: report.modelNote || null,
        status,
      }).catch((e) => setSaveError(e instanceof Error ? e.message : "Could not save this report's progress."));
    }, 800);
    return () => clearTimeout(t);
  }, [report, status, reportGroup, version, clientId, start, end]);

  const generate = async (opts?: { tone?: typeof tone; length?: "standard" | "short" }) => {
    setBusy(true); setAiMessage(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, startDate: start, endDate: end, tone: opts?.tone ?? tone, length: opts?.length ?? "standard" }),
      });
      const data = await res.json();
      if (data.ok) {
        setPacket(data.packet ?? null);
        setReport(data.report ?? null);
        setStatus("draft");
        setReportGroup((rg) => rg ?? crypto.randomUUID());
        if (data.aiUnavailable) setAiMessage(data.message ?? "AI assistance is temporarily unavailable. Your clinical data and calculated results remain available.");
      } else {
        setAiMessage(data.error ?? "Report generation failed.");
      }
    } catch {
      setAiMessage("AI assistance is temporarily unavailable. Your clinical data and calculated results remain available.");
    } finally {
      setBusy(false);
    }
  };

  const setBlock = (blockId: string, patch: Partial<ReportBlock>) =>
    setReport((r) => r ? { ...r, blocks: r.blocks.map((b) => (b.blockId === blockId ? { ...b, ...patch } : b)) } : r);

  const allReviewed = report?.blocks.every((b) => b.reviewState === "accepted" || b.reviewState === "edited") ?? false;
  const advance = () => {
    const i = STATUS_FLOW.indexOf(status);
    if (i < STATUS_FLOW.length - 1) setStatus(STATUS_FLOW[i + 1]);
  };
  const revise = async () => {
    if (!reportGroup) { setStatus("draft"); setVersion((v) => v + 1); return; }
    try {
      const newVersion = await reviseClinicalReport(reportGroup, version);
      setVersion(newVersion);
      setStatus("draft");
    } catch (e) {
      setAiMessage(e instanceof Error ? e.message : "Could not create a new revision.");
    }
  };

  return (
    <div>
      <Link href={`/clients/${clientId}`} className="sub" style={{ color: "var(--accent)" }}>← Back to client</Link>
      <h1 className="h-page" style={{ marginTop: 8 }}>Progress report</h1>
      <p className="sub">
        Evidence-first pipeline: retrieval → deterministic analytics → evidence packet → drafting → validation.
        The AI drafts language only; every number is computed and verified by code. You decide.
      </p>

      {/* organization document templates (replace the Word master-template workflow) */}
      <div className="card card-pad" style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>Organization document templates</b>
          <p className="sub">Structured versions of the master Word templates — evidence sections auto-fill; draft → proofed → final replaces the Drive-copy and upload loop.</p>
        </div>
        <Link href={`/clients/${clientId}/report/bar`} className="btn secondary" style={{ textDecoration: "none" }}>BAR Treatment Plan Report</Link>
        <Link href={`/clients/${clientId}/report/block-summary`} className="btn secondary" style={{ textDecoration: "none" }}>End of Block Summary</Link>
      </div>

      {/* generation controls */}
      <div className="card card-pad" style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field"><label htmlFor="r-start">From</label>
          <input id="r-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} disabled={status === "signed"} /></div>
        <div className="field"><label htmlFor="r-end">To</label>
          <input id="r-end" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} disabled={status === "signed"} /></div>
        <div className="field"><label htmlFor="r-tone">Audience</label>
          <select id="r-tone" className="input" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} disabled={status === "signed"}>
            <option value="clinical">Clinical</option>
            <option value="parent_friendly">Parent-friendly</option>
            <option value="funder_friendly">Funder-friendly</option>
          </select></div>
        <button className="btn lg" onClick={() => generate()} disabled={busy || resuming || status === "signed"}>
          {busy ? "Assembling evidence…" : report ? "Regenerate report" : "Generate progress report"}
        </button>
        <span className={`pill ${status === "signed" ? "good" : "accent"}`}>v{version} · {STATUS_LABEL[status]}</span>
        {report ? (
          <PdfExport title="Progress Report" subtitle={`Reporting period ${start} → ${end} · v${version} · ${STATUS_LABEL[status]}`}>
            {report.blocks.map((b) => <PrintSection key={b.blockId} heading={b.section} text={b.text} />)}
            <PrintSection heading="Provenance" text={`${report.modelNote}\nEvidence packet ${report.packetId} — every number verified against computed values.`} />
          </PdfExport>
        ) : null}
      </div>

      {resuming ? <p className="sub" style={{ marginTop: 12 }}>Checking for an existing report…</p> : null}

      {aiMessage ? (
        <div className="card card-pad" role="status" style={{ marginTop: 12, borderLeft: "3px solid var(--warn)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{aiMessage}</p>
        </div>
      ) : null}
      {saveError ? (
        <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}>
          <p className="sub" style={{ color: "var(--ink)" }}>{saveError}</p>
        </div>
      ) : null}

      {/* draft blocks with clinician controls */}
      {report ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          <p className="sub">{report.modelNote} · packet {report.packetId}</p>
          {report.blocks.map((b) => (
            <BlockCard key={b.blockId} block={b} packet={packet} locked={status === "signed"}
              onPatch={(p) => setBlock(b.blockId, p)}
              onRegenerate={() => generate()}
              onTone={(t) => generate({ tone: t })}
              onShorten={() => generate({ length: "short" })}
            />
          ))}

          {/* review flow: draft -> reviewed -> approved -> signed(locked) */}
          <div className="card card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {status !== "signed" ? (
              <>
                <button className="btn" onClick={advance}
                  disabled={status === "draft" && !allReviewed}>
                  {status === "draft" ? "Mark reviewed" : status === "reviewed" ? "Approve" : "Sign & lock"}
                </button>
                {status === "draft" && !allReviewed ? (
                  <span className="sub">Accept or edit every section to continue. You are responsible for the content.</span>
                ) : null}
              </>
            ) : (
              <>
                <span className="pill good">Signed — this version is locked and immutable.</span>
                <button className="btn secondary" onClick={revise}>Create revision (v{version + 1})</button>
              </>
            )}
          </div>
        </div>
      ) : packet ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <b>Evidence packet ready ({packet.goals.length} goals, {packet.serviceSummary.sessionsAnalyzed} sessions analyzed).</b>
          <p className="sub">Narrative drafting was unavailable; the calculated evidence below remains usable.</p>
          {packet.goals.map((g) => (
            <p key={g.goalId} className="trend" style={{ marginTop: 8 }}>
              {g.goalName}: baseline <b>{g.baselinePct ?? "—"}%</b> → current <b>{g.currentMeanPct ?? "—"}%</b> · {g.sessionsAnalyzed} sessions · integrity {g.treatmentIntegrityPct ?? "—"}%
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BlockCard({ block, packet, locked, onPatch, onRegenerate, onTone, onShorten }: {
  block: ReportBlock;
  packet: ClinicalEvidencePacket | null;
  locked: boolean;
  onPatch: (p: Partial<ReportBlock>) => void;
  onRegenerate: () => void;
  onTone: (t: "clinical" | "parent_friendly" | "funder_friendly") => void;
  onShorten: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [showEvidence, setShowEvidence] = React.useState(false);
  const evidence = packet?.sources.filter((s) => block.evidenceIds.includes(s.id)) ?? [];

  return (
    <div className="card card-pad" style={block.validation.status === "flagged" ? { borderLeft: "3px solid var(--danger)" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b>{block.section}</b>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="pill neutral">{block.evidenceType.replace(/_/g, " ")}</span>
          <span className={`pill ${block.validation.status === "verified" ? "good" : "danger"}`}>
            {block.validation.status === "verified" ? "Numbers verified" : `Unsupported: ${block.validation.unsupportedValues.join(", ")}`}
          </span>
          {block.reviewState !== "pending" ? <span className="pill accent">{block.reviewState.replace(/_/g, " ")}</span> : null}
        </span>
      </div>

      {editing ? (
        <textarea className="input" style={{ marginTop: 10 }} value={block.text} rows={4}
          onChange={(e) => onPatch({ text: e.target.value, reviewState: "edited" })} />
      ) : (
        <p style={{ marginTop: 10, fontSize: "var(--text-md)", lineHeight: 1.6 }}>{block.text}</p>
      )}

      {!locked ? (
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => onPatch({ reviewState: "accepted" })}>Accept</button>
          <button className="btn secondary" onClick={() => setEditing((v) => !v)}>{editing ? "Done editing" : "Edit"}</button>
          <button className="btn secondary" onClick={onRegenerate}>Regenerate</button>
          <button className="btn ghost" onClick={() => setShowEvidence((v) => !v)}>Show evidence</button>
          <button className="btn ghost" onClick={() => onTone("clinical")}>Make more objective</button>
          <button className="btn ghost" onClick={onShorten}>Shorten</button>
          <button className="btn ghost" onClick={() => onTone("parent_friendly")}>Parent-friendly</button>
          <button className="btn ghost" onClick={() => onTone("funder_friendly")}>Funder-friendly</button>
          <button className="btn ghost" style={{ color: "var(--warn)" }} onClick={() => onPatch({ reviewState: "flagged_for_review" })}>Flag for review</button>
        </div>
      ) : null}

      {showEvidence ? (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <p className="sub" style={{ fontWeight: 600 }}>Evidence behind this section:</p>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
            {block.evidenceIds.map((id) => {
              const src = evidence.find((s) => s.id === id);
              return <li key={id}><span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{id}</span>{src?.label ? ` — ${src.label}` : src ? ` — ${src.kind.replace(/_/g, " ")}` : ""}</li>;
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
