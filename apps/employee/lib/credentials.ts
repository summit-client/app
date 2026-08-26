"use client";

/**
 * Credential rule engine: versioned, date-aware, configurable data.
 *
 * Regulatory constants are never scattered through components; they live here
 * as rule versions with effective dates and source status. Rules seeded from
 * the build specification are marked REQUIRES ADMINISTRATOR VERIFICATION until
 * the official handbook PDFs are attached through the Regulatory PDF Auditor
 * workflow.
 *
 * Core invariants:
 *  - One activity exists once; credential-specific allocations reference it.
 *  - Unique activity hours are never inflated: a 2 hour course that satisfies
 *    three CPBAO content categories still contributes 2 CPD hours in total.
 *  - A single BACB CEU is never simultaneously Ethics and Supervision.
 *  - The rule version that applies is chosen by the employee's cycle dates.
 */

export type CredentialKind =
  | "BCBA" | "BCaBA" | "RBT"
  | "ONT_RBA"
  | "IBA_PRECERT" | "IBA_RECERT" | "IBT";

export type CreditUnit = "CEU" | "PDU" | "CPD_HOUR";

export type ContentCategory =
  | "ETHICS" | "SUPERVISION" | "CULTURAL_DIVERSITY" | "EDI"
  | "SECTION_A" | "SECTION_B" | "SECTION_C" | "ABA_TOPICS" | "GENERAL";

export const CATEGORY_LABEL: Record<ContentCategory, string> = {
  ETHICS: "Ethics / Jurisprudence",
  SUPERVISION: "Supervision",
  CULTURAL_DIVERSITY: "Cultural Diversity & Awareness",
  EDI: "Equity, Diversity & Inclusion",
  SECTION_A: "Section A: Professional Interaction",
  SECTION_B: "Section B: Continuing Education",
  SECTION_C: "Section C: Additional Activities",
  ABA_TOPICS: "ABA Topics",
  GENERAL: "General / Learning",
};

export interface CategoryRule {
  category: ContentCategory;
  minimum: number;
  conditional?: string;          // e.g. "if the certificant provides qualifying supervision"
  withinTotal: boolean;          // true: contained inside the total, never added on top
}

export interface CredentialRuleVersion {
  credential: CredentialKind;
  issuer: string;
  label: string;
  version: string;
  effectiveDate: string;         // ISO; the rule applies to cycles starting on/after
  endDate: string | null;
  cycleYears: number;
  totalRequired: number;
  unit: CreditUnit;
  categories: CategoryRule[];
  notes: string[];
  sourceStatus: "VERIFIED" | "REQUIRES_ADMINISTRATOR_VERIFICATION";
}

