import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { languages } from "@/content/languages";

export const metadata = buildMetadata({
  title: "Multilingual Learning",
  path: "/technology/multilingual",
  description:
    "MEGBA delivers learning in at least 10 languages, with an editable language list and professional review of localized content.",
});

const workflow = [
  { step: "1", title: "Draft", body: "Source content is authored in the base language (English)." },
  { step: "2", title: "Machine-assisted translation", body: "A first-pass translation accelerates coverage, but is never published as-is." },
  { step: "3", title: "Professional review", body: "A qualified reviewer checks accuracy, tone, and clinical/educational fidelity." },
  { step: "4", title: "Cultural adaptation", body: "Examples and terminology are adapted to local context." },
  { step: "5", title: "Sign-off & publish", body: "Only reviewed locales are represented as formally localized." },
];

export default function MultilingualPage() {
  return (
    <>
      <PageHero
        eyebrow="Multilingual learning"
        title="Learning in your language, reviewed, not just translated"
        description="The platform is built to deliver in at least 10 languages. The enabled list is editable in the CMS, so administrators can add languages without a code change."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Technology", href: "/technology" },
          { name: "Multilingual" },
        ]}
      />

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Supported languages"
            title="An editable, growing list"
            description="Italian and Bulgarian are our current professionally-reviewed priority languages (alongside English). Other locales are available through automatic translation while professional review is in progress."
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {languages.map((l) => (
              <div
                key={l.code}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="font-medium">{l.nativeLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.label} · {l.code.toUpperCase()}
                  </p>
                </div>
                {l.reviewed ? (
                  <Badge tone="forest">Reviewed</Badge>
                ) : (
                  <Badge tone="stone">UI enabled</Badge>
                )}
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container>
          <SectionHeading eyebrow="Localization workflow" title="How content becomes localized" />
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {workflow.map((w) => (
              <li key={w.step} className="rounded-lg border border-border bg-background p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-sm font-semibold text-primary-foreground">
                  {w.step}
                </span>
                <h3 className="mt-3 font-semibold">{w.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{w.body}</p>
              </li>
            ))}
          </ol>
          <Alert tone="warning" className="mt-8">
            The architecture also supports right-to-left (RTL) language expansion, even though no RTL
            language is enabled initially.
          </Alert>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
