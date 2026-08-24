/**
 * Where MEGBA practises.
 *
 * We operate in Ontario, Canada, are expanding to Bulgaria in 2027, and offer
 * virtual services worldwide alongside in-person field visits. We label this
 * honestly rather than implying a physical presence elsewhere.
 */
export type RegionStatus = "current" | "expansion" | "worldwide";

export const regionStatusMeta: Record<RegionStatus, { label: string; tone: string }> = {
  current: { label: "Currently serving", tone: "bg-forest text-primary-foreground" },
  expansion: { label: "Expanding · 2027", tone: "bg-sage-500 text-forest-900" },
  worldwide: { label: "Virtual worldwide", tone: "bg-stone-300 text-charcoal" },
};

export type RegionPage = {
  slug: string;
  name: string;
  status: RegionStatus;
  availability: string;
  intro: string;
  highlights: string[];
};

export const regionPages: RegionPage[] = [
  {
    slug: "north-america",
    name: "Canada",
    status: "current",
    availability: "Currently serving Ontario, Canada",
    intro:
      "MEGBA's home base. We currently serve Ontario, Canada directly, delivering Canadian standards of behaviour-science practice across schools, families, and organizations, shared internationally.",
    highlights: [
      "Ontario Registered Behaviour Analysts (RBAs) & BCBAs",
      "Canadian standards of practice",
      "Virtual and in-person delivery",
      "Bilingual English / French offerings",
    ],
  },
  {
    slug: "bulgaria",
    name: "Bulgaria",
    status: "expansion",
    availability: "Expanding to Bulgaria in 2027",
    intro:
      "We are expanding to Bulgaria in 2027, bringing Canadian standards of behaviour-science practice, and training that builds local capacity, to schools, professionals, and organizations.",
    highlights: [
      "Training local professionals and teachers",
      "International school & university partnerships",
      "Educator & technician training cohorts",
      "Multilingual delivery (Bulgarian reviewed)",
    ],
  },
  {
    slug: "worldwide",
    name: "Worldwide (virtual & field visits)",
    status: "worldwide",
    availability: "Virtual services worldwide, plus in-person field visits",
    intro:
      "Our education, consultation, and platform are available virtually worldwide, and we travel for in-person field visits, so partners anywhere can access high-quality, neuroaffirming behaviour-science support.",
    highlights: [
      "Virtual consultation across time zones",
      "In-person field visits",
      "Multilingual delivery",
      "White-label training via SummitClient.io",
    ],
  },
];

export const getRegionPage = (slug: string) => regionPages.find((r) => r.slug === slug);
