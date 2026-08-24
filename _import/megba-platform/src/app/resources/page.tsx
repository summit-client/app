import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { ResourceExplorer } from "@/components/marketing/resource-explorer";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Resources",
  path: "/resources",
  description: "Downloadable guides, checklists, templates, and visual supports.",
});

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resource library"
        title="Practical tools you can use today"
        description="Guides, checklists, templates, and visual supports for educators and families. Select any resource to see details, localized versions are professionally reviewed before release."
        crumbs={[{ name: "Home", href: "/" }, { name: "Resources" }]}
      />
      <Section>
        <Container>
          <ResourceExplorer />
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
