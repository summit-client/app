"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  IS_PREVIEW, getBudgets, getEntries, getPositions, money, postEntry, reconcile, saveBudget,
  type Budget, type Entry, type EntryKind, type Position,
} from "@/lib/funding";

/**
 * Funding — the clinic's side of the client's money.
 *
 * The family sees the same figures in their own portal, derived from the same
 * view. This is where the allocation is recorded, charges and credits are
 * posted, and entries are reconciled against what the funder says it paid.
 *
 * Charges from delivered sessions arrive here on their own (migration 0030);
 * what gets typed on this screen is the rest — an allocation, a manual
 * adjustment, a credit for a session the clinic cancelled.
 */

const today = () => new Date().toISOString().slice(0, 10);

export default function FundingPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);

  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<Budget | "new" | null>(null);
  const [posting, setPosting] = React.useState<Budget | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const bs = await getBudgets(clientId);
      const [ps, es] = await Promise.all([getPositions(clientId), getEntries(bs.map((b) => b.id))]);
      setBudgets(bs); setPositions(ps); setEntries(es); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load funding.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  React.useEffect(() => { void load(); }, [load]);

  const positionOf = (id: string) => positions.find((p) => p.budgetId === id);
  const total = positions.reduce(
    (acc, p) => {
      const b = budgets.find((x) => x.id === p.budgetId);
      return { allocated: acc.allocated + (b?.allocatedAmount ?? 0), spent: acc.spent + p.spentToDate };
    },
    { allocated: 0, spent: 0 },
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function doReconcile() {
    const ids = [...selected];
    if (!ids.length) return;
    try { await reconcile(ids); setSelected(new Set()); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reconcile."); }
  }

  if (loading) return <p className="sub">Loading funding…</p>;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {IS_PREVIEW ? <span className="pill warn">Preview data</span> : null}
      {error ? <div className="card card-pad" role="alert" style={{ borderColor: "var(--bad)" }}>{error}</div> : null}

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h2 className="h-sec" style={{ margin: 0 }}>Funding</h2>
        {budgets.length > 1 ? (
          <p className="sub" style={{ margin: 0 }}>
            {money(total.spent)} of {money(total.allocated)} across {budgets.length} budgets
          </p>
        ) : null}
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>
          Record a budget
        </button>
      </div>

      {budgets.length === 0 ? (
        <div className="card card-pad">
          <b>No budget recorded</b>
          <p className="sub" style={{ margin: "6px 0 0" }}>
            Record the allocation and its funding source. Charges from delivered sessions
            post themselves once a billing rate is set; the family sees the same figures
            in their portal.
          </p>
        </div>
      ) : null}

      {budgets.map((b) => {
        const p = positionOf(b.id);
        const spent = p?.spentToDate ?? 0;
        const remaining = p?.remaining ?? b.allocatedAmount;
        const pct = p?.percentUsed ?? 0;
        const mine = entries.filter((e) => e.budgetId === b.id);

        return (
          <section key={b.id} className="card card-pad" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 16 }}>{b.name}</b>
                <p className="sub" style={{ margin: "4px 0 0" }}>
                  {b.fundingSource}
                  {b.reference ? ` · Ref ${b.reference}` : ""}
                  {" · "}{b.periodStart}{b.periodEnd ? ` to ${b.periodEnd}` : " onward"}
                </p>
              </div>
              <span className={`pill ${b.status === "ACTIVE" ? "good" : "neutral"}`}>{b.status}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setEditing(b)}>Edit</button>
                <button type="button" className="btn" onClick={() => setPosting(b)}>Post entry</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Figure label="Allocated" value={money(b.allocatedAmount, b.currency)} />
              <Figure label="Spent to date" value={money(spent, b.currency)} />
              <Figure label="Remaining" value={money(remaining, b.currency)} tone={remaining <= 0 ? "bad" : "good"} />
              <Figure label="Used" value={`${pct}%`} />
              {p?.unreconciledCount ? (
                <Figure label="Unreconciled" value={String(p.unreconciledCount)} tone="warn" />
              ) : null}
            </div>

            <div
              role="img"
              aria-label={`${pct} percent used`}
              style={{ height: 8, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}
            >
              <div style={{
                width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", borderRadius: 999,
                background: pct >= 90 ? "var(--bad)" : "var(--accent)",
              }} />
            </div>

            {mine.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>No entries yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
                  <thead>
                    <tr>
                      <Th style={{ width: 32 }}></Th>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Service</Th>
                      <Th align="right">Qty</Th>
                      <Th align="right">Rate</Th>
                      <Th align="right">Amount</Th>
                      <Th>Source</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((e) => (
                      <tr key={e.id}>
                        <Td>
                          {e.reconciled ? (
                            <span title="Reconciled" aria-label="Reconciled">✓</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={selected.has(e.id)}
                              onChange={() => toggle(e.id)}
                              aria-label={`Select ${e.description} on ${e.entryDate}`}
                            />
                          )}
                        </Td>
                        <Td style={{ whiteSpace: "nowrap" }}>{e.entryDate}</Td>
                        <Td>
                          {e.description}
                          {e.kind !== "CHARGE" ? <span className="sub"> · {e.kind}</span> : null}
                        </Td>
                        <Td className="sub">{e.serviceType ?? "—"}</Td>
                        <Td align="right">{e.quantity ?? "—"}</Td>
                        <Td align="right">{e.unitRate == null ? "—" : money(e.unitRate, b.currency)}</Td>
                        <Td align="right" style={{ fontWeight: 600, color: e.amount < 0 ? "var(--good)" : undefined }}>
                          {money(e.amount, b.currency)}
                        </Td>
                        <Td className="sub">{e.sessionId ? `Session ${e.sessionId}` : "Manual"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {selected.size ? (
        <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>{selected.size} entr{selected.size === 1 ? "y" : "ies"} selected</b>
          <p className="sub" style={{ margin: 0, flex: 1, minWidth: 240 }}>
            Reconciling marks these as agreed with the funder. Their amounts can no longer be
            edited; a correction after this is an adjusting entry.
          </p>
          <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>Clear</button>
          <button type="button" className="btn" onClick={doReconcile}>Mark reconciled</button>
        </div>
      ) : null}

      {editing ? (
        <BudgetForm
          clientId={clientId}
          budget={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
          onError={setError}
        />
      ) : null}

      {posting ? (
        <EntryForm
          budget={posting}
          onCancel={() => setPosting(null)}
          onSaved={async () => { setPosting(null); await load(); }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <div>
      <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function BudgetForm({ clientId, budget, onCancel, onSaved, onError }: {
  clientId: number;
  budget: Budget | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [f, setF] = React.useState<Omit<Budget, "id">>(budget ?? {
    clientId, name: "", fundingSource: "", reference: null, allocatedAmount: 0,
    currency: "CAD", periodStart: today(), periodEnd: null, status: "ACTIVE", notes: null,
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name.trim()) return onError("Give the budget a name the family will recognize.");
    if (!f.fundingSource.trim()) return onError("Name the funding source.");
    if (!(f.allocatedAmount > 0)) return onError("The allocated amount has to be more than zero.");
    setSaving(true);
    try { await saveBudget(budget ? { ...f, id: budget.id } : f); onSaved(); }
    catch (e) { onError(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  return (
    <section className="card card-pad" style={{ display: "grid", gap: 14 }}>
      <b>{budget ? "Edit budget" : "Record a budget"}</b>
      <p className="sub" style={{ margin: 0 }}>
        The funding source is free text: name it however your organization and the
        funder do. Nothing here assumes a particular program.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)}
                 placeholder="2026 Service Allocation" />
        </Field>
        <Field label="Funding source">
          <input className="input" value={f.fundingSource} onChange={(e) => set("fundingSource", e.target.value)}
                 placeholder="Provincial program, insurer, family, grant…" />
        </Field>
        <Field label="Funder's reference" hint="optional">
          <input className="input" value={f.reference ?? ""} onChange={(e) => set("reference", e.target.value || null)} />
        </Field>
        <Field label="Allocated amount">
          <input className="input" type="number" min={0} step="0.01" value={f.allocatedAmount}
                 onChange={(e) => set("allocatedAmount", Number(e.target.value))} />
        </Field>
        <Field label="Period start">
          <input className="input" type="date" value={f.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
        </Field>
        <Field label="Period end" hint="leave empty if open-ended">
          <input className="input" type="date" value={f.periodEnd ?? ""}
                 onChange={(e) => set("periodEnd", e.target.value || null)} />
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set("status", e.target.value as Budget["status"])}>
            <option value="ACTIVE">Active</option>
            <option value="EXHAUSTED">Exhausted</option>
            <option value="CLOSED">Closed</option>
          </select>
        </Field>
      </div>

      <Field label="Notes" hint="optional">
        <textarea className="input" rows={2} value={f.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value || null)} />
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save budget"}
        </button>
      </div>
    </section>
  );
}

function EntryForm({ budget, onCancel, onSaved, onError }: {
  budget: Budget;
  onCancel: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = React.useState<EntryKind>("CHARGE");
  const [entryDate, setEntryDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [serviceType, setServiceType] = React.useState("");
  const [quantity, setQuantity] = React.useState<string>("");
  const [unitRate, setUnitRate] = React.useState<string>("");
  const [magnitude, setMagnitude] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  // Quantity times rate fills the amount, because typing all three is an
  // invitation for the third to disagree with the first two.
  const derived = quantity && unitRate ? Math.round(Number(quantity) * Number(unitRate) * 100) / 100 : null;
  const effective = magnitude !== "" ? Number(magnitude) : derived;

  async function save() {
    if (!description.trim()) return onError("Describe what this entry is for.");
    if (!effective || effective <= 0) return onError("Enter an amount, or a quantity and a rate.");
    setSaving(true);
    try {
      await postEntry({
        budgetId: budget.id, entryDate, kind, description: description.trim(),
        serviceType: serviceType.trim() || null,
        quantity: quantity === "" ? null : Number(quantity),
        unitRate: unitRate === "" ? null : Number(unitRate),
        magnitude: effective,
      });
      onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : "Could not post the entry."); }
    finally { setSaving(false); }
  }

  return (
    <section className="card card-pad" style={{ display: "grid", gap: 14 }}>
      <b>Post an entry to {budget.name}</b>
      <p className="sub" style={{ margin: 0 }}>
        Enter the amount as a positive number. A charge spends the budget, a credit
        returns to it, and an adjustment corrects an entry that has already been
        reconciled. The sign follows from the kind.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
            <option value="CHARGE">Charge — spends the budget</option>
            <option value="CREDIT">Credit — returns to the budget</option>
            <option value="ADJUSTMENT">Adjustment — corrects a reconciled entry</option>
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </Field>
        <Field label="Description">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
                 placeholder="What the family will see on their statement" />
        </Field>
        <Field label="Service" hint="optional">
          <input className="input" value={serviceType} onChange={(e) => setServiceType(e.target.value)} />
        </Field>
        <Field label="Quantity" hint="hours or units">
          <input className="input" type="number" min={0} step="0.25" value={quantity}
                 onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Unit rate" hint="optional">
          <input className="input" type="number" min={0} step="0.01" value={unitRate}
                 onChange={(e) => setUnitRate(e.target.value)} />
        </Field>
        <Field label="Amount" hint={derived != null ? `quantity × rate = ${money(derived, budget.currency)}` : "positive number"}>
          <input className="input" type="number" min={0} step="0.01"
                 value={magnitude !== "" ? magnitude : derived ?? ""}
                 onChange={(e) => setMagnitude(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" onClick={save} disabled={saving}>
          {saving ? "Posting…" : `Post ${kind.toLowerCase()}`}
        </button>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {label}
        {hint ? <span className="sub" style={{ fontWeight: 400 }}> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Th({ children, align = "left", style }: {
  children?: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties;
}) {
  return (
    <th style={{
      textAlign: align, padding: "10px 12px", borderBottom: "1px solid var(--line)",
      fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase",
      color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap", ...style,
    }}>{children}</th>
  );
}

function Td({ children, align = "left", style, className }: {
  children?: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties; className?: string;
}) {
  return (
    <td className={className} style={{
      textAlign: align, padding: "10px 12px", borderBottom: "1px solid var(--line-soft, var(--line))",
      fontVariantNumeric: align === "right" ? "tabular-nums" : undefined, ...style,
    }}>{children}</td>
  );
}
