import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";
import { academies } from "@/content/academies";
import { services } from "@/content/services";
import { courses } from "@/content/courses";
import { insights, caseStudies, events } from "@/content/misc";
import { regionPages } from "@/content/regions";
import { legalDocs } from "@/content/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    "/",
    "/about",
    "/about/mission",
    "/about/team",
    "/about/credentials",
    "/about/ecosystem",
    "/academies",
    "/services",
    "/technology",
    "/technology/multilingual",
    "/partners/become-a-partner",
    "/partners/regions",
    "/courses",
    "/events",
    "/resources",
    "/insights",
    "/case-studies",
    "/faq",
    "/contact",
    "/book-consultation",
    "/request-proposal",
    "/request-demo",
    "/careers",
  ];

  const dynamic = [
    ...academies.map((a) => `/academies/${a.slug}`),
    ...services.map((s) => `/services/${s.slug}`),
    ...courses.map((c) => `/courses/${c.slug}`),
    ...insights.map((i) => `/insights/${i.slug}`),
    ...caseStudies.map((c) => `/case-studies/${c.slug}`),
    ...events.map((e) => `/events/${e.slug}`),
    ...regionPages.map((r) => `/partners/regions/${r.slug}`),
    ...legalDocs.map((d) => `/legal/${d.slug}`),
  ];

  return [...staticPaths, ...dynamic].map((path) => ({
    url: absoluteUrl(path),
    lastModified: "2026-08-06",
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
