/**
 * Assessment instruments — the structures behind the organization's Excel
 * dashboards (ABLLS-R, AFLS editions, ADL, MOTAS), rebuilt as first-class
 * platform features: administer → domain dashboard → repeat administrations
 * graphed over time → treatment-planning evidence.
 *
 * Licensing note: MOTAS and the ADL checklist are in-house instruments and
 * ship with their full domain structure. ABLLS-R and AFLS are commercial,
 * licensed instruments — Summit ships their domain scaffolding and rating
 * scales only; item banks come from the organization's licensed materials
 * (entered once by an administrator, per the licence).
 */

export interface RatingLevel {
  value: number;
  label: string;
  description?: string;
}

export interface InstrumentDomain {
  code: string;
  name: string;
  items: string[];          // representative/in-house items; licensed banks entered by the org
}

export interface Instrument {
  id: string;
  name: string;
  shortName: string;
  kind: "in_house" | "licensed";
  cadence: string;          // administration guidance
  scale: RatingLevel[];
  maxPerItem: number;
  bands: { label: string; minPct: number; maxPct: number }[];
  domains: InstrumentDomain[];
}

const MASTERY_BANDS = [
  { label: "Not Started", minPct: 0, maxPct: 0 },
  { label: "Emerging", minPct: 1, maxPct: 49 },
  { label: "Developing", minPct: 50, maxPct: 79 },
  { label: "Mastered", minPct: 80, maxPct: 100 },
];

