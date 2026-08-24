import { notFound } from "next/navigation";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { caseStudies, getCaseStudy } from "@/content/misc";

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getCaseStudy(params.slug);
  if (!c) return buildMetadata({ title: "Case study" });
  return buildMetadata({ title: c.title, path: `/case-studies/${c.slug}`, description: c.challenge });
}

const sections = [
  { key: "challenge", label: "The challenge" },
  { key: "approach", label: "Our approach" },
  { key: "outcome", label: "The outcome" },
] as const;

export default function CaseStudyPage({ params }: { params: { slug: string } }) {
  const study = getCaseStudy(params.slug);
  if (!study) notFound();

  return (
    <>
      <PageHero
        eyebrow="Case study"
        title={study.title}
        description={`${study.region} · ${study.audience}`}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Case Studies", href: "/case-studies" },
          { name: study.title },
        ]}
      >
        <div className="flex items-center gap-2">
          <Badge tone="sage">{study.region}</Badge>
        </div>
      </PageHero>
      <Section>
        <Container className="max-w-3xl space-y-8">
          {sections.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-forest">{s.label}</h2>
              <p className="mt-2 text-muted-foreground">{study[s.key]}</p>
            </div>
          ))}
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
