/**
 * BrightHR/BrightSafe link resolution — server-only.
 *
 * `lib/content.ts` is imported by client components (training/page.tsx
 * renders straight from it), so anything it exports ships in the browser
 * bundle. The BrightHR tenant ID used to live there, embedded directly in
 * each course's externalUrl - readable by anyone who opened devtools on the
 * training page, not just signed-in employees. Never import this file from
 * a "use client" module; only the /api/course-link route handler should.
 */

const B_HR = "https://elearning.brighthr.com/ca";
const B_SAFE = "https://elearning.brightsafe.com/ca";

/**
 * TEMPORARY — clinic-specific value hardcoded as a fallback.
 *
 * This UUID is Mount Etna's own BrightHR tenant. Per CLAUDE.md, a
 * clinic-specific value in code is temporary by definition and has to say so:
 * the objective is multiple clinics on a subscription, and the second one to
 * sign up would silently be handed Mount Etna's BrightHR courses.
 *
 * The env var is the correct mechanism for a single-tenant deployment and is
 * already server-only (PR #54 moved it off the client bundle). What it cannot
 * express is more than one clinic in one deployment, which needs a per-clinic
 * setting rather than an environment variable. Logged in BLOCKED-employee.md —
 * it is not a same-session fix because the courses themselves are per-tenant
 * BrightHR content, so the mapping below becomes tenant data too, not just
 * this one id.
 *
 * The fallback is kept rather than removed so a missing env var degrades to
 * the anchor client's working links instead of producing eight dead course
 * URLs; a `?tid=undefined` would fail at BrightHR with nothing pointing at the
 * cause.
 */
const TID = `?tid=${process.env.BRIGHTHR_TENANT_ID ?? "2a856fee-a895-436b-89c6-96ade3116943"}`;

const COURSE_LINKS: Record<string, string> = {
  "cc-aoda-accessibility": `${B_HR}/aoda-awareness/${TID}`,
  "cc-working-together": `${B_HR}/workingtogether-the-code-the-aoda/${TID}`,
  "cc-ohsa": `${B_SAFE}/getting-to-know-the-ohsa-in-ontario/${TID}#/`,
  "cc-whmis": `${B_SAFE}/whmis-v2/${TID}#/`,
  "cc-violence-harassment": `${B_SAFE}/workplace-violence-and-harassment/${TID}#/`,
  "cc-hs-four-steps": `${B_SAFE}/worker-health-safety-awareness-four-steps/${TID}#/`,
  "cc-hazardous-substances": `${B_SAFE}/hazardoussubstances/${TID}#/`,
  "cc-wellbeing": `${B_SAFE}/wellbeing-at-work/${TID}#/`,
};

export function resolveCourseLink(key: string): string | null {
  return COURSE_LINKS[key] ?? null;
}
