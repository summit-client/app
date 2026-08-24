import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/alert";
import { buildMetadata } from "@/lib/seo";
import { legalDocs, getLegalDoc } from "@/content/legal";
import { legalNav } from "@/content/site";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return legalDocs.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const d = getLegalDoc(params.slug);
  if (!d) return buildMetadata({ title: "Legal" });
  return buildMetadata({ title: d.title, path: `/legal/${d.slug}`, description: d.intro, noindex: false });
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const doc = getLegalDoc(params.slug);
  if (!doc) notFound();

  return (
    <>
      <PageHero
        eyebrow="Legal & policies"
        title={doc.title}
        description={doc.intro}
        crumbs={[{ name: "Home", href: "/" }, { name: doc.title }]}
      />
      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1fr_260px]">
          <div className="max-w-reading">
            <p className="text-sm text-muted-foreground">Last updated {formatDate(doc.updated)}</p>
            <Alert tone="warning" className="mt-4">
              This is a template and requires legal review before deployment in each jurisdiction.
              MEGBA does not claim automatic compliance with any specific privacy or education law.
            </Alert>
            <div className="mt-8 space-y-8">
              {doc.sections.map((s) => (
                <section key={s.heading}>
                  <h2 className="text-xl font-semibold">{s.heading}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-3 text-muted-foreground">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow mb-3">All policies</p>
            <ul className="space-y-1">
              {legalNav.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`block rounded-md px-3 py-2 text-sm hover:bg-forest/5 ${
                      l.href === `/legal/${doc.slug}` ? "bg-forest/5 font-medium text-forest" : "text-muted-foreground"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </Container>
      </Section>
    </>
  );
}