export const INSTRUMENTS: Instrument[] = [
  {
    id: "motas",
    name: "MOTAS — Meaningful Outcomes Treatment Assessment Scale",
    shortName: "MOTAS",
    kind: "in_house",
    cadence: "Score at intake and at each block boundary; graph across administrations.",
    maxPerItem: 5,
    scale: [
      { value: 0, label: "Not Applicable" },
      { value: 1, label: "Pre-skill", description: "Has not yet demonstrated the skill" },
      { value: 2, label: "Prompted", description: "Completes the skill with prompts (verbal reminders, visual supports, physical guidance)" },
      { value: 3, label: "Independent", description: "Independently engages in the skill without prompting" },
      { value: 4, label: "Generalized", description: "Completes the skill with multiple people and in multiple environments" },
      { value: 5, label: "Maintained", description: "Completes the skill without daily teaching while maintaining generalization — truly mastered" },
    ],
    bands: MASTERY_BANDS,
    domains: [
      { code: "C", name: "Communication", items: ["Uses different vocalizations to indicate being happy, sad, hungry, angry or tired", "Uses voice or gesture to get attention", "Reaches with communicative intent", "Can imitate simple sounds and words"] },
      { code: "SLF", name: "Self-Awareness", items: [] },
      { code: "S", name: "Social Behaviors", items: [] },
      { code: "T", name: "Transitions", items: [] },
      { code: "TO", name: "Toileting", items: [] },
      { code: "H", name: "Hygiene and Personal Care", items: [] },
      { code: "D", name: "Dressing", items: [] },
      { code: "EFP", name: "Eating and Food Preparation", items: [] },
      { code: "SL", name: "Sleep", items: [] },
      { code: "LS", name: "Leisure Skills", items: [] },
      { code: "CH", name: "Chores", items: [] },
      { code: "GS", name: "General Safety", items: [] },
      { code: "AR", name: "Academic Readiness", items: [] },
      { code: "RE", name: "Relationships", items: [] },
      { code: "PT", name: "Perspective Taking", items: [] },
      { code: "TR", name: "Transportation", items: [] },
      { code: "SH", name: "Shopping", items: [] },
      { code: "TM", name: "Time Management", items: [] },
      { code: "E", name: "Employment", items: [] },
      { code: "FI", name: "Finances", items: [] },
    ],
  },
  {
    id: "adl",
    name: "Activities of Daily Living (ADL) Assessment",
    shortName: "ADL",
    kind: "in_house",
    cadence: "Re-administer each treatment block or on programming changes.",
    maxPerItem: 4,
    scale: [
      { value: 0, label: "Refused" },
      { value: 1, label: "Hand-Over-Hand" },
      { value: 2, label: "Physical Prompt" },
      { value: 3, label: "Verbal Prompt" },
      { value: 4, label: "Independent" },
    ],
    bands: MASTERY_BANDS,
    domains: [
      { code: "PH", name: "Personal Hygiene", items: ["Washing hands thoroughly", "Using soap effectively during handwashing", "Drying hands completely", "Washing face", "Brushing teeth", "Rinsing and spitting", "Flossing teeth", "Bathing or showering independently", "Drying body after bath/shower"] },
      { code: "GR", name: "Grooming", items: ["Brushing or combing hair", "Washing hair", "Drying hair", "Trimming nails", "Applying lotion/moisturizer"] },
      { code: "DR", name: "Dressing", items: ["Selecting appropriate clothing for weather", "Putting on shirt/pants independently", "Managing zippers and buttons", "Putting on shoes"] },
      { code: "EF", name: "Eating / Feeding", items: ["Using utensils appropriately", "Drinking from an open cup", "Preparing a simple snack", "Clearing dishes after eating"] },
      { code: "TO", name: "Toileting", items: ["Recognizing the need to use the bathroom", "Using the toilet independently", "Flushing and washing hands after"] },
      { code: "HH", name: "Household", items: ["Tidying personal belongings", "Wiping surfaces", "Sorting laundry", "Making the bed"] },
    ],
  },
  {
    id: "ablls-r",
    name: "ABLLS-R — Assessment of Basic Language and Learning Skills (Revised)",
    shortName: "ABLLS-R",
    kind: "licensed",
    cadence: "Full administration at intake; re-probe touched domains quarterly.",
    maxPerItem: 4,
    scale: [
      { value: 0, label: "0" }, { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }, { value: 4, label: "4" },
    ],
    bands: MASTERY_BANDS,
    domains: [
      "A - Cooperation & Reinforcer Effectiveness", "B - Visual Performance", "C - Receptive Language", "D - Motor Imitation",
      "E - Vocal Imitation", "F - Requests", "G - Labelling", "H - Intraverbals", "I - Spontaneous Vocalizations",
      "J - Syntax and Grammar", "K - Play & Leisure", "L - Social Interaction", "M - Group Instruction", "N - Linguistic Skills",
      "O - Classroom Routines", "P - Generalized Reporting", "Q - Reading Skills", "R - Math Skills", "S - Writing Skills",
      "T - Spelling", "U - Dressing", "V - Eating", "W - Grooming", "X - Toileting", "Y - Gross Motor", "Z - Fine Motor",
    ].map((n) => ({ code: n.slice(0, 1), name: n, items: [] })),
  },
  ...["Basic Living Skills", "Community Participation", "Elementary Social Skills", "High School Social Skills", "School"].map((edition): Instrument => ({
    id: `afls-${edition.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    name: `AFLS — Assessment of Functional Living Skills · ${edition}`,
    shortName: `AFLS ${edition}`,
    kind: "licensed",
    cadence: "One-time baseline plus repeat administrations per block; supervisor sign-off required.",
    maxPerItem: 2,
    scale: [
      { value: 0, label: "Does not perform / full assistance" },
      { value: 1, label: "Partially independent / needs some prompting" },
      { value: 2, label: "Independent / mastered skill" },
    ],
    bands: MASTERY_BANDS,
    domains: (edition === "Basic Living Skills"
      ? ["Daily Living / Hygiene", "Toileting / Bathroom Skills", "Dressing / Clothing Care", "Meal Prep / Cooking", "Household Chores / Cleaning"]
      : [`${edition} domains from the licensed protocol`]
    ).map((n, i) => ({ code: `D${i + 1}`, name: n, items: [] })),
  })),
];

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

/** Band for a domain's percent-of-max score (Not Started / Emerging / Developing / Mastered). */
export function bandFor(instrument: Instrument, pct: number): string {
  const rounded = Math.round(pct);
  return instrument.bands.find((b) => rounded >= b.minPct && rounded <= b.maxPct)?.label
    ?? instrument.bands[0].label;
}

/* ---- administrations (preview store, mirrors the sessions pattern) ----------- */

export interface Administration {
  id: string;
  clientId: number;
  instrumentId: string;
  date: string;                        // ISO
  scores: Record<string, number>;      // "<domainCode>:<itemIndex>" -> rating value
  notes: string;
  supervisorSignoff: string | null;    // AFLS requires initials
}

const AKEY = "summit-assessments";

export function administrations(clientId?: number): Administration[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(sessionStorage.getItem(AKEY) ?? "[]") as Administration[];
    return clientId == null ? all : all.filter((a) => a.clientId === clientId);
  } catch {
    return [];
  }
}

export function saveAdministration(a: Administration): void {
  const all = administrations().filter((x) => x.id !== a.id);
  all.push(a);
  sessionStorage.setItem(AKEY, JSON.stringify(all));
}

/** Domain summary for one administration: total, max, %, band. */
export function domainSummary(instrument: Instrument, a: Administration) {
  return instrument.domains.map((d) => {
    const entries = Object.entries(a.scores).filter(([k]) => k.startsWith(`${d.code}:`));
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const max = entries.length * instrument.maxPerItem;
    const pct = max ? Math.round((total / max) * 100) : 0;
    return { domain: d, scored: entries.length, total, max, pct, band: max ? bandFor(instrument, pct) : "Not Started" };
  });
}

/** Overall % of max across every scored item (the dashboards' % Mastery). */
export function overallPct(instrument: Instrument, a: Administration): number {
  const entries = Object.values(a.scores);
  if (!entries.length) return 0;
  return Math.round((entries.reduce((s, v) => s + v, 0) / (entries.length * instrument.maxPerItem)) * 100);
}
