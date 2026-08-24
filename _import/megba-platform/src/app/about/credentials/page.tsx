import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { credentials, frameworks, memberships } from "@/content/credentials";
import { complianceDisclaimer } from "@/content/site";
import { formatDate } from "@/lib/utils";

export const metadata = buildMetadata({
  title: "Credentials & Clinical Expertise",
  path: "/about/credentials",
  description:
    "MEGBA's credentials and clinical expertise, presented accurately, with only verified credentials displayed.",
});

export default function CredentialsPage() {
  return (
    <>
      <PageHero
        eyebrow="Credentials & clinical expertise"
        title="Credentialed and clinically informed"
        description="Our team includes professionals holding distinct credentials. We present each accurately and display only credentials we have formally verified, credentials are not interchangeable."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "About", href: "/about" },
          { name: "Credentials" },
        ]}
      />

      <Section>
        <Container>
          <SectionHeading eyebrow="Team credentials" title="Distinct, accurately presented" />
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {credentials.map((c) => (
              <div key={c.abbr} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">
                    {c.abbr}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{c.name}</span>
                  </h3>
                  {c.verifiedOn ? (
                    <Badge tone="forest">Verified {formatDate(c.verifiedOn)}</Badge>
                  ) : (
                    <Badge tone="stone">Pending verification</Badge>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container>
          <SectionHeading
            eyebrow="Approaches & frameworks"
            title="Expertise and training"
            description="Our team brings expertise across established, evidence-informed approaches and frameworks."
          />
          <ul className="mt-8 flex flex-wrap gap-2">
            {frameworks.map((f) => (
              <li key={f}>
                <span className="inline-block rounded-full border border-border bg-background px-3.5 py-1.5 text-sm">
                  {f}
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Memberships & recognition"
            title="Connected to the international field"
            description="MEGBA participates in the international behaviour-analysis community and supports internationally recognized accreditation pathways."
          />
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {memberships.map((m) => (
              <div key={m.abbr} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">
                    {m.abbr}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{m.name}</span>
                  </h3>
                  <Badge tone="sage">{m.relationship}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{m.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container className="max-w-3xl space-y-4">
          <Alert tone="note" title="Accuracy & compliance safeguard">
            {complianceDisclaimer}
          </Alert>
          <p className="text-sm text-muted-foreground">
            Administrators can update all credential language, verification dates, and accreditation
            wording from the CMS as standards change. See our{" "}
            <a href="/legal/credential-disclaimer" className="font-medium text-forest underline">
              Credential &amp; Accreditation Disclaimer
            </a>
            .
          </p>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
