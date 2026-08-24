import Link from "next/link";
import { ArrowRight, MapPin, Video } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { regionPages, regionStatusMeta } from "@/content/regions";

export const metadata = buildMetadata({
  title: "Where We Practise",
  path: "/partners/regions",
  description:
    "MEGBA operates in Ontario, Canada, is expanding to Bulgaria in 2027, and offers virtual services worldwide alongside in-person field visits.",
});

export default function RegionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Where we practise"
        title="Currently serving Ontario, Canada"
        description="We deliver Canadian standards of behaviour-science practice, shared internationally, expanding to Bulgaria in 2027. We offer virtual services worldwide, along with in-person field visits."
        crumbs={[{ name: "Home", href: "/" }, { name: "Where We Practise" }]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="forest">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Ontario, Canada
          </Badge>
          <Badge tone="sage">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Bulgaria · 2027
          </Badge>
          <Badge tone="stone">
            <Video className="h-3.5 w-3.5" aria-hidden /> Virtual worldwide · field visits
          </Badge>
        </div>
      </PageHero>

      <Section>
        <Container>
          <SectionHeading eyebrow="Availability" title="How we can support you today" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {regionPages.map((r) => (
              <Link
                key={r.slug}
                href={`/partners/regions/${r.slug}`}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${regionStatusMeta[r.status].tone}`}
                >
                  {regionStatusMeta[r.status].label}
                </span>
                <h3 className="mt-4 text-xl font-semibold group-hover:text-forest">{r.name}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{r.intro}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <CTASection
        eyebrow="Partnership"
        title="Exploring a partnership in Bulgaria or beyond?"
        description="We're expanding to Bulgaria in 2027 and work virtually worldwide with in-person field visits. Tell us about your context and we'll explore how we can support you."
        primary={{ label: "Request a Consultation", href: "/book-consultation" }}
        secondary={{ label: "Become a Partner", href: "/partners/become-a-partner" }}
      />
    </>
  );
}
