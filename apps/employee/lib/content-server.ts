/**
 * BrightHR/BrightSafe link resolution — server-only.
 *
 * `lib/content.ts` is imported by client components (training/page.tsx
 * renders straight from it), so anything it exports ships in the browser
 * bundle. The BrightHR tenant ID used to live there, embedded directly in
 * each course's externalUrl - readable by anyone who opened devtools on the
 * training page, not just signed-in employees. Never import this file from
 * a "use client" module; only the /api/course-link route handler should.
 *
 * The tenant ID and the eight course slugs below used to be hardcoded here
 * (Mount Etna's own real BrightHR/BrightSafe values) — a clinic-specific
 * value in code, which blocks a second clinic from ever getting correct
 * training links: they'd silently be sent to Mount Etna's BrightHR tenant
 * and their completions would record against the wrong organization. Both
 * now come from @summit/settings' `training.brighthr` group instead
 * (`training.brighthr.tenantId` and `training.brighthr.courses.<key>`),
 * seeded with exactly those same values as the default — see
 * BRIGHTHR_TENANT_DEFAULT/BRIGHTHR_COURSE_DEFAULTS in packages/settings for
 * the rationale. No org has an override row yet, so this is byte-identical
 * to the old hardcoded behaviour for Mount Etna specifically.
 *
 * Known limitation, same one apps/employee/app/layout.tsx and
 * apps/employee/app/certificates/[id]/page.tsx already carry for
 * `getSetting("org.name")`: this file runs in a Route Handler, and
 * @summit/settings' live cache is only ever populated by initSettings(),
 * which is called client-side (SessionProvider). A Route Handler always
 * reads the settings registry's static default, never a real org's
 * override, and never updates after hydration. That means a second
 * clinic's `training.brighthr.*` override would not actually take effect
 * here yet — this change removes the clinic-specific values from code and
 * gives a real second clinic a place to put its own tenant/course data, but
 * making a Route Handler actually resolve it needs the same server-side
 * settings read apps/data's BLOCKED-data.md already logs as open. Out of
 * scope for this change; tracked there rather than re-logged here.
 *
 * The vendor (BrightHR vs BrightSafe) and URL shape per course key are kept
 * as structural routing in code, not tenant data - a different clinic buys
 * the same BrightHR/BrightSafe products with its own catalogue IDs, but the
 * platform each of these eight compliance courses lives on doesn't change
 * per clinic.
 */

import { getSetting } from "@summit/settings";

const B_HR = "https://elearning.brighthr.com/ca";
const B_SAFE = "https://elearning.brightsafe.com/ca";

type Vendor = "brighthr" | "brightsafe";

const COURSE_VENDOR: Record<string, Vendor> = {
  "cc-aoda-accessibility": "brighthr",
  "cc-working-together": "brighthr",
  "cc-ohsa": "brightsafe",
  "cc-whmis": "brightsafe",
  "cc-violence-harassment": "brightsafe",
  "cc-hs-four-steps": "brightsafe",
  "cc-hazardous-substances": "brightsafe",
  "cc-wellbeing": "brightsafe",
};

export function resolveCourseLink(key: string): string | null {
  // Object.hasOwn, not `COURSE_VENDOR[key] ?? null`. The key comes off the
  // URL, and a plain object literal inherits from Object.prototype:
  // "toString", "constructor" and "valueOf" all return a FUNCTION from the
  // prototype chain, which `?? null` does not catch because a function is
  // neither null nor undefined. That function then reached
  // NextResponse.redirect(), where `new URL(fn)` throws — so
  // /api/course-link/toString answered with an unhandled 500 instead of the
  // 404 the route means to give. COURSE_VENDOR is a fixed object literal
  // with only the eight real course keys, so this guard is still exact even
  // though the slug and tenant ID themselves now come from settings.
  if (!Object.hasOwn(COURSE_VENDOR, key)) return null;

  const vendor = COURSE_VENDOR[key];
  const base = vendor === "brighthr" ? B_HR : B_SAFE;
  const suffix = vendor === "brightsafe" ? "#/" : "";

  const tenantId = String(getSetting("training.brighthr.tenantId"));
  const slug = String(getSetting(`training.brighthr.courses.${key}`));

  return `${base}/${slug}/?tid=${tenantId}${suffix}`;
}
