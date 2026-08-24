import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { ecosystem } from "@/content/site";

export const metadata = buildMetadata({
  title: "The Mount Etna Ecosystem",
  path: "/about/ecosystem",
  description:
    "MEGBA is the global scale engine within the broader Mount Etna ecosystem of clinical, community, and technology organizations.",
});

export default function EcosystemPage() {
  return (
    <>
      <PageHero
        eyebrow="The Mount Etna ecosystem"
        title="One ecosystem, complementary roles"
        description="MEGBA is the global scale engine, the education, training, consultation, and platform layer that surrounds individualized clinical care."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "About", href: "/about" },
          { name: "Ecosystem" },
        ]}
      />
      <Section>
        <Container>
          <div className="grid gap-6 lg:grid-cols-2">
            {ecosystem.map((e) => (
              <div
                key={e.name}
                className={`rounded-xl border p-6 ${
                  "current" in e && e.current
                    ? "border-forest bg-forest text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{e.name}</h2>
                  {"current" in e && e.current ? <Badge tone="ember">You are here</Badge> : null}
                </div>
                <p
                  className={`mt-1 text-sm font-medium ${
                    "current" in e && e.current ? "text-sage-300" : "text-ember"
                  }`}
                >
                  {e.role}
                </p>
                <p
                  className={`mt-3 text-sm ${
                    "current" in e && e.current
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  {e.blurb}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-border bg-card p-8">
            <h2 className="text-xl font-semibold">How the pieces fit</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Mount Etna Child &amp; Family Services delivers direct clinical and family support.
              Embers for Access Foundation removes barriers through subsidy and sponsored access.
              MEGBA scales education, training, and consultation globally. SummitClient.io provides
              the digital infrastructure, learning, client management, reporting, and multilingual
              delivery. Together, they surround children, families, schools, and clinical teams with
              knowledge, systems, and capacity.
            </p>
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
