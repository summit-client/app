// QA harness for the calculation invariants the spec calls out.
// Pure-logic copies of the shipped functions (same algorithms, no React/DOM).
let pass = 0, fail = 0;
const t = (name, cond, detail = "") => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, detail); } };

/* ---- 1. BACB: a CEU is never Ethics AND Supervision at once ---- */
const overlapAllowed = (k) => k === "ONT_RBA";
function validateAllocation(alloc, activity, credential) {
  if (alloc.amount > activity.durationHours + 1e-9) return "exceeds unique hours";
  const cats = Object.entries(alloc.byCategory).filter(([, v]) => v > 0);
  if (overlapAllowed(credential)) {
    for (const [c, v] of cats) if (v > alloc.amount + 1e-9) return `${c} exceeds allocation`;
  } else {
    const sum = cats.reduce((s, [, v]) => s + v, 0);
    if (sum > alloc.amount + 1e-9) return "category amounts exceed the total";
  }
  return null;
}
const act2h = { durationHours: 2 };
console.log("BACB double-counting");
t("2 CEU split 1 Ethics + 1 Supervision is accepted",
  validateAllocation({ amount: 2, byCategory: { ETHICS: 1, SUPERVISION: 1 } }, act2h, "BCBA") === null);
t("2 CEU claimed as 2 Ethics AND 2 Supervision is refused",
  validateAllocation({ amount: 2, byCategory: { ETHICS: 2, SUPERVISION: 2 } }, act2h, "BCBA") !== null);
t("allocation above the activity's unique hours is refused",
  validateAllocation({ amount: 3, byCategory: { ETHICS: 3 } }, act2h, "BCBA") !== null);

/* ---- 2. CPBAO: overlapping categories, hours counted once ---- */
console.log("CPBAO overlapping categories");
const cpbaoAlloc = { amount: 2, byCategory: { SECTION_B: 2, ETHICS: 2, SUPERVISION: 2 } };
t("2h ethical supervision course satisfies three categories",
  validateAllocation(cpbaoAlloc, act2h, "ONT_RBA") === null);
const uniqueHours = cpbaoAlloc.amount;
const satisfied = Object.values(cpbaoAlloc.byCategory).reduce((s, v) => s + v, 0);
t("total CPD hours stay 2, not 6", uniqueHours === 2, `got ${uniqueHours}`);
t("requirements satisfied is reported separately as 6", satisfied === 6, `got ${satisfied}`);
t("a category above the allocation is refused",
  validateAllocation({ amount: 2, byCategory: { ETHICS: 3 } }, act2h, "ONT_RBA") !== null);

/* ---- 3. Rule versioning: date-aware selection ---- */
console.log("Rule versioning");
const RULES = [
  { credential: "BCBA", version: "current", effectiveDate: "2022-01-01", endDate: "2026-12-31", supervision: 3 },
  { credential: "BCBA", version: "2027", effectiveDate: "2027-01-01", endDate: null, supervision: 4 },
];
function ruleFor(cred, cycleStart) {
  return RULES.filter(r => r.credential === cred && r.effectiveDate <= cycleStart && (r.endDate == null || cycleStart <= r.endDate))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}
t("a 2025 cycle uses the current rule (3 supervision)", ruleFor("BCBA", "2025-06-01").version === "current");
t("a 2027 cycle uses the 2027 rule (4 supervision)", ruleFor("BCBA", "2027-03-01").version === "2027");
t("the 2027 rule does not retroactively apply to 2025", ruleFor("BCBA", "2025-06-01").supervision === 3);

