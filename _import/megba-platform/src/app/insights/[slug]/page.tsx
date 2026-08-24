import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, articleJsonLd } from "@/lib/seo";
import { insights, getInsight } from "@/content/misc";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return insights.map((i) => ({ slug: i.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getInsight(params.slug);
  if (!a) return buildMetadata({ title: "Article" });
  return buildMetadata({
    title: a.title,
    path: `/insights/${a.slug}`,
    description: a.excerpt,
    type: "article",
  });
}

export default function InsightPage({ params }: { params: { slug: string } }) {
  const article = getInsight(params.slug);
  if (!article) notFound();

  return (
    <>
      <JsonLd data={articleJsonLd(article)} />
      <PageHero
        eyebrow={article.category}
        title={article.title}
        description={`${formatDate(article.date)} · ${article.readMinutes} min read · ${article.author}`}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Insights", href: "/insights" },
          { name: article.title },
        ]}
      />
      <Section>
        <Container>
          <article className="prose-reading">
            {article.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </article>
          <div className="mx-auto mt-12 max-w-reading">
            <Link href="/insights" className="text-sm font-medium text-forest hover:underline">
              ← Back to all articles
            </Link>
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
