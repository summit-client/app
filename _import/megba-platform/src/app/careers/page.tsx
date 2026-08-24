import { MapPin, Clock } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Careers",
  path: "/careers",
  description: "Join MEGBA, behaviour analysts, educators, and platform builders.",
});

const roles = [
  { title: "Behaviour Analyst (BCBA/IBA)", location: "Remote · Global", type: "Full-time", team: "Clinical" },
  { title: "International School Consultant", location: "Remote · Europe", type: "Contract", team: "Consultation" },
  { title: "Learning Designer", location: "Remote", type: "Full-time", team: "Learning" },
  { title: "Localization Reviewer", location: "Remote · Multiple languages", type: "Contract", team: "Platform" },
];

const values = [
  "Neurodiversity-affirming and respectful practice",
  "Capacity-building over dependency",
  "Culturally responsive, context-sensitive delivery",
  "Evidence-informed, ethical decision-making",
];

export default function CareersPage() {
  return (
    <>
      <PageHero
        eyebrow="Careers"
        title="Help behaviour science cross borders"
        description="We're building an international team of behaviour analysts, educators, and platform builders. Explore where you might fit, or introduce yourself for future openings."
        crumbs={[{ name: "Home", href: "/" }, { name: "Careers" }]}
      />
      <Section>
        <Container>
          <SectionHeading eyebrow="Open roles" title="Where you could fit" />
          <ul className="mt-8 space-y-4">
            {roles.map((r) => (
              <li
                key={r.title}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="sage">{r.team}</Badge>
                  </div>
                  <h2 className="mt-2 text-lg font-semibold">{r.title}</h2>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4" aria-hidden />
                      {r.location}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-4 w-4" aria-hidden />
                      {r.type}
                    </span>
                  </p>
                </div>
                <Button href="/contact?topic=Careers" variant="outline">
                  Express interest
                </Button>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
      <Section className="bg-muted">
        <Container className="max-w-2xl">
          <SectionHeading eyebrow="How we work" title="What we value" />
          <ul className="mt-6 space-y-2">
            {values.map((v) => (
              <li key={v} className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                {v}
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
