import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { caseStudies } from "@/content/misc";

export const metadata = buildMetadata({
  title: "Case Studies",
  path: "/case-studies",
  description: "How MEGBA supports schools, organizations, and communities.",
});

export default function CaseStudiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Case studies"
        title="Partnerships in practice"
        description="As our partnerships mature, we'll share how MEGBA supports schools, organizations, and communities, with verified outcomes and partner permission."
        crumbs={[{ name: "Home", href: "/" }, { name: "Case Studies" }]}
      />
      <Section>
        <Container>
          {caseStudies.length === 0 ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-10 text-center shadow-card">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest">
                <FileText className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-xl font-semibold">Case studies coming soon</h2>
              <p className="mt-2 text-muted-foreground">
                We publish case studies only once outcomes are verified and partners have given
                permission. In the meantime, we&apos;re happy to discuss references directly.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button href="/contact">Talk to us</Button>
                <Button href="/services/school-partnerships" variant="outline">
                  Explore partnerships
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {caseStudies.map((c) => (
                <Link
                  key={c.slug}
                  href={`/case-studies/${c.slug}`}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:border-forest hover:shadow-lift"
                >
                  <Badge tone="sage">{c.region}</Badge>
                  <h2 className="mt-3 text-xl font-semibold group-hover:text-forest">{c.title}</h2>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.challenge}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                    Read the case study
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
