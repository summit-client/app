import {
  Stethoscope,
  Globe2,
  BookOpen,
  BadgeCheck,
  Scale,
  MonitorSmartphone,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { credentials, memberships } from "@/content/credentials";

export const metadata = buildMetadata({
  title: "Our Team",
  path: "/about/team",
  description: "The credentialed, multidisciplinary team behind MEGBA.",
});

const roleAreas = [
  {
    icon: Stethoscope,
    title: "Clinical direction",
    body: "Sets MEGBA's clinical and educational standards and safeguards quality across every academy.",
  },
  {
    icon: Globe2,
    title: "International partnerships",
    body: "Builds school and organization partnerships and shapes context-sensitive, sustainable delivery.",
  },
  {
    icon: BookOpen,
    title: "Learning design",
    body: "Designs multilingual, accessible courses and professional-development pathways.",
  },
  {
    icon: BadgeCheck,
    title: "Technician training",
    body: "Develops and supervises behaviour-technician cohorts, competency tracking, and coaching.",
  },
  {
    icon: Scale,
    title: "Consultation & ethics",
    body: "Supports least-restrictive, culturally responsive, and ethically grounded practice.",
  },
  {
    icon: MonitorSmartphone,
    title: "Platform & localization",
    body: "Oversees the multilingual platform, accessibility, and professional review of localized content.",
  },
];

export default function TeamPage() {
  return (
    <>
      <PageHero
        eyebrow="Our team"
        title="Credentialed, internationally oriented professionals"
        description="MEGBA brings together behaviour-analysis, education, and technology expertise, grounded in Canadian standards of practice and shared internationally."
        crumbs={[{ name: "Home", href: "/" }, { name: "About", href: "/about" }, { name: "Team" }]}
      />

      <Section>
        <Container>
          <SectionHeading
            eyebrow="How we're organized"
            title="A multidisciplinary team"
            description="Our team is structured around the areas that matter most to partners, families, and learners."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roleAreas.map((r) => (
              <div key={r.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sage-100 text-forest">
                  <r.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container>
          <SectionHeading
            eyebrow="Credentials & memberships"
            title="The expertise behind the team"
            description="We present each credential accurately and display only credentials we have formally verified."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            {credentials.map((c) => (
              <Badge key={c.abbr} tone="sage" className="px-3 py-1 text-sm">
                {c.abbr}
              </Badge>
            ))}
            {memberships.map((m) => (
              <Badge key={m.abbr} tone="outline" className="px-3 py-1 text-sm">
                {m.abbr} · {m.relationship}
              </Badge>
            ))}
          </div>
          <div className="mt-6">
            <Button href="/about/credentials" variant="outline">
              See credentials & clinical expertise
            </Button>
          </div>
        </Container>
      </Section>

      <CTASection
        eyebrow="Careers"
        title="Want to join the team?"
        primary={{ label: "See open roles", href: "/careers" }}
        secondary={{ label: "Contact us", href: "/contact" }}
      />
    </>
  );
}
