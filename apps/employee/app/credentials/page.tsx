"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import Link from "next/link";
import {
  CATEGORY_LABEL, computeCompliance, CREDENTIAL_LABEL, CREDENTIAL_RULES, maximizeMyCredits,
  type CredentialKind, type EmployeeCredential,
} from "@/lib/credentials";
import { hr, removeCredential, saveCredential } from "@/lib/hr-store";

/**
 * My Credentials. One compliance tracker per credential, using the rule
 * version that governs that credential's cycle. Unique activity hours and
 * requirements satisfied are shown as separate numbers, so overlapping content
 * categories never inflate a total.
 */
export default function CredentialsPage() {
  return (
    <HrGate>
      <CredentialsScreen />
    </HrGate>
  );
}

function CredentialsScreen() {
  const [ready, setReady] = React.useState(false);
  const [editing, setEditing] = React.useState<EmployeeCredential | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading credentials…</p>;

  const s = hr();
  const compliances = s.credentials
    .map((c) => computeCompliance(c, s.allocations, s.activities))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const maximize = maximizeMyCredits(compliances);
  const unitLabel = (u: string) => (u === "CPD_HOUR" ? "CPD hours" : `${u}s`);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page">My Credentials</h1>
          <p className="sub">One activity, recorded once, allocated per credential.</p>
        </div>
        <button className="btn" onClick={() => setEditing(blankCredential())}>Add credential</button>
      </div>

      {err ? <div className="card card-pad" role="alert" style={{ marginTop: 12, borderLeft: "3px solid var(--danger)" }}><p className="sub" style={{ color: "var(--ink)" }}>{err}</p></div> : null}

      {editing ? (
        <CredentialForm
          value={editing}
          busy={busy}
          onCancel={() => { setEditing(null); setErr(null); }}
          onSave={async (c) => {
            setBusy(true); setErr(null);
            try { await saveCredential(c); setEditing(null); }
            catch (e) { setErr(e instanceof Error ? e.message : "Could not save the credential."); }
            finally { setBusy(false); }
          }}
        />
      ) : null}

      {!s.credentials.length && !editing ? (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <b>No credentials recorded</b>
          <p className="sub">Add your BCBA, Ontario RBA, IBA or other registration, including its number, and Summit tracks the cycle against the governing rules.</p>
        </div>
      ) : null}

      {compliances.map((c) => {
        const pct = Math.min(100, Math.round((c.totalCompleted / c.totalRequired) * 100));
        const daysLeft = Math.round((new Date(c.credential.cycleEnd).getTime() - Date.now()) / 86_400_000);
        return (
          <div key={c.credential.id} className="card card-pad" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <b>{c.rule.label}</b>
                <span className="pill neutral" style={{ marginLeft: 8 }}>{c.rule.issuer}</span>
                <span className={`pill ${c.credential.status === "GOOD_STANDING" ? "good" : "warn"}`} style={{ marginLeft: 6 }}>
                  {c.credential.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </div>
              <span className="trend" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  {c.credential.number ? <>No. <b>{c.credential.number}</b> · </> : <span style={{ color: "var(--warn)" }}>number not recorded · </span>}
                  cycle {c.credential.cycleStart} to {c.credential.cycleEnd}
                  {daysLeft <= 120 && daysLeft >= 0 ? ` · renews in ${daysLeft} days` : ""}
                </span>
                <button className="btn ghost" style={{ padding: "3px 9px" }} onClick={() => setEditing({ ...c.credential })}>Edit</button>
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <span className={`meter ${c.remaining === 0 ? "good" : ""}`} style={{ maxWidth: 280 }}>
                <div style={{ width: `${pct}%` }} />
              </span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>
                {c.totalCompleted} of {c.totalRequired} {unitLabel(c.rule.unit)}
              </b>
              {c.remaining > 0 ? <span className="trend">{c.remaining} remaining</span> : <span className="pill good">complete</span>}
              <span className="trend">rule version {c.rule.version}</span>
            </div>

            {c.categories.length ? (
              <div className="attn" style={{ marginTop: 10 }}>
                {c.categories.map((cat) => (
                  <div key={cat.category}>
                    <span style={{ minWidth: 220 }}>
                      {CATEGORY_LABEL[cat.category]}
                      {cat.conditional ? <span className="trend"> {cat.conditional}</span> : null}
                    </span>
                    <span className={`meter ${cat.remaining === 0 ? "good" : "warn"}`} style={{ maxWidth: 160 }}>
                      <div style={{ width: `${cat.minimum ? Math.min(100, Math.round((cat.completed / cat.minimum) * 100)) : 100}%` }} />
                    </span>
                    <span className="trend" style={{ minWidth: 130, textAlign: "right" }}>
                      {cat.completed} of {cat.minimum} minimum
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <details style={{ marginTop: 10 }}>
              <summary className="trend" style={{ cursor: "pointer" }}>Rule details and instructions</summary>
              {c.rule.notes.map((n) => <p key={n} className="sub">{n}</p>)}
              {c.flags.map((f) => <p key={f} className="rule-note">{f}</p>)}
            </details>
          </div>
        );
      })}

      <h2 className="section-title">Maximize my credits</h2>
      <div className="card card-pad">
        {maximize.outstanding.length ? (
          <>
            <b style={{ fontSize: "var(--text-sm)" }}>Still required</b>
            <div className="attn" style={{ marginTop: 6 }}>
              {maximize.outstanding.map((o) => (
                <div key={o.credential}>
                  <span><b>{o.credential}</b></span>
                  <span className="trend" style={{ maxWidth: "44ch", textAlign: "right" }}>{o.items.join(" · ")}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="sub">Every tracked requirement is currently satisfied.</p>
        )}
        {maximize.suggestions.length ? (
          <>
            <b style={{ fontSize: "var(--text-sm)", display: "block", marginTop: 14 }}>Efficient combinations</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--muted)", display: "flex", flexDirection: "column", gap: 6 }}>
              {maximize.suggestions.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <p className="rule-note">Credit is confirmed only when the activity is verified against the governing requirements.</p>
          </>
        ) : null}
        <p className="sub" style={{ marginTop: 12 }}>
          Record activities in <Link href="/pd" style={{ color: "var(--accent)" }}>Professional Development</Link>, then allocate them per credential.
        </p>
      </div>

      <h2 className="section-title">Rule versions in effect</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Credential</th><th>Issuer</th><th>Version</th><th>Effective</th><th>Cycle</th><th>Total</th><th>Source</th></tr></thead>
          <tbody>
            {CREDENTIAL_RULES.map((r) => (
              <tr key={`${r.credential}-${r.version}`}>
                <td><b>{r.label}</b></td>
                <td>{r.issuer}</td>
                <td>{r.version}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.effectiveDate}{r.endDate ? ` to ${r.endDate}` : ""}</td>
                <td>{r.cycleYears} years</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.totalRequired} {unitLabel(r.unit)}</td>
                <td>
                  <span className={`pill ${r.sourceStatus === "VERIFIED" ? "good" : "warn"}`}>
                    {r.sourceStatus === "VERIFIED" ? "verified" : "requires administrator verification"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="trend" style={{ cursor: "pointer" }}>How rule versions change</summary>
        <p className="sub">
          Rules are configurable, versioned data. An administrator uploads the governing handbook, reviews the proposed
          changes, and approves a new version. Nothing changes a professional regulation on its own.
        </p>
      </details>
    </div>
  );
}


/** A credential the employee has not saved yet. */
function blankCredential(): EmployeeCredential {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
  return { id: `new-${Date.now().toString(36)}`, credential: "BCBA", number: "", cycleStart: start, cycleEnd: end, status: "GOOD_STANDING" };
}

const KINDS: CredentialKind[] = ["BCBA", "BCaBA", "RBT", "ONT_RBA", "IBA_PRECERT", "IBA_RECERT", "IBT"];

/**
 * Add or edit a credential. The registration number is the field auditors and
 * funders ask for, so it sits beside the credential itself and appears on the
 * card once saved.
 */
function CredentialForm({
  value, busy, onSave, onCancel,
}: {
  value: EmployeeCredential;
  busy: boolean;
  onSave: (c: EmployeeCredential) => void;
  onCancel: () => void;
}) {
  const [f, setF] = React.useState<EmployeeCredential>(value);
  React.useEffect(() => setF(value), [value]);
  const isNew = f.id.startsWith("new-");
  const set = <K extends keyof EmployeeCredential>(k: K, v: EmployeeCredential[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="card card-pad" style={{ marginTop: 14, display: "grid", gap: 12 }}>
      <b>{isNew ? "Add a credential" : `Edit ${CREDENTIAL_LABEL[f.credential] ?? f.credential}`}</b>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label htmlFor="cr-kind">Credential</label>
          <select id="cr-kind" className="input" value={f.credential}
            onChange={(e) => set("credential", e.target.value as CredentialKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{CREDENTIAL_LABEL[k] ?? k}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="cr-number">Credential / registration number</label>
          <input id="cr-number" className="input" value={f.number} placeholder="e.g. 1-24-88104"
            onChange={(e) => set("number", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cr-status">Standing</label>
          <select id="cr-status" className="input" value={f.status}
            onChange={(e) => set("status", e.target.value as EmployeeCredential["status"])}>
            <option value="GOOD_STANDING">Good standing</option>
            <option value="PENDING">Pending</option>
            <option value="LAPSED">Lapsed</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field">
          <label htmlFor="cr-start">Cycle starts</label>
          <input id="cr-start" type="date" className="input" value={f.cycleStart}
            onChange={(e) => set("cycleStart", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cr-end">Cycle ends (renewal)</label>
          <input id="cr-end" type="date" className="input" value={f.cycleEnd}
            onChange={(e) => set("cycleEnd", e.target.value)} />
        </div>
      </div>
      <p className="trend">
        The cycle dates decide which rule version governs this credential. Historical cycles keep the rules that
        applied at the time.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy || !f.cycleStart || !f.cycleEnd || f.cycleEnd <= f.cycleStart}
          onClick={() => onSave(f)}>
          {busy ? "Saving…" : "Save credential"}
        </button>
        <button className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        {!isNew ? (
          <button className="btn ghost" style={{ marginLeft: "auto", color: "var(--danger)" }} disabled={busy}
            onClick={() => { void removeCredential(f.id); onCancel(); }}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}