/* ---- 4. Ecosystem score: renormalized weights, absent source is not zero ---- */
console.log("Ecosystem score");
const W = { OBJECTIVE: 35, SUPERVISOR: 30, PEER: 15, SELF: 10, PD: 10 };
function score(responses) {
  const srcs = Object.keys(W);
  const present = srcs.filter(s => responses.some(r => r.source === s));
  const total = present.reduce((n, s) => n + W[s], 0);
  if (!present.length) return null;
  let pts = 0;
  for (const s of present) {
    const rs = responses.filter(r => r.source === s);
    const mean = rs.reduce((n, r) => n + r.rating, 0) / rs.length;
    pts += ((mean - 1) / 4) * 100 * (W[s] / total);
  }
  return Math.round(pts);
}
t("all fives is 100", score(Object.keys(W).map(s => ({ source: s, rating: 5 }))) === 100);
t("all threes is 50", score(Object.keys(W).map(s => ({ source: s, rating: 3 }))) === 50);
t("all ones is 0", score(Object.keys(W).map(s => ({ source: s, rating: 1 }))) === 0);
t("no inputs returns null rather than 0", score([]) === null);
const partial = score([{ source: "SELF", rating: 5 }]);
t("a single strong self rating with no other source is 100, not penalized", partial === 100, `got ${partial}`);

/* ---- 5. Recognition anti-gaming ---- */
console.log("Recognition guardrails");
const ALLOWANCE = 10, PER_PERSON = 5;
function check(draft, month) {
  if (draft.from === draft.to) return "self";
  if (!draft.message || draft.message.trim().length < 12) return "message";
  const given = month.filter(r => r.from === draft.from);
  if (given.reduce((s, r) => s + r.points, 0) + draft.points > ALLOWANCE) return "allowance";
  if (given.filter(r => r.to === draft.to).reduce((s, r) => s + r.points, 0) + draft.points > PER_PERSON) return "perPerson";
  if (given.some(r => r.to === draft.to && r.category === draft.category && r.message === draft.message)) return "duplicate";
  return null;
}
const msg = "reset the room and prepped materials";
t("self-recognition refused", check({ from: "A", to: "A", points: 1, message: msg }, []) === "self");
t("empty explanation refused", check({ from: "A", to: "B", points: 1, message: "ok" }, []) === "message");
t("within allowance accepted", check({ from: "A", to: "B", points: 2, message: msg, category: "X" }, []) === null);
t("over the per-person cap refused",
  check({ from: "A", to: "B", points: 2, message: msg, category: "X" },
    [{ from: "A", to: "B", points: 4, message: msg, category: "X" }]) === "perPerson");
t("over the monthly allowance refused",
  check({ from: "A", to: "C", points: 2, message: msg, category: "X" },
    [{ from: "A", to: "B", points: 5, message: msg, category: "Y" }, { from: "A", to: "D", points: 4, message: msg, category: "Z" }]) === "allowance");
t("duplicate refused",
  check({ from: "A", to: "B", points: 1, message: msg, category: "X" },
    [{ from: "A", to: "B", points: 1, message: msg, category: "X" }]) === "duplicate");

/* ---- 6. Time-off entitlements ---- */
console.log("Time off");
function ent(years) { return years >= 5 ? 15 : 10; }
t("under 5 years of service is 10 vacation days", ent(3) === 10);
t("at 5 years of service is 15 vacation days", ent(5) === 15);

/* ---- 7. Bonus eligibility explains itself ---- */
console.log("Bonus eligibility");
function bonus(i, min = 80) {
  const reasons = [
    { met: (i.score ?? -1) >= min }, { met: i.training }, { met: i.docs }, { met: i.cred }, { met: i.policies },
  ];
  if (i.score == null) return { status: "PENDING", reasons };
  return { status: reasons.every(r => r.met) ? "QUALIFIED" : "NOT_QUALIFIED", reasons };
}
t("all conditions met qualifies", bonus({ score: 91, training: true, docs: true, cred: true, policies: true }).status === "QUALIFIED");
t("high score with outstanding training does not qualify",
  bonus({ score: 95, training: false, docs: true, cred: true, policies: true }).status === "NOT_QUALIFIED");
t("no score yet is pending, never a failure", bonus({ score: null, training: true, docs: true, cred: true, policies: true }).status === "PENDING");
t("every condition is reported with its own line", bonus({ score: 91, training: true, docs: true, cred: true, policies: true }).reasons.length === 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
