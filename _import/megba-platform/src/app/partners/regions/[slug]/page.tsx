import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { regionPages, getRegionPage, regionStatusMeta } from "@/content/regions";

export function generateStaticParams() {
  return regionPages.map((r) => ({ slug: r.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const r = getRegionPage(params.slug);
  if (!r) return buildMetadata({ title: "Region" });
  return buildMetadata({
    title: `${r.name}, Practice & Supervision`,
    path: `/partners/regions/${r.slug}`,
    description: r.intro,
  });
}

export default function RegionPage({ params }: { params: { slug: string } }) {
  const region = getRegionPage(params.slug);
  if (!region) notFound();

  return (
    <>
      <PageHero
        eyebrow="Practice & supervision"
        title={region.name}
        description={region.intro}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Practice & Supervision", href: "/partners/regions" },
          { name: region.name },
        ]}
      >
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${regionStatusMeta[region.status].tone}`}
        >
          {region.availability}
        </span>
      </PageHero>

      <Section>
        <Container className="max-w-2xl">
          <SectionHeading eyebrow="Highlights" title="What we offer here" />
          <ul className="mt-6 space-y-3">
            {region.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CTASection eyebrow={`Partner with MEGBA, ${region.name}`} />
    </>
  );
}
