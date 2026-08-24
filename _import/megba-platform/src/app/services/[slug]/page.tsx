import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { services, getService } from "@/content/services";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const s = getService(params.slug);
  if (!s) return buildMetadata({ title: "Service" });
  return buildMetadata({ title: s.title, path: `/services/${s.slug}`, description: s.summary });
}

export default function ServicePage({ params }: { params: { slug: string } }) {
  const service = getService(params.slug);
  if (!service) notFound();

  return (
    <>
      <PageHero
        eyebrow={service.eyebrow}
        title={service.title}
        description={service.summary}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Services", href: "/services" },
          { name: service.title },
        ]}
      >
        <div className="flex flex-wrap gap-3">
          <Button href={service.cta.href}>{service.cta.label}</Button>
          <Button href="/contact" variant="outline">
            Ask a question
          </Button>
        </div>
      </PageHero>

      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="prose-reading !max-w-none">{service.intro}</p>
            <SectionHeading eyebrow="What's included" title="" className="mb-0 mt-10" />
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {service.offerings.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
            {service.note ? (
              <Alert tone="note" className="mt-8">
                {service.note}
              </Alert>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="eyebrow mb-2">Who it's for</p>
              <p className="text-sm text-muted-foreground">{service.audience}</p>
            </div>
            {service.secondary ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="eyebrow mb-3">{service.secondaryTitle}</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {service.secondary.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-xl border border-forest/20 bg-forest-50 p-6">
              <p className="font-semibold text-forest">Ready to start?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us your context and we&apos;ll tailor a plan.
              </p>
              <Button href={service.cta.href} className="mt-4">
                {service.cta.label}
              </Button>
            </div>
          </aside>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
