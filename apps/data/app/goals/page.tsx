"use client";

import * as React from "react";
import {
  assignable, getSteps, listDomains, promptLabel, provenanceLabel, searchBank,
  whyNotAssignable,
  type BankEntry, type BankStep,
} from "@/lib/goal-bank";

/**
 * The Goal Bank.
 *
 * 578 goals with codes, teaching procedures and prompt-fading ladders, plus
 * everything clinicians have contributed by writing a goal for a client
 * (migration 0063). This is where you search it; assigning to a specific child
 * happens from that child's Programs tab, which is where the client is already
 * in hand.
 *
 * The status of an entry leads rather than hides: a draft is shown, searchable
 * and clearly not assignable, because a bank that quietly filters out
 * everything unapproved teaches clinicians that the review queue does not
 * matter.
 */
export default function GoalBankPage() {
  const [query, setQuery] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [domains, setDomains] = React.useState<string[]>([]);
  const [entries, setEntries] = React.useState<BankEntry[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<BankStep[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listDomains().then(setDomains).catch(() => { /* the filter is optional */ });
  }, []);

  // Debounced, so typing a code does not fire a query per keystroke.
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      searchBank(query, domain || undefined)
        .then((r) => { if (live) { setEntries(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Search failed."); })
        .finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [query, domain]);

  async function toggle(e: BankEntry) {
    if (openId === e.id) { setOpenId(null); return; }
    setOpenId(e.id);
    setSteps([]);
    try { setSteps(await getSteps(e.id)); }
    catch { /* an entry with no ladder is a real state, not an error */ }
  }

  const drafts = entries.filter((e) => !assignable(e)).length;

  return (
    <div>
      <h1 className="h-page">Goal Bank</h1>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        Search by code, name or domain. To put a goal on a client&apos;s program, open
        that client and use their Programs tab &mdash; a goal is assigned to a child,
        not from here.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
        <input
          className="input"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="RC1.01, “requests a break”, joint attention…"
          aria-label="Search the goal bank"
          style={{ flex: "1 1 280px", minWidth: 200 }}
        />
        <select
          className="input"
          value={domain}
          onChange={(ev) => setDomain(ev.target.value)}
          aria-label="Filter by domain"
          style={{ width: "auto", minWidth: 200 }}
        >
          <option value="">Every domain</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error ? <p className="pill bad">{error}</p> : null}

      <p className="sub">
        {loading ? "Searching…" : `${entries.length} goal${entries.length === 1 ? "" : "s"}`}
        {!loading && drafts > 0
          ? ` · ${drafts} still awaiting approval and not yet assignable`
          : ""}
      </p>

      {!loading && entries.length === 0 ? (
        <div className="card card-pad">
          <p className="sub" style={{ margin: 0 }}>
            Nothing matches that. Try a shorter search, or clear the domain filter.
          </p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {entries.map((e) => {
          const isOpen = openId === e.id;
          const blocked = whyNotAssignable(e);
          return (
            <div key={e.id} className="card">
              <button
                type="button"
                onClick={() => void toggle(e)}
                aria-expanded={isOpen}
                className="card-pad"
                style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: 0, cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  {e.code ? (
                    <code style={{ fontSize: "var(--text-xs)", opacity: 0.75 }}>{e.code}</code>
                  ) : null}
                  <b style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: 0 }}>{e.name}</b>
                  {/* Status as a word. A greyed-out row says "something is
                      different about this" without saying what. */}
                  {blocked ? (
                    <span className="pill warn" style={{ whiteSpace: "nowrap" }}>
                      {e.status === "draft" ? "Draft" : "Retired"}
                    </span>
                  ) : null}
                </div>
                <p className="sub" style={{ margin: "4px 0 0" }}>
                  {e.domain}{e.subDomain ? ` · ${e.subDomain}` : ""}
                  {" · "}{provenanceLabel(e)}
                  {e.stepCount > 0 ? ` · ${e.stepCount}-step ladder` : " · no ladder"}
                </p>
              </button>

              {isOpen ? (
                <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                  <p style={{ margin: "0 0 10px", lineHeight: 1.6 }}>
                    {e.operationalDefinition}
                  </p>
                  <p className="sub" style={{ margin: "0 0 10px" }}>
                    <b>Mastery:</b> {e.masteryCriteria}
                    {e.promptLevel ? ` · starts at ${promptLabel(e.promptLevel)}` : ""}
                  </p>

                  {e.teachingProcedure ? (
                    <p className="sub" style={{ margin: "0 0 10px", lineHeight: 1.6 }}>
                      <b>Teaching:</b> {e.teachingProcedure}
                    </p>
                  ) : null}

                  {blocked ? (
                    <p className="pill warn" style={{ marginBottom: 10 }}>{blocked}</p>
                  ) : null}

                  {e.needsReview && e.reviewReason ? (
                    // Said in full rather than as a badge. A clinician deciding
                    // whether to use a goal needs the reason, and "needs
                    // review" on its own is not one.
                    <p className="sub" style={{ margin: "0 0 10px" }}>
                      <b>Flagged:</b> {e.reviewReason}
                    </p>
                  ) : null}

                  {steps.length > 0 ? (
                    <ol style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                      {steps.map((s) => (
                        <li key={s.id} style={{ lineHeight: 1.5 }}>
                          {s.description}
                          {s.promptLevel ? (
                            <span className="sub"> · {promptLabel(s.promptLevel)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : e.stepCount === 0 ? (
                    <p className="sub" style={{ margin: 0 }}>
                      No teaching ladder recorded for this goal.
                    </p>
                  ) : (
                    <p className="sub" style={{ margin: 0 }}>Loading the ladder…</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
