import type { Metadata } from "next";
import { org } from "@/content/site";
import { absoluteUrl } from "@/lib/utils";

type SeoInput = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
};

const DEFAULT_DESCRIPTION = org.description;

/** Build consistent, SEO-friendly metadata for a page. */
export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = "/opengraph-image",
  type = "website",
  noindex = false,
}: SeoInput = {}): Metadata {
  const fullTitle = title ? `${title}, ${org.shortName}` : `${org.name}, ${org.tagline}`;
  const url = absoluteUrl(path);
  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: org.name,
      type,
      images: [{ url: image, width: 1200, height: 630, alt: org.name }],
      locale: "en_CA",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image],
    },
  };
}

/* ---------------------------- JSON-LD builders ---------------------------- */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: org.name,
    alternateName: org.shortName,
    description: org.description,
    email: org.email,
    url: absoluteUrl("/"),
    sameAs: [org.social.linkedin, org.social.youtube],
    slogan: org.tagline,
  };
}

export function courseJsonLd(course: {
  title: string;
  summary: string;
  slug: string;
  languages: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.summary,
    url: absoluteUrl(`/courses/${course.slug}`),
    provider: {
      "@type": "EducationalOrganization",
      name: org.name,
      url: absoluteUrl("/"),
    },
    inLanguage: course.languages,
  };
}

export function articleJsonLd(a: {
  title: string;
  excerpt: string;
  slug: string;
  date: string;
  author: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt,
    datePublished: a.date,
    author: { "@type": "Organization", name: a.author },
    publisher: { "@type": "Organization", name: org.name },
    url: absoluteUrl(`/insights/${a.slug}`),
  };
}

export function eventJsonLd(e: {
  title: string;
  summary: string;
  slug: string;
  date: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.summary,
    startDate: e.date,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    organizer: { "@type": "Organization", name: org.name, url: absoluteUrl("/") },
    url: absoluteUrl(`/events/${e.slug}`),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}
