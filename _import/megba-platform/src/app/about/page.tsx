import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/alert";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { careDisclaimer } from "@/content/site";

export const metadata = buildMetadata({
  title: "About MEGBA",
  path: "/about",
  description:
    "Mount Etna Global Behaviour Academy is an internationally positioned behaviour-science education and consultation system.",
});

const combines = [
  "International behaviour-science education",
  "School-based behaviour consultation",
  "Teacher and staff training",
  "Parent and caregiver coaching",
  "Professional and technician training",
  "Institutional learning-platform access",
  "Multilingual educational technology",
  "Canadian clinical and educational expertise, shared internationally",
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About MEGBA"
        title="An internationally positioned behaviour-science system"
        description="Mount Etna Global Behaviour Academy serves students, parents, educators, clinicians, schools, and organizations, helping them understand behaviour and apply practical, evidence-informed strategies across classrooms, homes, clinics, and communities."
        crumbs={[{ name: "Home", href: "/" }, { name: "About" }]}
      />

      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div className="prose-reading">
            <p>
              MEGBA helps schools, families, and professionals understand behaviour and apply
              practical, evidence-informed strategies. We combine international education,
              consultation, training, coaching, and multilingual technology into one coherent system
, grounded in Canadian standards of practice, shared internationally, and adapted to each community.
            </p>
            <p>
              We are the global <strong>scale engine</strong> of the wider Mount Etna ecosystem:
              where individualized clinical care meets the systems, knowledge, and capacity that make
              it sustainable across whole schools, organizations, and regions.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="eyebrow mb-4">MEGBA combines</p>
            <ul className="space-y-2.5">
              {combines.map((c, i) => (
                <li key={c} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest/10 text-xs font-semibold text-forest">
                    {i + 1}
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container>
          <SectionHeading
            eyebrow="Explore"
            title="Get to know MEGBA"
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Our Global Mission", href: "/about/mission" },
              { label: "Our Team", href: "/about/team" },
              { label: "Credentials & Expertise", href: "/about/credentials" },
              { label: "The Mount Etna Ecosystem", href: "/about/ecosystem" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex items-center justify-between rounded-lg border border-border bg-background p-5 font-medium hover:border-forest hover:text-forest"
              >
                {l.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container className="max-w-3xl">
          <Alert tone="note" title="How our services fit together">
            {careDisclaimer}
          </Alert>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
