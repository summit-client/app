import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, BookOpen, ArrowUpRight } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CourseCard } from "@/components/marketing/course-card";
import { CTASection } from "@/components/marketing/cta-section";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import { academies, getAcademy } from "@/content/academies";
import { courses } from "@/content/courses";

export function generateStaticParams() {
  return academies.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getAcademy(params.slug);
  if (!a) return buildMetadata({ title: "Academy" });
  return buildMetadata({
    title: a.name,
    path: `/academies/${a.slug}`,
    description: a.summary,
  });
}

export default function AcademyPage({ params }: { params: { slug: string } }) {
  const academy = getAcademy(params.slug);
  if (!academy) notFound();

  const related = courses.filter((c) => c.academy === academy.slug).slice(0, 3);

  return (
    <>
      <PageHero
        eyebrow={`${academy.name} · For ${academy.audience.toLowerCase()}`}
        title={academy.tagline}
        description={academy.summary}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Academies", href: "/academies" },
          { name: academy.name },
        ]}
      >
        <div className="flex flex-wrap gap-3">
          <Button href="/courses">Browse courses</Button>
          <Button href="/contact" variant="outline">
            Talk to us
          </Button>
        </div>
      </PageHero>

      {academy.slug === "digital" ? (
        <Section className="bg-muted">
          <Container>
            <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-8 sm:p-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="eyebrow">Free module</span>
                  <span className="rounded-full bg-forest px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-eyebrow text-primary-foreground">
                    Free
                  </span>
                </div>
                <h2 className="text-2xl font-semibold sm:text-3xl">
                  Clinical Competency Training Program
                </h2>
                <p className="mt-3 text-muted-foreground">
                  A free 22-module curriculum for new behaviour technicians and aspiring analysts,
                  aligned to International Behavior Therapist objectives and the BCBA Test Content
                  Outline. Read each module, then pass its knowledge check to earn a certificate.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="/clinical-training.html"
                    className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-forest-700"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden /> Start the free module
                  </a>
                  <a
                    href="/clinical-training.html"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-6 py-3 text-sm font-medium text-forest hover:bg-forest/5"
                  >
                    Open in new tab <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </a>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Companion resource:{" "}
                  <a
                    href="/clinical/visual-task-list.html"
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-forest hover:underline"
                  >
                    BCBA Visual Task List &amp; Training Guide
                  </a>.{" "}
                  A branded diagram for every one of the 104 tasks across the nine domains.
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  "21 self-paced modules",
                  "Knowledge checks at 80%",
                  "Certificate on completion",
                  "Scenario-based learning",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </Section>
      ) : null}

      <Section>
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Focus areas" title="What learners build" />
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {academy.focus.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading eyebrow="Delivery" title="How it's delivered" />
            <ul className="mt-6 space-y-3">
              {academy.delivery.map((d) => (
                <li
                  key={d}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium"
                >
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {related.length ? (
        <Section className="bg-muted">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow="Related courses" title={`From the ${academy.name}`} />
              <Button href={`/courses?academy=${academy.slug}`} variant="outline">
                View all
              </Button>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {related.map((c) => (
                <CourseCard key={c.slug} course={c} />
              ))}
            </div>
          </Container>
        </Section>
      ) : null}

      <Section className="py-10">
        <Container>
          <div className="flex flex-wrap justify-center gap-3">
            {academies
              .filter((a) => a.slug !== academy.slug)
              .map((a) => (
                <Link
                  key={a.slug}
                  href={`/academies/${a.slug}`}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-forest hover:text-forest"
                >
                  {a.name}
                </Link>
              ))}
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
