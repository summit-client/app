import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { services } from "@/content/services";

export const metadata = buildMetadata({
  title: "Services",
  path: "/services",
  description:
    "Consultation, training, coaching, technician pathways, licensing, and white-label solutions.",
});

const groups = [
  { label: "For schools & organizations", slugs: ["school-partnerships", "school-consultation", "teacher-training", "institutional-licensing", "white-label"] },
  { label: "For families & professionals", slugs: ["parent-coaching", "technician-training", "rbt-aligned", "continuing-education"] },
];

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Consultation, training, and technology, end to end"
        description="From school-wide consultation to individual parent coaching, MEGBA offers a connected set of services on one multilingual platform."
        crumbs={[{ name: "Home", href: "/" }, { name: "Services" }]}
      />
      <Section>
        <Container className="space-y-14">
          {groups.map((group) => (
            <div key={group.label}>
              <SectionHeading eyebrow={group.label} title="" className="mb-0" />
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {group.slugs
                  .map((slug) => services.find((s) => s.slug === slug)!)
                  .filter(Boolean)
                  .map((s) => (
                    <Link
                      key={s.slug}
                      href={`/services/${s.slug}`}
                      className="group flex flex-col rounded-lg border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-forest">
                        <s.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold group-hover:text-forest">{s.title}</h3>
                      <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.summary}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                        Learn more
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
