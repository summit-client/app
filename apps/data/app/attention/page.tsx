"use client";

import * as React from "react";
import Link from "next/link";
import {
  attention, BUCKET_LABEL, SUPERVISOR_QUERIES,
  type AttentionItem, type Bucket, type ProgramFacts,
} from "@summit/analytics";
import { getCaseloadFacts } from "@/lib/facts";

const BUCKET_PILL: Record<Bucket, string> = {
  possible_regression: "danger", possible_plateau: "warn", mastered_without_next: "warn",
  approaching_mastery: "good", insufficient_data: "neutral", progressing: "accent",
};

export default function AttentionPage() {
  const [facts, setFacts] = React.useState<ProgramFacts[]>([]);
  const [queryId, setQueryId] = React.useState<string>("");

  React.useEffect(() => { void getCaseloadFacts().then(setFacts); }, []);

  const base = React.useMemo(() => attention(facts), [facts]);
  const query = SUPERVISOR_QUERIES.find((q) => q.id === queryId) ?? null;
  const items = query ? query.run(facts) : base.items;
  const flagged = base.items.filter((i) => i.bucket !== "progressing");

  return (
    <div>
      <h1 className="h-page">What needs my attention today?</h1>
      <p className="sub">
        Computed by the deterministic analytics engine over your caseload — every flag can show its evidence.
        No AI produced these numbers.
      </p>

      {/* bucket counts, the north-star morning answer */}
      <div className="tiles" style={{ marginTop: 20 }}>
        {(Object.keys(BUCKET_LABEL) as Bucket[])
          .filter((b) => b !== "progressing")
          .map((b) => (
            <div key={b} className="card tile">
              <div className="n">{base.counts[b] ?? 0}</div>
              <div className="l">{BUCKET_LABEL[b]}</div>
            </div>
          ))}
      </div>

      {/* canonical supervisor queries as structured filters */}
      <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="sq" className="sub" style={{ fontWeight: 600 }}>Caseload query:</label>
        <select id="sq" className="input" style={{ maxWidth: 440 }} value={queryId} onChange={(e) => setQueryId(e.target.value)}>
          <option value="">All flagged items ({flagged.length})</option>
          {SUPERVISOR_QUERIES.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
      </div>
      {query ? (
        <p className="sub" style={{ marginTop: 8 }}>
          <b>{items.length} matched</b> · &ldquo;{query.label}&rdquo; — structured result, computed deterministically.
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {(query ? items : flagged).map((item) => <AttentionCard key={`${item.programId}-${item.bucket}`} item={item} />)}
        {!facts.length ? <p className="sub">Loading caseload…</p> : null}
        {facts.length && !(query ? items : flagged).length ? (
          <div className="card card-pad"><p className="sub">Nothing matches — the caseload is progressing normally.</p></div>
        ) : null}
      </div>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{item.clientName}</b>
            <span className="sub">{item.domain ? `${item.domain} — ` : ""}{item.goalName}</span>
            <span className={`pill ${BUCKET_PILL[item.bucket]}`}>{BUCKET_LABEL[item.bucket]}</span>
          </div>
          <p style={{ marginTop: 6, fontSize: "var(--text-sm)", fontWeight: 500 }}>{item.headline}</p>
          {item.integrityPct != null ? (
            <p className="trend" style={{ marginTop: 4 }}>Treatment integrity: <b>{item.integrityPct}%</b> <span className="sub">(derived metric)</span></p>
          ) : null}
          {item.noteThemes.length ? (
            <p className="trend" style={{ marginTop: 4 }}>
              Relevant note themes <span className="sub">(clinician observation)</span>: <b>{item.noteThemes.join("; ")}</b>
            </p>
          ) : null}
          {item.goalBankNextOptions.length ? (
            <p className="trend" style={{ marginTop: 6 }}>
              <span className="pill accent">Suggested from Mount Etna Goal Bank</span>{" "}
              {item.goalBankNextOptions.join(" · ")}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button className="btn ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide evidence" : "Why am I seeing this?"}
          </button>
          <Link href={`/clients/${item.clientId}`} className="btn secondary" style={{ textDecoration: "none" }}>
            Review case
          </Link>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <p className="sub" style={{ fontWeight: 600, marginBottom: 8 }}>
            Evidence — every value computed deterministically:
          </p>
          <div className="table-wrap">
            <table className="data" style={{ maxWidth: 560 }}>
              <tbody>
                {Object.entries(item.evidence).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: "var(--muted)" }}>{k}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {v === null ? "—" : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
