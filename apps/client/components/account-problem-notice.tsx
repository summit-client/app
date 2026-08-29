import { explainAccountProblem, type AccountProblem } from "../lib/explain-account-problem";

/**
 * Replaces the dashboard/appointments screen when the signed-in account has
 * no clinic or no linked client record, instead of letting an RLS-emptied
 * query render as an ordinary "nothing scheduled" empty state.
 */
export function AccountProblemNotice({ problem }: { problem: AccountProblem }) {
  const { title, detail } = explainAccountProblem(problem);
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{title}</h1>
      <p style={{ color: "#6B7280", fontSize: 14 }}>{detail}</p>
    </main>
  );
}
