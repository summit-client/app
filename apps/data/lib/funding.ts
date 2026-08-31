/**
 * Client funding, from the clinic's side.
 *
 * The family portal reads budgets and produces a statement (apps/client). This
 * is the half that writes them: recording an allocation, posting a charge or
 * credit, and reconciling entries against the funder's own records.
 *
 * The arithmetic is not repeated here. Positions and statements are derived by
 * `client_budget_positions` in the database and by apps/client/lib/budget.ts on
 * the family's side; a third implementation would be a third answer. This
 * module reads the view and writes the atoms.
 */
import { createBrowserClient } from "@supabase/ssr";

export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

export type BudgetStatus = "ACTIVE" | "EXHAUSTED" | "CLOSED";
export type EntryKind = "CHARGE" | "CREDIT" | "ADJUSTMENT";

export type Budget = {
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
};

/** The derived position, read from the view rather than recomputed. */
export type Position = {
  budgetId: string;
  spentToDate: number;
  remaining: number;
  percentUsed: number;
  entryCount: number;
  unreconciledCount: number;
  lastEntryDate: string | null;
};

export type Entry = {
  id: string;
  budgetId: string;
  entryDate: string;
  kind: EntryKind;
  description: string;
  sessionId: number | null;
  serviceType: string | null;
  quantity: number | null;
  unitRate: number | null;
  amount: number;
  reconciled: boolean;
};

// --- preview fixtures ------------------------------------------------------
// Enough to exercise every state the screen has to render: a healthy budget, a
// nearly-exhausted one, reconciled and unreconciled entries, a credit.
const previewBudgets: Budget[] = [
  {
    id: "pv-b1", clientId: 1, name: "2026 Service Allocation", fundingSource: "Provincial program",
    reference: "PF-2026-0431", allocatedAmount: 22000, currency: "CAD",
    periodStart: "2026-01-01", periodEnd: "2026-12-31", status: "ACTIVE",
    notes: "Renewal confirmed by the funder in November.",
  },
  {
    id: "pv-b2", clientId: 1, name: "Private pay — additional hours", fundingSource: "Family",
    reference: null, allocatedAmount: 3000, currency: "CAD",
    periodStart: "2026-03-01", periodEnd: null, status: "ACTIVE", notes: null,
  },
];

const previewEntries: Entry[] = [
  { id: "pv-e1", budgetId: "pv-b1", entryDate: "2026-02-04", kind: "CHARGE", description: "Direct Therapy",
    sessionId: 4101, serviceType: "Direct therapy", quantity: 2, unitRate: 55, amount: 110, reconciled: true },
  { id: "pv-e2", budgetId: "pv-b1", entryDate: "2026-02-11", kind: "CHARGE", description: "Direct Therapy",
    sessionId: 4102, serviceType: "Direct therapy", quantity: 2, unitRate: 55, amount: 110, reconciled: true },
  { id: "pv-e3", budgetId: "pv-b1", entryDate: "2026-02-18", kind: "CHARGE", description: "Assessment",
    sessionId: 4103, serviceType: "Assessment", quantity: 3, unitRate: 68, amount: 204, reconciled: false },
  { id: "pv-e4", budgetId: "pv-b1", entryDate: "2026-02-20", kind: "CREDIT", description: "Session cancelled by clinic",
    sessionId: null, serviceType: null, quantity: null, unitRate: null, amount: -110, reconciled: false },
  { id: "pv-e5", budgetId: "pv-b2", entryDate: "2026-03-06", kind: "CHARGE", description: "Caregiver session",
    sessionId: 4110, serviceType: "Caregiver session", quantity: 1.5, unitRate: 55, amount: 82.5, reconciled: false },
];

let mem = { budgets: [...previewBudgets], entries: [...previewEntries] };
let seq = 0;
const newId = (p: string) => `${p}-${Date.now()}-${seq++}`;

// --- reads -----------------------------------------------------------------

export async function getBudgets(clientId: number): Promise<Budget[]> {
  if (IS_PREVIEW) return mem.budgets.filter((b) => b.clientId === clientId);

  const { data, error } = await sb()
    .from("client_budgets")
    .select("id, client_id, name, funding_source, reference, allocated_amount, currency, period_start, period_end, status, notes")
    .eq("client_id", clientId)
    .order("period_start", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    clientId: Number(r.client_id),
    name: r.name as string,
    fundingSource: r.funding_source as string,
    reference: (r.reference as string) ?? null,
    allocatedAmount: Number(r.allocated_amount),
    currency: (r.currency as string) ?? "CAD",
    periodStart: r.period_start as string,
    periodEnd: (r.period_end as string) ?? null,
    status: r.status as BudgetStatus,
    notes: (r.notes as string) ?? null,
  }));
}

/** Positions come from the database view, which is the same one the family sees. */
export async function getPositions(clientId: number): Promise<Position[]> {
  if (IS_PREVIEW) {
    return mem.budgets.filter((b) => b.clientId === clientId).map((b) => {
      const mine = mem.entries.filter((e) => e.budgetId === b.id);
      const spent = round2(mine.reduce((s, e) => s + e.amount, 0));
      return {
        budgetId: b.id,
        spentToDate: spent,
        remaining: round2(b.allocatedAmount - spent),
        percentUsed: b.allocatedAmount > 0 ? Math.round((spent / b.allocatedAmount) * 1000) / 10 : 0,
        entryCount: mine.length,
        unreconciledCount: mine.filter((e) => !e.reconciled).length,
        lastEntryDate: mine.map((e) => e.entryDate).sort().at(-1) ?? null,
      };
    });
  }

  const { data, error } = await sb()
    .from("client_budget_positions")
    .select("budget_id, spent_to_date, remaining, percent_used, entry_count, unreconciled_count, last_entry_date")
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    budgetId: r.budget_id as string,
    spentToDate: Number(r.spent_to_date),
    remaining: Number(r.remaining),
    percentUsed: Number(r.percent_used),
    entryCount: Number(r.entry_count),
    unreconciledCount: Number(r.unreconciled_count),
    lastEntryDate: (r.last_entry_date as string) ?? null,
  }));
}

