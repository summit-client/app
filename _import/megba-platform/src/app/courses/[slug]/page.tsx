import { notFound } from "next/navigation";
import { Check, Clock, Globe2, GraduationCap, Layers } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { CourseCard } from "@/components/marketing/course-card";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, courseJsonLd } from "@/lib/seo";
import { courses, getCourse } from "@/content/courses";
import { languages } from "@/content/languages";

// Descriptors for the standard module arc (welcome → concepts → practice →
// application → data → wrap-up), revealed when a module is expanded.
const moduleBlurbs = [
  "How the course works, what you'll achieve, and how to get the most from your time.",
  "The foundational ideas, defined clearly and connected to everyday practice.",
  "Turning concepts into concrete strategies you can put to use immediately.",
  "Working through realistic scenarios to build confident, ethical decision-making.",
  "Simple, sustainable ways to collect data and monitor progress over time.",
  "Check your understanding and consolidate the key takeaways from the course.",
];

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getCourse(params.slug);
  if (!c) return buildMetadata({ title: "Course" });
  return buildMetadata({ title: c.title, path: `/courses/${c.slug}`, description: c.summary });
}

const langLabel = (code: string) => languages.find((l) => l.code === code)?.label ?? code;

export default function CoursePage({ params }: { params: { slug: string } }) {
  const course = getCourse(params.slug);
  if (!course) notFound();

  const price =
    course.price === "Free" ? "Free" : course.price === "Institutional" ? "Institutional" : `$${course.price}`;
  const showCert = course.certificate && course.verifiedStatus;
  const showCeu = course.ceu && course.verifiedStatus;

  const related = courses
    .filter((c) => c.academy === course.academy && c.slug !== course.slug)
    .slice(0, 3);

  const faqItems = [
    { id: "who", question: "Who is this course for?", answer: course.audience },
    { id: "pre", question: "Are there prerequisites?", answer: course.prerequisites },
    {
      id: "cert",
      question: "Does it include a certificate or CEUs?",
      answer: showCert || showCeu
        ? `This course offers ${[showCert && "a certificate of completion", showCeu && "CEUs"].filter(Boolean).join(" and ")}.`
        : "Certificate and CEU availability is confirmed for this course before it is shown as available.",
    },
    {
      id: "lang",
      question: "What languages is it available in?",
      answer: course.languages.map(langLabel).join(", "),
    },
  ];

  return (
    <>
      <JsonLd data={courseJsonLd(course)} />
      <PageHero
        eyebrow={`${course.topic} · ${course.level}`}
        title={course.title}
        description={course.summary}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Courses", href: "/courses" },
          { name: course.title },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {showCert ? <Badge tone="forest">Certificate</Badge> : null}
          {showCeu ? <Badge tone="forest">CEU</Badge> : null}
          {course.institutionalOnly ? <Badge tone="stone">Institutional access</Badge> : null}
        </div>
      </PageHero>

      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-10">
            <div>
              <SectionHeading eyebrow="Learning objectives" title="" className="mb-0" />
              <ul className="mt-6 space-y-2">
                {course.objectives.map((o) => (
                  <li key={o} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                    {o}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionHeading eyebrow="Modules" title="" className="mb-0" />
              <Accordion
                className="mt-6"
                items={course.modules.map((m, i) => ({
                  id: `mod-${i}`,
                  question: (
                    <span className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest/10 text-xs font-semibold text-forest">
                        {i + 1}
                      </span>
                      {m}
                    </span>
                  ),
                  answer: moduleBlurbs[i] ?? "A focused segment with practical examples and takeaways you can apply right away.",
                }))}
              />
            </div>

            <div>
              <SectionHeading eyebrow="FAQ" title="" className="mb-0" />
              <Accordion className="mt-6" items={faqItems} />
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-forest">{price}</span>
                <Badge tone="sage">{course.level}</Badge>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <Row icon={Clock} label="Duration" value={`${course.durationHours} hours`} />
                <Row icon={Layers} label="Delivery" value={course.delivery} />
                <Row icon={GraduationCap} label="Instructor" value={course.instructor} />
                <Row icon={Globe2} label="Languages" value={course.languages.map(langLabel).join(", ")} />
              </dl>
              <div className="mt-6 space-y-2">
                <Button href="/contact?topic=General enquiry" className="w-full">
                  Enrol / enquire
                </Button>
                <Button href="/request-proposal" variant="outline" className="w-full">
                  Institutional licensing
                </Button>
              </div>
            </div>
          </aside>
        </Container>
      </Section>

      {related.length ? (
        <Section className="bg-muted">
          <Container>
            <SectionHeading eyebrow="Related courses" title="You might also like" />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {related.map((c) => (
                <CourseCard key={c.slug} course={c} />
              ))}
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
