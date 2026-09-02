"use client";

import { HrGate } from "@/components/hr-provider";

import * as React from "react";
import { acknowledgePolicy, hr, openPolicy } from "@/lib/hr-store";
import { useHrAction, WriteError } from "@/components/hr-provider";

/**
 * Policies & Handbook. Versioned documents with an open, read, acknowledge
 * trail. A new version resets acknowledgement so the record always names the
 * version the employee actually agreed to. Employment contracts, offer letters
 * and compensation agreements are out of scope for this module by design.
 */
export default function PoliciesPage() {
  return (
    <HrGate>
      <PoliciesScreen />
    </HrGate>
  );
}

function PoliciesScreen() {
  const { run, error: writeError, clearError } = useHrAction();
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [preview, setPreview] = React.useState<{ id: string; name: string; url: string | null; content: string | null } | null>(null);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading policies…</p>;

  const s = hr();
  const ackFor = (id: string, version: string) => s.acks.find((a) => a.policyId === id && a.version === version);

  const open = (id: string, version: string, name: string, url: string | null, content: string | null) =>
    void run(async () => {
      await openPolicy(id, version, name);
      setPreview({ id, name, url: url ? (url.includes("drive.google.com") ? url.replace(/\/view.*$/, "/preview") : url) : null, content });
      force();
    });

  const acknowledge = (id: string, version: string, name: string) =>
    void run(async () => { await acknowledgePolicy(id, version, name); force(); });

  const outstanding = s.policies.filter((p) => p.required && !ackFor(p.id, p.version)?.acknowledgedAt).length;

  return (
    <div>
      <h1 className="h-page">Policies &amp; Handbook</h1>
      <WriteError error={writeError} onDismiss={clearError} />
      <p className="sub" style={{ maxWidth: "72ch" }}>
        {outstanding > 0
          ? `${outstanding} required acknowledgement${outstanding === 1 ? "" : "s"} outstanding. Open a policy, read it, then acknowledge the version you read.`
          : "Every required policy acknowledgement is current."}
      </p>

      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <table className="data">
          <thead><tr><th>Policy</th><th>Version</th><th>Effective</th><th>Owner</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {s.policies.map((p) => {
              const a = ackFor(p.id, p.version);
              const status = a?.acknowledgedAt ? "acknowledged" : a?.openedAt ? "opened" : "not opened";
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b>{p.required ? <span className="pill neutral" style={{ marginLeft: 8 }}>required</span> : null}</td>
                  <td>{p.version}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.effectiveDate}</td>
                  <td>{p.owner}</td>
                  <td>
                    <span className={`pill ${a?.acknowledgedAt ? "good" : a?.openedAt ? "accent" : "warn"}`}>{status}</span>
                    {a?.acknowledgedAt ? <div className="trend">{a.acknowledgedAt.slice(0, 10)}</div> : null}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn ghost" onClick={() => open(p.id, p.version, p.name, p.url, p.content)}>
                      Preview
                    </button>
                    {a?.openedAt && !a.acknowledgedAt ? (
                      <button className="btn" style={{ marginLeft: 8 }} onClick={() => acknowledge(p.id, p.version, p.name)}>
                        Acknowledge
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview ? (
        <div className="card" style={{ marginTop: 14, overflow: "hidden" }}>
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontSize: "var(--text-sm)" }}>{preview.name}</b>
            <button className="btn ghost" onClick={() => setPreview(null)}>Close</button>
          </div>
          {/* Text first when the policy has it. A policy written into Summit
              is the policy; an attached document is a second copy of it, and
              showing the copy in preference to the original meant every
              text-only policy previewed as though nothing had been written. */}
          {preview.content ? (
            <div className="card-pad" style={{ maxWidth: "72ch" }}>
              {/* preserve-line so paragraph breaks in a policy survive, with no
                  dangerouslySetInnerHTML anywhere near text an administrator typed. */}
              <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {preview.content}
              </p>
              {preview.url ? (
                <p style={{ marginTop: 12 }}>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    Open the signed document
                  </a>
                </p>
              ) : null}
            </div>
          ) : preview.url ? (
            <>
              <iframe
                src={preview.url}
                title={`Preview of ${preview.name}`}
                style={{ width: "100%", height: "70vh", border: 0, display: "block" }}
              />
              {/* Always shown, not a fallback rendered on error - a
                  cross-origin frame that refuses to load fires no event this
                  page can see, so a Drive file that is not shared "anyone with
                  the link" renders as a blank rectangle with nothing to click.
                  A link that always works is the honest answer to a frame that
                  sometimes does not. */}
              <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                <p className="trend" style={{ margin: 0 }}>
                  Not loading? The document may need permission.{" "}
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    Open it in a new tab
                  </a>
                  .
                </p>
              </div>
            </>
          ) : (
            <div className="card-pad" style={{ maxWidth: "72ch" }}>
              {/* Says which of the two things is missing, and who fixes it.
                  "Not attached yet" was shown for a policy with text as well as
                  for one with neither, so it never told anybody anything. */}
              <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                This policy has no text and no attached document yet.
              </p>
              <p className="trend" style={{ marginTop: 12 }}>
                An administrator can add either from the policy record. You can still
                acknowledge the version once the content is here.
              </p>
            </div>
          )}
        </div>
      ) : null}

      <p className="sub" style={{ marginTop: 16 }}>
        Acknowledgement records the policy version, the moment you opened it and the moment you acknowledged it. When a
        policy changes materially, an administrator can require acknowledgement again.
      </p>
    </div>
  );
}