export async function getEntries(budgetIds: string[]): Promise<Entry[]> {
  if (!budgetIds.length) return [];
  if (IS_PREVIEW) return mem.entries.filter((e) => budgetIds.includes(e.budgetId));

  const { data, error } = await sb()
    .from("budget_entries")
    .select("id, budget_id, entry_date, kind, description, session_id, service_type, quantity, unit_rate, amount, reconciled")
    .in("budget_id", budgetIds)
    .order("entry_date", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    budgetId: r.budget_id as string,
    entryDate: r.entry_date as string,
    kind: r.kind as EntryKind,
    description: r.description as string,
    sessionId: r.session_id == null ? null : Number(r.session_id),
    serviceType: (r.service_type as string) ?? null,
    quantity: r.quantity == null ? null : Number(r.quantity),
    unitRate: r.unit_rate == null ? null : Number(r.unit_rate),
    amount: Number(r.amount),
    reconciled: Boolean(r.reconciled),
  }));
}

// --- writes ----------------------------------------------------------------

async function myClinicId(): Promise<string | null> {
  const user = (await sb().auth.getUser()).data.user;
  if (!user) return null;
  const { data } = await sb().from("profiles").select("clinic_id").eq("id", user.id).single();
  return (data?.clinic_id as string) ?? null;
}

export async function saveBudget(b: Omit<Budget, "id"> & { id?: string }): Promise<Budget> {
  if (IS_PREVIEW) {
    if (b.id) {
      mem.budgets = mem.budgets.map((x) => (x.id === b.id ? { ...(b as Budget) } : x));
      return b as Budget;
    }
    const created = { ...b, id: newId("b") } as Budget;
    mem.budgets = [created, ...mem.budgets];
    return created;
  }

  const row: Record<string, unknown> = {
    client_id: b.clientId,
    name: b.name,
    funding_source: b.fundingSource,
    reference: b.reference,
    allocated_amount: b.allocatedAmount,
    currency: b.currency,
    period_start: b.periodStart,
    period_end: b.periodEnd,
    status: b.status,
    notes: b.notes,
  };

  if (b.id) {
    const { error } = await sb().from("client_budgets").update(row).eq("id", b.id);
    if (error) throw new Error(error.message);
    return b as Budget;
  }

  row.clinic_id = await myClinicId();
  row.created_by = (await sb().auth.getUser()).data.user?.id ?? null;
  const { data, error } = await sb().from("client_budgets").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return { ...b, id: data!.id as string } as Budget;
}

/**
 * Post an entry.
 *
 * Sign is derived from the kind rather than typed. A charge spends the budget
 * and a credit returns to it, and asking someone to remember which one takes a
 * minus sign is asking for a credit that reads as a charge — which reconciles
 * to the wrong number in the direction nobody checks.
 */
export async function postEntry(input: {
  budgetId: string;
  entryDate: string;
  kind: EntryKind;
  description: string;
  serviceType?: string | null;
  quantity?: number | null;
  unitRate?: number | null;
  /** Always positive. The sign is applied here. */
  magnitude: number;
}): Promise<Entry> {
  const amount = input.kind === "CHARGE" ? Math.abs(input.magnitude) : -Math.abs(input.magnitude);

  if (IS_PREVIEW) {
    const created: Entry = {
      id: newId("e"), budgetId: input.budgetId, entryDate: input.entryDate, kind: input.kind,
      description: input.description, sessionId: null,
      serviceType: input.serviceType ?? null, quantity: input.quantity ?? null,
      unitRate: input.unitRate ?? null, amount: round2(amount), reconciled: false,
    };
    mem.entries = [created, ...mem.entries];
    return created;
  }

  const { data, error } = await sb().from("budget_entries").insert({
    clinic_id: await myClinicId(),
    budget_id: input.budgetId,
    entry_date: input.entryDate,
    kind: input.kind,
    description: input.description,
    service_type: input.serviceType ?? null,
    quantity: input.quantity ?? null,
    unit_rate: input.unitRate ?? null,
    amount: round2(amount),
    created_by: (await sb().auth.getUser()).data.user?.id ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);

  return {
    id: data!.id as string, budgetId: input.budgetId, entryDate: input.entryDate,
    kind: input.kind, description: input.description, sessionId: null,
    serviceType: input.serviceType ?? null, quantity: input.quantity ?? null,
    unitRate: input.unitRate ?? null, amount: round2(amount), reconciled: false,
  };
}

/**
 * Mark entries reconciled against the funder's records.
 *
 * One-way on purpose. Un-reconciling would let a settled figure be reopened
 * quietly, and the database refuses to let a reconciled entry's money change
 * anyway — a correction is an adjusting entry, which is what keeps the
 * statement auditable.
 */
export async function reconcile(entryIds: string[]): Promise<void> {
  if (!entryIds.length) return;
  if (IS_PREVIEW) {
    mem.entries = mem.entries.map((e) => (entryIds.includes(e.id) ? { ...e, reconciled: true } : e));
    return;
  }
  const { error } = await sb()
    .from("budget_entries")
    .update({ reconciled: true, reconciled_at: new Date().toISOString(),
              reconciled_by: (await sb().auth.getUser()).data.user?.id ?? null })
    .in("id", entryIds);
  if (error) throw new Error(error.message);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function money(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}
