import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { academies } from "@/content/academies";

export const metadata = buildMetadata({
  title: "Academies",
  path: "/academies",
  description:
    "Five academies, Student, Parent, Teacher, Clinical, and Digital, share one multilingual platform.",
});

export default function AcademiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Our academies"
        title="Five academies, one platform"
        description="Each academy is designed for a distinct audience, yet they share the same multilingual infrastructure, standards, and values."
        crumbs={[{ name: "Home", href: "/" }, { name: "Academies" }]}
      />
      <Section>
        <Container>
          <div className="space-y-6">
            {academies.map((a, i) => (
              <Link
                key={a.slug}
                href={`/academies/${a.slug}`}
                className="group grid gap-6 rounded-xl border border-border bg-card p-6 transition-all hover:border-forest hover:shadow-lift sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-semibold ${
                    a.accent === "ember"
                      ? "bg-ember/10 text-ember"
                      : a.accent === "sage"
                        ? "bg-sage-100 text-forest"
                        : "bg-forest/10 text-forest"
                  }`}
                >
                  0{i + 1}
                </span>
                <div>
                  <h2 className="text-2xl font-semibold group-hover:text-forest">{a.name}</h2>
                  <p className="text-sm font-medium text-ember">{a.tagline}</p>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{a.summary}</p>
                  <p className="mt-2 text-xs uppercase tracking-eyebrow text-muted-foreground">
                    For: {a.audience}
                  </p>
                </div>
                <ArrowRight
                  className="hidden h-6 w-6 text-forest transition-transform group-hover:translate-x-1 lg:block"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
