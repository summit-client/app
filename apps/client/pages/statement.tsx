/**
 * Funding statement.
 *
 * The reconciliation document: every charge and credit against a budget, in
 * date order, with the balance after each line. A family reads it to see where
 * the money went; a funder or an auditor reads it to check that the total on
 * the dashboard is the sum of the work delivered, and nothing else.
 *
 * Every number on this page is derived from budget_entries at render time.
 * Nothing here reads a stored total, so the page cannot disagree with the
 * ledger it is drawn from.
 */
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import Head from "next/head";
import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";
import {
  buildStatement,
  money,
  positionOf,
  statementCsv,
  type BudgetEntry,
  type ClientBudget,
} from "../lib/budget";

type PageProps =
  | {
      mode: "statement";
      clientName: string;
      budgets: ClientBudget[];
      entries: BudgetEntry[];
      isAdminViewingAs: boolean;
      generatedOn: string;
    }
  | { mode: "problem"; problem: AccountProblem }
  // A real query failure resolving the account, as distinct from an account
  // that resolved fine and has no clinic or no linked client. Added on main
  // while this branch was open; without it a transient failure fell through
  // to "not-permitted" and redirected, which reads as an access decision
  // rather than a blip.
  | { mode: "error" };

const INK = "#173247";
const MUTED = "#607987";
const LINE = "#d4e2e8";

