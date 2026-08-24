import Link from "next/link";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { insights } from "@/content/misc";
import { formatDate } from "@/lib/utils";

export const metadata = buildMetadata({
  title: "Articles & Insights",
  path: "/insights",
  description: "Ideas from the field, classroom practice, school systems, and platform thinking.",
});

export default function InsightsPage() {
  return (
    <>
      <PageHero
        eyebrow="Articles & insights"
        title="Ideas from the field"
        description="Practical thinking on behaviour-informed classrooms, school systems, and multilingual learning."
        crumbs={[{ name: "Home", href: "/" }, { name: "Insights" }]}
      />
      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {insights.map((a) => (
              <Link
                key={a.slug}
                href={`/insights/${a.slug}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone="sage">{a.category}</Badge>
                  <span>{a.readMinutes} min</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold group-hover:text-forest">{a.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{a.excerpt}</p>
                <span className="mt-4 text-xs text-muted-foreground">{formatDate(a.date)}</span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
