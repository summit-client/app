/**
 * Client budgets: the money side of a client's file, whatever funds it.
 *
 * Deliberately funding-source agnostic. A budget is an amount made available
 * for a period; the source is a label the organization chooses (a government
 * program, private pay, insurance, a grant, a school board). A client may hold
 * several at once, and the dashboard shows the combined position as well as
 * each budget on its own.
 *
 * Spent to date is always derived by summing entries, never stored. A stored
 * total drifts the moment an entry is corrected, and then reconciliation has
 * two numbers to argue with instead of one to verify.
 */

export type BudgetStatus = "ACTIVE" | "EXHAUSTED" | "CLOSED";
export type EntryKind = "CHARGE" | "CREDIT" | "ADJUSTMENT";

export interface ClientBudget {
  id: string;
  clientId: number;
  name: string;
  fundingSource: string;
  reference: string | null;
  allocatedAmount: number;
  currency: string;
  periodStart: string;
  periodEnd: string | null;
  status: BudgetStatus;
  notes: string | null;
}

export interface BudgetEntry {
  id: string;
  budgetId: string;
  entryDate: string;
  kind: EntryKind;
  description: string;
  sessionId: number | null;
  serviceType: string | null;
  quantity: number | null;
  unitRate: number | null;
  amount: number;          // positive spends the budget, negative returns to it
  reconciled: boolean;
}

export interface BudgetPosition {
  budget: ClientBudget;
  spentToDate: number;
  remaining: number;
  percentUsed: number;
  entryCount: number;
  unreconciledCount: number;
  lastEntryDate: string | null;
  /** Average spend per day so far, and the date the budget runs out at that pace. */
  burnPerDay: number | null;
  projectedExhaustion: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One budget's position, derived from its entries. */
export function positionOf(budget: ClientBudget, entries: BudgetEntry[], now = new Date()): BudgetPosition {
  const mine = entries.filter((e) => e.budgetId === budget.id);
  const spentToDate = round2(mine.reduce((s, e) => s + e.amount, 0));
  const remaining = round2(budget.allocatedAmount - spentToDate);
  const percentUsed = budget.allocatedAmount > 0
    ? Math.round((spentToDate / budget.allocatedAmount) * 1000) / 10
    : 0;

  const dates = mine.map((e) => e.entryDate).sort();
  const first = dates[0] ? new Date(dates[0]) : null;
  const elapsedDays = first ? Math.max(1, Math.round((now.getTime() - first.getTime()) / 86_400_000)) : null;
  const burnPerDay = elapsedDays && spentToDate > 0 ? round2(spentToDate / elapsedDays) : null;
  const projectedExhaustion = burnPerDay && burnPerDay > 0 && remaining > 0
    ? new Date(now.getTime() + (remaining / burnPerDay) * 86_400_000).toISOString().slice(0, 10)
    : null;

  return {
    budget,
    spentToDate,
    remaining,
    percentUsed,
    entryCount: mine.length,
    unreconciledCount: mine.filter((e) => !e.reconciled).length,
    lastEntryDate: dates.at(-1) ?? null,
    burnPerDay,
    projectedExhaustion,
  };
}

/** The combined position across every budget a client holds. */
export function totalPosition(positions: BudgetPosition[]): {
  allocated: number; spent: number; remaining: number; percentUsed: number; currency: string;
} {
  const allocated = round2(positions.reduce((s, p) => s + p.budget.allocatedAmount, 0));
  const spent = round2(positions.reduce((s, p) => s + p.spentToDate, 0));
  return {
    allocated,
    spent,
    remaining: round2(allocated - spent),
    percentUsed: allocated > 0 ? Math.round((spent / allocated) * 1000) / 10 : 0,
    currency: positions[0]?.budget.currency ?? "CAD",
  };
}

/**
 * A statement: entries in date order with a running balance, which is what
 * makes the document usable for reconciliation. Every line shows what was
 * delivered, what it cost, and what remained afterwards.
 */
export interface StatementLine extends BudgetEntry {
  runningBalance: number;
}

export function buildStatement(
  budget: ClientBudget,
  entries: BudgetEntry[],
  range?: { from?: string; to?: string },
): { lines: StatementLine[]; openingBalance: number; closingBalance: number; totalCharges: number; totalCredits: number } {
  const mine = entries
    .filter((e) => e.budgetId === budget.id)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id));

  // Anything before the window is folded into the opening balance, so a
  // date-ranged statement still reconciles against the full history.
  const before = range?.from ? mine.filter((e) => e.entryDate < range.from!) : [];
  const within = mine.filter((e) =>
    (!range?.from || e.entryDate >= range.from) && (!range?.to || e.entryDate <= range.to));

  const openingBalance = round2(budget.allocatedAmount - before.reduce((s, e) => s + e.amount, 0));

  let balance = openingBalance;
  const lines: StatementLine[] = within.map((e) => {
    balance = round2(balance - e.amount);
    return { ...e, runningBalance: balance };
  });

  return {
    lines,
    openingBalance,
    closingBalance: balance,
    totalCharges: round2(within.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)),
    totalCredits: round2(Math.abs(within.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0))),
  };
}

export function money(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

/** Statement rows as CSV, for reconciliation in a spreadsheet or an audit file. */
export function statementCsv(budget: ClientBudget, lines: StatementLine[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "Date", "Description", "Service", "Quantity", "Unit rate",
    "Charge", "Credit", "Balance", "Reconciled", "Session", "Entry ID",
  ];
  const rows = lines.map((l) => [
    l.entryDate, l.description, l.serviceType ?? "", l.quantity ?? "", l.unitRate ?? "",
    l.amount > 0 ? l.amount.toFixed(2) : "",
    l.amount < 0 ? Math.abs(l.amount).toFixed(2) : "",
    l.runningBalance.toFixed(2),
    l.reconciled ? "yes" : "no",
    l.sessionId ?? "", l.id,
  ]);
  return [
    [`Budget`, budget.name].map(esc).join(","),
    [`Funding source`, budget.fundingSource].map(esc).join(","),
    [`Reference`, budget.reference ?? ""].map(esc).join(","),
    [`Allocated`, budget.allocatedAmount.toFixed(2)].map(esc).join(","),
    "",
    head.join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ].join("\n");
}