export default function Statement(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [budgetId, setBudgetId] = useState<string>(
    props.mode === "statement" ? (props.budgets[0]?.id ?? "") : ""
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const budgets = props.mode === "statement" ? props.budgets : [];
  const entries = props.mode === "statement" ? props.entries : [];

  const selected = budgets.find((b) => b.id === budgetId) ?? budgets[0] ?? null;

  const statement = useMemo(
    () =>
      selected
        ? buildStatement(selected, entries, {
            from: from || undefined,
            to: to || undefined,
          })
        : null,
    [selected, entries, from, to]
  );

  const position = useMemo(
    () => (selected ? positionOf(selected, entries) : null),
    [selected, entries]
  );

  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }
  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  const { clientName, isAdminViewingAs, generatedOn } = props;
  const currency = selected?.currency ?? "CAD";

  function downloadCsv() {
    if (!selected || !statement) return;
    const blob = new Blob([statementCsv(selected, statement.lines)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${selected.name.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Head>
        <title>Funding Statement · Summit Client Portal</title>
      </Head>

      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Funding" />

      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main} style={{ background: "#edf7f8", minHeight: "100vh" }}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "#173f5f" }}>Funding Statement</h1>
            <p style={{ margin: 0, color: MUTED }}>
              Every charge and credit against your budget, with the balance after each line.
            </p>
          </header>

          {budgets.length === 0 ? (
            <div style={panel}>
              <strong style={{ color: INK }}>No budget on file yet</strong>
              <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 14 }}>
                When your clinic records a funding allocation for {clientName}, the total,
                the amount spent to date and this statement will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Controls: which budget, and over what window. */}
              <section
                style={{
                  ...panel,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "flex-end",
                  marginBottom: 16,
                }}
              >
                {budgets.length > 1 ? (
                  <label style={field}>
                    <span style={fieldLabel}>Budget</span>
                    <select
                      value={selected?.id ?? ""}
                      onChange={(e) => setBudgetId(e.target.value)}
                      style={input}
                    >
                      {budgets.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} · {b.fundingSource}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label style={field}>
                  <span style={fieldLabel}>From</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
                </label>

                <label style={field}>
                  <span style={fieldLabel}>To</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
                </label>

                {from || to ? (
                  <button type="button" onClick={() => { setFrom(""); setTo(""); }} style={ghostButton}>
                    Clear dates
                  </button>
                ) : null}

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button type="button" onClick={downloadCsv} style={ghostButton}>
                    Download CSV
                  </button>
                  <button type="button" onClick={() => window.print()} style={solidButton}>
                    Print / PDF
                  </button>
                </div>
              </section>

              {/* The budget in summary, so the statement below has something to reconcile to. */}
              {selected && position ? (
                <section style={{ ...panel, marginBottom: 16 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                    <div>
                      <strong style={{ color: INK, fontSize: 16 }}>{selected.name}</strong>
                      <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>
                        {selected.fundingSource}
                        {selected.reference ? ` · Ref ${selected.reference}` : ""}
                        {" · "}
                        {selected.periodStart}
                        {selected.periodEnd ? ` to ${selected.periodEnd}` : " onward"}
                      </div>
                    </div>
                    <span
                      style={{
                        alignSelf: "flex-start",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: selected.status === "ACTIVE" ? "#e4f3ea" : "#f4ece0",
                        color: selected.status === "ACTIVE" ? "#2f7a45" : "#8a6323",
                      }}
                    >
                      {selected.status}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 18 }}>
                    <Figure label="Total budget" value={money(selected.allocatedAmount, currency)} />
                    <Figure label="Spent to date" value={money(position.spentToDate, currency)} />
                    <Figure
                      label="Remaining"
                      value={money(position.remaining, currency)}
                      tone={position.remaining <= 0 ? "#a63a2a" : "#2f7a45"}
                    />
                    <Figure label="Used" value={`${position.percentUsed}%`} />
                  </div>

                  {position.unreconciledCount > 0 ? (
                    <p style={{ margin: "14px 0 0", fontSize: 12, color: "#8a6323" }}>
                      {position.unreconciledCount} entr
                      {position.unreconciledCount === 1 ? "y is" : "ies are"} not yet reconciled with your
                      clinic&apos;s records. The figures above include them.
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* The ledger itself. */}
              {statement ? (
                <section style={{ ...panel, padding: 0, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Description</Th>
                        <Th>Service</Th>
                        <Th align="right">Qty</Th>
                        <Th align="right">Rate</Th>
                        <Th align="right">Charge</Th>
                        <Th align="right">Credit</Th>
                        <Th align="right">Balance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <Td colSpan={7} style={{ color: MUTED, fontStyle: "italic" }}>
                          {from ? `Balance carried forward at ${from}` : "Opening balance"}
                        </Td>
                        <Td align="right" style={{ fontWeight: 700, color: INK }}>
                          {money(statement.openingBalance, currency)}
                        </Td>
                      </tr>

                      {statement.lines.length === 0 ? (
                        <tr>
                          <Td colSpan={8} style={{ color: MUTED, padding: 24, textAlign: "center" }}>
                            No entries in this period.
                          </Td>
                        </tr>
                      ) : (
                        statement.lines.map((l) => (
                          <tr key={l.id}>
                            <Td style={{ whiteSpace: "nowrap" }}>{l.entryDate}</Td>
                            <Td>
                              {l.description}
                              {l.kind !== "CHARGE" ? (
                                <span style={{ color: MUTED, fontSize: 11 }}> · {l.kind}</span>
                              ) : null}
                              {!l.reconciled ? (
                                <span style={{ color: "#8a6323", fontSize: 11 }}> · unreconciled</span>
                              ) : null}
                            </Td>
                            <Td style={{ color: MUTED }}>{l.serviceType ?? "—"}</Td>
                            <Td align="right">{l.quantity ?? "—"}</Td>
                            <Td align="right">{l.unitRate == null ? "—" : money(l.unitRate, currency)}</Td>
                            <Td align="right">{l.amount > 0 ? money(l.amount, currency) : ""}</Td>
                            <Td align="right">{l.amount < 0 ? money(Math.abs(l.amount), currency) : ""}</Td>
                            <Td align="right" style={{ fontWeight: 600 }}>
                              {money(l.runningBalance, currency)}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f5fafb" }}>
                        <Td colSpan={5} style={{ fontWeight: 700, color: INK }}>
                          Totals for this period
                        </Td>
                        <Td align="right" style={{ fontWeight: 700 }}>
                          {money(statement.totalCharges, currency)}
                        </Td>
                        <Td align="right" style={{ fontWeight: 700 }}>
                          {money(statement.totalCredits, currency)}
                        </Td>
                        <Td align="right" style={{ fontWeight: 700, color: INK }}>
                          {money(statement.closingBalance, currency)}
                        </Td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              ) : null}

              <p style={{ color: MUTED, fontSize: 12, marginTop: 16 }}>
                Generated {generatedOn}. Prepared by SummitClient.io for Mount Etna Child &amp; Family
                Services. Figures are derived from the entries shown; if a line looks wrong, ask your
                clinic to record a correction rather than editing history.
              </p>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: tone ?? INK, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "12px 14px",
        borderBottom: `1px solid ${LINE}`,
        color: MUTED,
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
  style,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: "11px 14px",
        borderBottom: `1px solid #eaf2f5`,
        color: INK,
        fontVariantNumeric: align === "right" ? "tabular-nums" : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

const panel: React.CSSProperties = {
  padding: 20,
  background: "#ffffff",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(20, 60, 80, 0.04)",
};

const field: React.CSSProperties = { display: "grid", gap: 6 };
const fieldLabel: React.CSSProperties = { fontSize: 12, color: MUTED, fontWeight: 600 };
const input: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid #cddde4`,
  background: "#ffffff",
  color: "#365468",
  fontSize: 14,
};
const ghostButton: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid #cddde4",
  background: "#ffffff",
  color: "#365468",
  fontWeight: 700,
  cursor: "pointer",
};
const solidButton: React.CSSProperties = {
  ...ghostButton,
  border: "1px solid #173f5f",
  background: "#173f5f",
  color: "#ffffff",
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res }) => {
  const supabase = createClient(req as NextApiRequest, res as NextApiResponse);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      redirect: {
        destination: process.env.NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const resolved = await resolveViewedClient(supabase, req as NextApiRequest, user.id);

  if (resolved.kind === "error") {
    return { props: { mode: "error" } };
  }
  if (resolved.kind === "needs-selection") {
    return { redirect: { destination: "/", permanent: false } };
  }
  if (resolved.kind === "account-problem") {
    return { props: { mode: "problem", problem: resolved.problem } };
  }
  if (resolved.kind === "not-permitted") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  // Closed budgets stay on the statement: a reconciliation that hides last
  // year's spending is not a reconciliation.
  const { data: budgetRows } = await supabase
    .from("client_budgets")
    .select(
      "id, client_id, name, funding_source, reference, allocated_amount, currency, period_start, period_end, status, notes"
    )
    .eq("client_id", viewed.clientId)
    .order("period_start", { ascending: false });

  const budgets: ClientBudget[] = (budgetRows ?? []).map((r) => ({
    id: r.id as string,
    clientId: Number(r.client_id),
    name: r.name as string,
    fundingSource: r.funding_source as string,
    reference: (r.reference as string) ?? null,
    allocatedAmount: Number(r.allocated_amount),
    currency: (r.currency as string) ?? "CAD",
    periodStart: r.period_start as string,
    periodEnd: (r.period_end as string) ?? null,
    status: r.status as ClientBudget["status"],
    notes: (r.notes as string) ?? null,
  }));

  const ids = budgets.map((b) => b.id);
  const { data: entryRows } = ids.length
    ? await supabase
        .from("budget_entries")
        .select(
          "id, budget_id, entry_date, kind, description, session_id, service_type, quantity, unit_rate, amount, reconciled"
        )
        .in("budget_id", ids)
        .order("entry_date", { ascending: true })
    : { data: [] };

  const entries: BudgetEntry[] = (entryRows ?? []).map((r) => ({
    id: r.id as string,
    budgetId: r.budget_id as string,
    entryDate: r.entry_date as string,
    kind: r.kind as BudgetEntry["kind"],
    description: r.description as string,
    sessionId: r.session_id == null ? null : Number(r.session_id),
    serviceType: (r.service_type as string) ?? null,
    quantity: r.quantity == null ? null : Number(r.quantity),
    unitRate: r.unit_rate == null ? null : Number(r.unit_rate),
    amount: Number(r.amount),
    reconciled: Boolean(r.reconciled),
  }));

  return {
    props: {
      mode: "statement",
      clientName: viewed.clientName || "your child",
      budgets,
      entries,
      isAdminViewingAs: viewed.isAdminViewingAs,
      generatedOn: new Date().toISOString().slice(0, 10),
    },
  };
};
