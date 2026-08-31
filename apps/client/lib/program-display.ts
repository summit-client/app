/** A single goal/program row as this app ever selects it (`id, name,
 *  domain, status` from `programs`) - shared by the dashboard's snapshot
 *  and the full pages/progress.tsx list so both read one type. */
export type Program = {
  id: string;
  name: string;
  domain: string | null;
  status: string;
};

/**
 * "Progress Snapshot" (and now pages/progress.tsx) used to order goals
 * alphabetically by status ("active" < "archived" < "draft" <
 * "maintenance" < "mastered" < "on_hold" < "pending_signoff"), which put
 * discontinued ("archived") goals second - ahead of "maintenance",
 * "mastered" and "on_hold" - for no reason other than the letter A.
 * Sorted by an explicit priority instead: goals actively worked on first,
 * then goals worth celebrating or needing attention, then not-yet-visible
 * internal states, archived goals last since they're the least relevant
 * to a family checking on current progress. Name breaks ties within the
 * same priority.
 */
const PROGRAM_STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  maintenance: 1,
  on_hold: 2,
  mastered: 3,
  pending_signoff: 4,
  draft: 5,
  archived: 6,
};

/** Every status this app actually assigns a priority/colour to, in family-
 *  relevant order - used to build the /progress status filter so its tabs
 *  match this same ordering instead of whatever order the DB returns. */
export const PROGRAM_STATUS_ORDER = Object.keys(PROGRAM_STATUS_PRIORITY);

export function sortProgramsForFamily(programs: Program[]): Program[] {
  return [...programs].sort((a, b) => {
    const priorityA = PROGRAM_STATUS_PRIORITY[a.status] ?? PROGRAM_STATUS_PRIORITY.draft;
    const priorityB = PROGRAM_STATUS_PRIORITY[b.status] ?? PROGRAM_STATUS_PRIORITY.draft;
    return priorityA !== priorityB ? priorityA - priorityB : a.name.localeCompare(b.name);
  });
}

/** Label for a goal with no `domain` set - a fallback bucket, not a real
 *  clinical domain, so it reads as "uncategorized" rather than a made-up
 *  domain name. */
export const UNSPECIFIED_DOMAIN = "Other";

/**
 * Groups an already-sorted goal list by `domain` for pages/progress.tsx,
 * preserving each domain's first-seen order (which - since the input is
 * sorted by sortProgramsForFamily - means a domain with more
 * currently-active goals tends to surface earlier) rather than
 * alphabetizing domain names, which would separate related goals from
 * whatever context made them appear together in the first place.
 */
export function groupProgramsByDomain(programs: Program[]): Array<{ domain: string; programs: Program[] }> {
  const order: string[] = [];
  const byDomain = new Map<string, Program[]>();

  for (const program of programs) {
    const domain = program.domain?.trim() || UNSPECIFIED_DOMAIN;
    if (!byDomain.has(domain)) {
      order.push(domain);
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(program);
  }

  return order.map((domain) => ({ domain, programs: byDomain.get(domain)! }));
}
