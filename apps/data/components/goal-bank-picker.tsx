"use client";

import * as React from "react";
import {
  assignFromBank, assignable, getSteps, listDomains, provenanceLabel, searchBank,
  whyNotAssignable, type BankEntry, type BankStep,
} from "@/lib/goal-bank";

/**
 * Find a goal in the bank and put it on this client's program.
 *
 * Sits beside "New goal" on the Programs tab rather than on the Goal Bank
 * page, because assigning needs a client and this is where the client is
 * already in hand. The Goal Bank page is for browsing what exists.
 *
 * A goal is COPIED onto the program, not referenced. A program that read
 * through to the bank would change definition whenever someone edited the bank
 * entry - silently redefining a goal a therapist has been taking data against
 * for weeks, so the data no longer measures what it says it measures.
 */
export function GoalBankPicker({
  clientId, onAssigned,
}: {
  clientId: number;
  onAssigned: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [domains, setDomains] = React.useState<string[]>([]);
  const [results, setResults] = React.useState<BankEntry[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<BankStep[]>([]);
  const [startStep, setStartStep] = React.useState<number | "">("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  React.useEffect(() => { listDomains().then(setDomains).catch(() => {}); }, []);

  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchBank(query, domain || undefined)
        .then((r) => { if (live) { setResults(r.slice(0, 40)); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Search failed."); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [query, domain]);

  async function open(e: BankEntry) {
    if (openId === e.id) { setOpenId(null); return; }
    setOpenId(e.id); setSteps([]); setStartStep(""); setDone(null);
    try { setSteps(await getSteps(e.id)); } catch { /* no ladder is a real state */ }
  }

  async function assign(e: BankEntry) {
    setBusy(true); setError(null);
    try {
      await assignFromBank(e, clientId, startStep === "" ? undefined : Number(startStep));
      setDone(`${e.name} added to this client's programs.`);
      setOpenId(null);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that goal.");
    } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <p className="sub" style={{ marginTop: 0 }}>
        Search the organization&apos;s goal bank. The goal is copied onto this
        client&apos;s program, so editing the bank later will not change what you are
        taking data against.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          className="input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="RC1.01, “requests a break”, joint attention…"
          aria-label="Search the goal bank"
          style={{ flex: "1 1 260px", minWidth: 180 }}
        />
        <select
          className="input" value={domain} onChange={(e) => setDomain(e.target.value)}
          aria-label="Filter by domain" style={{ width: "auto", minWidth: 180 }}
        >
          <option value="">Every domain</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error ? <p className="pill bad">{error}</p> : null}
      {done ? <p className="pill ok">{done}</p> : null}

      <div style={{ display: "grid", gap: 8, maxHeight: 460, overflowY: "auto" }}>
        {results.map((e) => {
          const isOpen = openId === e.id;
          const blocked = whyNotAssignable(e);
          return (
            <div key={e.id} style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
              <button
                type="button" onClick={() => void open(e)} aria-expanded={isOpen}
                style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: 0, cursor: "pointer", padding: "11px 13px",
                }}
              >
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  {e.code ? <code style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>{e.code}</code> : null}
                  <b style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: 0 }}>{e.name}</b>
                  {blocked ? <span className="pill warn">{e.status === "draft" ? "Draft" : "Retired"}</span> : null}
                </span>
                <span className="sub" style={{ display: "block", marginTop: 3 }}>
                  {e.domain}{e.subDomain ? ` · ${e.subDomain}` : ""} · {provenanceLabel(e)}
                </span>
              </button>

              {isOpen ? (
                <div style={{ padding: "0 13px 13px", borderTop: "1px solid var(--line)" }}>
                  <p style={{ margin: "10px 0", lineHeight: 1.6 }}>{e.operationalDefinition}</p>
                  <p className="sub" style={{ margin: "0 0 10px" }}>
                    <b>Mastery:</b> {e.masteryCriteria}
                  </p>

                  {steps.length > 0 ? (
                    <>
                      <label className="sub" htmlFor={`step-${e.id}`}>
                        Start at which step?
                      </label>
                      <select
                        id={`step-${e.id}`} className="input"
                        value={startStep} onChange={(ev) => setStartStep(ev.target.value === "" ? "" : Number(ev.target.value))}
                        style={{ width: "auto", minWidth: 220, marginBottom: 10 }}
                      >
                        {/* Not required. A supervisor placing a child on the
                            ladder is a clinical decision, and forcing a choice
                            here would make it look like one the system needs
                            rather than one they should make. */}
                        <option value="">Not placed yet</option>
                        {steps.map((s) => (
                          <option key={s.id} value={s.stepNumber}>
                            Step {s.stepNumber}: {s.description.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  {blocked ? (
                    <p className="pill warn" style={{ marginBottom: 10 }}>{blocked}</p>
                  ) : null}

                  <button
                    className="btn" disabled={busy || !assignable(e)}
                    onClick={() => void assign(e)}
                  >
                    {busy ? "Adding…" : "Add to this client"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {results.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Nothing matches that yet.</p>
        ) : null}
      </div>
    </div>
  );
}