export const CREDENTIAL_RULES: CredentialRuleVersion[] = [
  {
    credential: "BCBA", issuer: "BACB", label: "BCBA / BCBA-D", version: "current",
    effectiveDate: "2022-01-01", endDate: "2026-12-31", cycleYears: 2, totalRequired: 32, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 4, withinTotal: true },
      { category: "SUPERVISION", minimum: 3, conditional: "if the certificant provides qualifying supervision", withinTotal: true },
    ],
    notes: [
      "A single CEU is classified as Ethics or Supervision, never both at once.",
      "Cultural or contextual responsiveness content may qualify as Ethics only when the governing requirements permit and documentation supports it.",
    ],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "BCBA", issuer: "BACB", label: "BCBA / BCBA-D", version: "2027",
    effectiveDate: "2027-01-01", endDate: null, cycleYears: 2, totalRequired: 32, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 4, withinTotal: true },
      { category: "SUPERVISION", minimum: 4, conditional: "if the certificant provides qualifying supervision", withinTotal: true },
    ],
    notes: ["Rule version effective January 1, 2027. Historical cycles keep their own rules."],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "BCaBA", issuer: "BACB", label: "BCaBA", version: "current",
    effectiveDate: "2022-01-01", endDate: null, cycleYears: 2, totalRequired: 20, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 4, withinTotal: true },
      { category: "SUPERVISION", minimum: 3, conditional: "if applicable", withinTotal: true },
    ],
    notes: ["Ongoing supervision requirements are tracked separately from CEUs."],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "RBT", issuer: "BACB", label: "RBT", version: "current",
    effectiveDate: "2022-01-01", endDate: null, cycleYears: 2, totalRequired: 12, unit: "PDU",
    categories: [],
    notes: [
      "RBT professional development uses PDUs (Professional Development Units), never BCBA CEUs.",
      "Ongoing supervision requirements are tracked separately.",
    ],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "ONT_RBA", issuer: "CPBAO", label: "Ontario RBA (CPBAO)", version: "current",
    effectiveDate: "2024-01-01", endDate: null, cycleYears: 2, totalRequired: 50, unit: "CPD_HOUR",
    categories: [
      { category: "SECTION_A", minimum: 15, withinTotal: true },
      { category: "SECTION_B", minimum: 15, withinTotal: true },
      { category: "SECTION_C", minimum: 0, withinTotal: true },
      { category: "ETHICS", minimum: 10, withinTotal: true },
      { category: "EDI", minimum: 5, withinTotal: true },
      { category: "SUPERVISION", minimum: 3, conditional: "if applicable", withinTotal: true },
    ],
    notes: [
      "One activity may satisfy several content categories; the hours count once toward the 50.",
      "Requirements satisfied is a different number from unique activity hours, and both are shown.",
      "One qualifying BACB CEU maps to one CPD hour where the governing requirements permit.",
    ],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "IBA_PRECERT", issuer: "IBAO", label: "IBA (pre-certification)", version: "current",
    effectiveDate: "2024-01-01", endDate: null, cycleYears: 2, totalRequired: 12, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 2, withinTotal: true },
      { category: "SUPERVISION", minimum: 2, withinTotal: true },
      { category: "CULTURAL_DIVERSITY", minimum: 2, withinTotal: true },
      { category: "ABA_TOPICS", minimum: 6, withinTotal: true },
    ],
    notes: [],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "IBA_RECERT", issuer: "IBAO", label: "IBA (recertification)", version: "current",
    effectiveDate: "2024-01-01", endDate: null, cycleYears: 2, totalRequired: 24, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 4, withinTotal: true },
      { category: "SUPERVISION", minimum: 4, withinTotal: true },
      { category: "CULTURAL_DIVERSITY", minimum: 4, withinTotal: true },
      { category: "ABA_TOPICS", minimum: 12, withinTotal: true },
    ],
    notes: ["The first-cycle professional mentorship requirement is tracked separately and never counted as CEU unless specifically permitted."],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
  {
    credential: "IBT", issuer: "IBAO", label: "IBT", version: "current",
    effectiveDate: "2024-01-01", endDate: null, cycleYears: 2, totalRequired: 4, unit: "CEU",
    categories: [
      { category: "ETHICS", minimum: 1, withinTotal: true },
      { category: "CULTURAL_DIVERSITY", minimum: 1, withinTotal: true },
      { category: "ABA_TOPICS", minimum: 2, withinTotal: true },
    ],
    notes: ["IBT rule logic is independent of IBA."],
    sourceStatus: "REQUIRES_ADMINISTRATOR_VERIFICATION",
  },
];

/** The rule version whose effective window contains the cycle start. */
export function ruleFor(credential: CredentialKind, cycleStart: string): CredentialRuleVersion | null {
  const candidates = CREDENTIAL_RULES
    .filter((r) => r.credential === credential && r.effectiveDate <= cycleStart && (r.endDate == null || cycleStart <= r.endDate))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return candidates[0] ?? CREDENTIAL_RULES.filter((r) => r.credential === credential).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}

/* ---- employee credentials, universal activities, allocations ---------------- */

export interface EmployeeCredential {
  id: string;
  credential: CredentialKind;
  number: string;
  cycleStart: string;   // ISO
  cycleEnd: string;     // ISO (renewal)
  status: "GOOD_STANDING" | "PENDING" | "LAPSED";
}

/** The universal professional development record: one activity, stored once. */
export interface PdActivity {
  id: string;
  title: string;
  provider: string;
  instructor: string;
  completionDate: string;
  durationHours: number;           // unique activity hours, the only duration that exists
  format: string;                  // live, online, self-directed
  categories: ContentCategory[];   // content present in the activity
  aceProvider: string | null;
  certificateFile: string | null;
  verification: "VERIFIED" | "VERIFICATION_REQUIRED";
  notes: string;
}

/**
 * A credential-specific allocation of one activity. Amount is in the
 * credential's unit and can never exceed the activity's duration.
 * BACB invariant: ethics + supervision splits within one allocation must sum
 * to at most the allocated amount (a CEU is one category, never two).
 */
export interface CreditAllocation {
  activityId: string;
  credentialId: string;
  amount: number;
  byCategory: Partial<Record<ContentCategory, number>>; // CPBAO: may overlap (each <= amount). BACB/IBAO: must sum <= amount.
}

export interface CategoryProgress {
  category: ContentCategory;
  minimum: number;
  completed: number;
  remaining: number;
  conditional?: string;
}

export interface CredentialCompliance {
  credential: EmployeeCredential;
  rule: CredentialRuleVersion;
  totalCompleted: number;          // unique credited amount, never inflated
  totalRequired: number;
  remaining: number;
  categories: CategoryProgress[];
  flags: string[];
}

const overlapAllowed = (kind: CredentialKind) => kind === "ONT_RBA";

/** Validate an allocation against the anti-double-counting invariants. */
export function validateAllocation(alloc: CreditAllocation, activity: PdActivity, credential: EmployeeCredential): string | null {
  if (alloc.amount > activity.durationHours + 1e-9) {
    return `Allocation (${alloc.amount}) exceeds the activity's ${activity.durationHours} unique hours.`;
  }
  const cats = Object.entries(alloc.byCategory).filter(([, v]) => (v ?? 0) > 0);
  if (overlapAllowed(credential.credential)) {
    for (const [c, v] of cats) {
      if ((v ?? 0) > alloc.amount + 1e-9) return `${c} hours exceed the activity's allocated hours.`;
    }
  } else {
    const sum = cats.reduce((s, [, v]) => s + (v ?? 0), 0);
    if (sum > alloc.amount + 1e-9) {
      return "Category amounts exceed the total: one credit is one category, never two at once.";
    }
  }
  return null;
}

/** Compliance for one credential from its allocations. */
export function computeCompliance(
  credential: EmployeeCredential,
  allocations: CreditAllocation[],
  activities: PdActivity[],
): CredentialCompliance | null {
  const rule = ruleFor(credential.credential, credential.cycleStart);
  if (!rule) return null;
  const byId = new Map(activities.map((a) => [a.id, a]));
  const mine = allocations.filter((al) => al.credentialId === credential.id && byId.has(al.activityId));

  const totalCompleted = mine.reduce((s, al) => s + al.amount, 0);
  const catTotals = new Map<ContentCategory, number>();
  for (const al of mine) {
    for (const [c, v] of Object.entries(al.byCategory)) {
      if (v) catTotals.set(c as ContentCategory, (catTotals.get(c as ContentCategory) ?? 0) + v);
    }
  }
  const categories: CategoryProgress[] = rule.categories.map((cr) => {
    const done = catTotals.get(cr.category) ?? 0;
    return { category: cr.category, minimum: cr.minimum, completed: done, remaining: Math.max(0, cr.minimum - done), conditional: cr.conditional };
  });

  const flags: string[] = [];
  if (rule.sourceStatus === "REQUIRES_ADMINISTRATOR_VERIFICATION") {
    flags.push("Rule version seeded from the build specification. REQUIRES ADMINISTRATOR VERIFICATION against the official handbook before reliance.");
  }
  const unverified = mine.filter((al) => byId.get(al.activityId)!.verification !== "VERIFIED").length;
  if (unverified) flags.push(`${unverified} allocated activit${unverified === 1 ? "y" : "ies"} still marked Verification Required.`);

  return {
    credential, rule,
    totalCompleted: Math.round(totalCompleted * 100) / 100,
    totalRequired: rule.totalRequired,
    remaining: Math.max(0, Math.round((rule.totalRequired - totalCompleted) * 100) / 100),
    categories, flags,
  };
}

/** Maximize My Credits: outstanding requirements across every credential, and
 * which content combinations could efficiently serve several at once. */
export function maximizeMyCredits(compliances: CredentialCompliance[]): {
  outstanding: { credential: string; items: string[] }[];
  suggestions: string[];
} {
  const outstanding = compliances.map((c) => ({
    credential: c.rule.label,
    items: [
      c.remaining > 0 ? `${c.remaining} ${c.rule.unit === "CPD_HOUR" ? "CPD hours" : c.rule.unit + "s"} to reach ${c.totalRequired}` : "",
      ...c.categories.filter((x) => x.remaining > 0).map((x) => `${x.remaining} ${CATEGORY_LABEL[x.category]}${x.conditional ? ` (${x.conditional})` : ""}`),
    ].filter(Boolean),
  })).filter((o) => o.items.length);

  const needed = new Map<ContentCategory, string[]>();
  for (const c of compliances) {
    for (const cat of c.categories) {
      if (cat.remaining > 0) needed.set(cat.category, [...(needed.get(cat.category) ?? []), c.rule.label]);
    }
  }
  const suggestions: string[] = [];
  const multi = [...needed.entries()].filter(([, creds]) => creds.length > 1);
  for (const [cat, creds] of multi) {
    suggestions.push(
      `A qualifying course with ${CATEGORY_LABEL[cat]} content may contribute toward ${creds.join(" and ")} requirements, depending on documentation and governing-body rules.`,
    );
  }
  if (needed.has("ETHICS") && needed.has("SUPERVISION")) {
    suggestions.push(
      "A course covering both supervision and ethics content may contribute toward multiple credential requirements depending on documentation and governing-body rules. Credit is confirmed only at verification.",
    );
  }
  return { outstanding, suggestions };
}

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = Object.fromEntries(
  CREDENTIAL_RULES.map((r) => [r.credential, r.label]),
) as Record<CredentialKind, string>;
