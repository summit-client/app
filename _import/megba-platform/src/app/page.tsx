import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Users,
  MonitorSmartphone,
  Video,
  MapPin,
  Presentation,
  Languages,
  ShieldCheck,
  GraduationCap,
  HeartHandshake,
  Sparkles,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/marketing/stat";
import { CourseCard } from "@/components/marketing/course-card";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo";
import { audiences, credibilityStrip } from "@/content/site";
import { academies } from "@/content/academies";
import { credentials, frameworks, memberships, recognition } from "@/content/credentials";
import { courses } from "@/content/courses";
import { insights } from "@/content/misc";
import { enabledLanguages } from "@/content/languages";
import { formatDate } from "@/lib/utils";

export const metadata = buildMetadata({
  path: "/",
  description:
    "Mount Etna Global Behaviour Academy equips schools, educators, families, technicians, and professionals with practical behaviour-science education, consultation, and multilingual digital tools.",
});

const modalities = [
  { icon: Video, label: "Live virtual workshops" },
  { icon: MapPin, label: "On-site professional development" },
  { icon: MonitorSmartphone, label: "Self-paced online courses" },
  { icon: Presentation, label: "Cohort & train-the-trainer" },
  { icon: HeartHandshake, label: "Coaching & implementation" },
  { icon: Building2, label: "Institutional licensing" },
];

const featured = courses.slice(0, 3);

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Mount Etna Global Behaviour Academy",
          url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        }}
      />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="topo-lines relative overflow-hidden border-b border-border">
        <Container className="relative py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="sage" className="mb-6">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> International behaviour-science academy
            </Badge>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Behaviour Science <span className="text-maple">Without Borders.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Mount Etna Global Behaviour Academy helps schools, educators, families, technicians,
              and professionals build practical behaviour-science knowledge through international
              consultation, professional training, parent coaching, and multilingual digital
              learning, grounded in Canadian standards of practice, shared internationally.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/partners/become-a-partner" size="lg">
                Partner With MEGBA
              </Button>
              <Button href="/academies" variant="outline" size="lg">
                Explore the Academies
              </Button>
            </div>
            <div className="mt-4 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row">
              <Link href="/book-consultation" className="font-medium text-forest hover:underline">
                Request a School Consultation
              </Link>
              <span className="hidden text-border sm:inline">•</span>
              <Link href="/request-demo" className="font-medium text-forest hover:underline">
                Book a Platform Demo
              </Link>
            </div>
          </div>
        </Container>

        {/* Credibility strip */}
        <div className="border-t border-border bg-card/60">
          <Container className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 text-sm text-muted-foreground">
            {credibilityStrip.map((item, i) => (
              <span key={item} className="flex items-center gap-2">
                {i > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-maple" aria-hidden /> : null}
                {item}
              </span>
            ))}
          </Container>
        </div>
      </section>

      {/* ----------------------------------------------------------- Who we serve */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Who we serve"
            title="One academy, many communities"
            description="From international schools to individual families, MEGBA meets each audience where they are."
          />
          <ul className="mt-10 flex flex-wrap gap-2.5">
            {audiences.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-charcoal/90 transition-colors hover:border-forest hover:text-forest"
                >
                  {a.label}
                  <ArrowRight className="h-3.5 w-3.5 text-sage-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* --------------------------------------------------------- Five academies */}
      <Section className="bg-muted">
        <Container>
          <SectionHeading
            eyebrow="Our five academies"
            title="Behaviour science, made practical"
            description="Five academies share one multilingual platform, from classroom lessons to professional continuing education."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {academies.map((a) => (
              <Link
                key={a.slug}
                href={`/academies/${a.slug}`}
                className="group flex flex-col rounded-lg border border-border bg-background p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                    a.accent === "ember"
                      ? "bg-ember/10 text-ember"
                      : a.accent === "sage"
                        ? "bg-sage-100 text-forest"
                        : "bg-forest/10 text-forest"
                  }`}
                >
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-xl font-semibold group-hover:text-forest">{a.name}</h3>
                <p className="mt-1 text-sm font-medium text-ember">{a.tagline}</p>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{a.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                  Explore {a.name}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
            <Link
              href="/academies"
              className="flex flex-col items-start justify-center rounded-lg border border-dashed border-forest/40 bg-forest/5 p-6 text-forest transition-colors hover:bg-forest/10"
            >
              <span className="text-lg font-semibold">See all academies</span>
              <span className="mt-1 text-sm text-forest/80">Compare focus areas and delivery.</span>
              <ArrowRight className="mt-4 h-5 w-5" aria-hidden />
            </Link>
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------- School partnerships */}
      <Section>
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">School partnership solutions</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Build Behaviour-Informed Schools</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              MEGBA works with educational partners to strengthen staff capacity, classroom systems,
              family collaboration, and student support. Our consultants bring a Canadian
              behaviour-science perspective, shared internationally, while adapting recommendations to each school&apos;s
              culture, curriculum, resources, and local requirements.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "School-wide behaviour-support consultation & MTSS",
                "Teacher & staff training with post-workshop coaching",
                "Institutional licensing, white-label portals & custom curriculum",
                "Remote consultation across time zones; on-site for contracted partners",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/request-proposal">Request a School Proposal</Button>
              <Button href="/services/school-partnerships" variant="outline">
                Explore partnerships
              </Button>
            </div>
          </div>
          <Card className="bg-forest p-8 text-primary-foreground">
            <p className="text-sm font-medium uppercase tracking-eyebrow text-sage-300">
              Engagement models
            </p>
            <div className="mt-6 grid grid-cols-2 gap-6">
              {[
                "Annual institutional licensing",
                "Per-school & per-seat access",
                "Consulting retainers",
                "Live cohort delivery",
                "White-label academy portals",
                "Train-the-trainer licensing",
                "Grant-supported access",
                "Custom curriculum development",
              ].map((m) => (
                <div key={m} className="text-sm text-primary-foreground/85">
                  {m}
                </div>
              ))}
            </div>
          </Card>
        </Container>
      </Section>

      {/* ------------------------------------------------------- Credentials band */}
      <Section className="bg-forest-900 text-primary-foreground">
        <Container>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-eyebrow text-sage-300">
              Professional credentials
            </p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Credentialed, clinically informed expertise
            </h2>
            <p className="mt-4 text-primary-foreground/75">
              Our team includes professionals holding distinct credentials. We present each one
              accurately and display only credentials we have formally verified.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {credentials.map((c) => (
              <div key={c.abbr} className="rounded-lg border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{c.abbr}</span>
                  {c.verifiedOn ? (
                    <Badge tone="sage" className="text-[0.65rem]">
                      Verified
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-primary-foreground/70">{c.name}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {frameworks.slice(0, 10).map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-primary-foreground/80"
              >
                {f}
              </span>
            ))}
            <Link
              href="/about/credentials"
              className="rounded-full bg-ember px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-ember-600"
            >
              See all expertise →
            </Link>
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------- Memberships */}
      <Section className="py-14">
        <Container>
          <div className="flex flex-col gap-8 rounded-2xl border border-border bg-card p-8 lg:flex-row lg:items-center">
            <div className="lg:w-1/2">
              <p className="eyebrow mb-3">Memberships &amp; recognition</p>
              <h2 className="text-2xl font-semibold sm:text-3xl">
                Aligned with international best practice
              </h2>
              <ul className="mt-5 space-y-2.5">
                {recognition.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-maple" aria-hidden />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:w-1/2">
              {memberships.map((m) => (
                <div key={m.abbr} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-forest">{m.abbr}</span>
                    <Badge tone="sage">{m.relationship}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{m.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{m.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* ------------------------------------------------------ Training modalities */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Training modalities"
            title="Meet learners where they are"
            description="Delivery adapts to your team, timezone, and budget, virtual, on-site, self-paced, or blended."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modalities.map((m) => (
              <div
                key={m.label}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-5"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-forest">
                  <m.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-medium">{m.label}</span>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* ------------------------------------------------------------- Technology */}
      <Section className="bg-muted">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Multilingual technology</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              One Platform. Multiple Languages. Global Reach.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Our Digital Academy brings courses, resources, certificates, learner progress,
              consultation, and institutional reporting into one multilingual environment. Schools
              and organizations can enrol learners, assign training, track completion, and access
              customized resources from anywhere.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {enabledLanguages().map((l) => (
                <span
                  key={l.code}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-sm"
                >
                  <Languages className="h-3.5 w-3.5 text-sage-500" aria-hidden />
                  {l.nativeLabel}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/technology">Explore the platform</Button>
              <Button href="/request-demo" variant="outline">
                Book a demo
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 rounded-2xl border border-border bg-background p-8">
            <Stat value={10} suffix="+" label="Platform languages" />
            <Stat value={5} label="Specialized academies" />
            <Stat value={16} label="Sample courses ready" />
            <Stat value={6} label="Role-based portals" />
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------- Where we practise */}
      <Section>
        <Container>
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-card sm:p-12">
            <p className="eyebrow mb-3">Where we practise</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Currently serving Ontario, Canada</h2>
            <p className="mt-5 text-lg text-muted-foreground">
              We deliver Canadian standards of behaviour-science practice, shared internationally,
              expanding to Bulgaria in 2027. We offer virtual services worldwide, along with
              in-person field visits.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Badge tone="forest">Ontario, Canada</Badge>
              <Badge tone="sage">Bulgaria · 2027</Badge>
              <Badge tone="sage">Virtual worldwide</Badge>
              <Badge tone="sage">In-person field visits</Badge>
            </div>
          </div>
        </Container>
      </Section>

      {/* -------------------------------------------------------- Featured courses */}
      <Section className="bg-muted">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Featured courses"
              title="Start learning today"
              description="A selection of courses from across the academies."
            />
            <Button href="/courses" variant="outline">
              View full catalogue
            </Button>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {featured.map((c) => (
              <CourseCard key={c.slug} course={c} />
            ))}
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------------- Why MEGBA */}
      <Section>
        <Container>
          <SectionHeading eyebrow="Why MEGBA" title="Practical, evidence-informed, and respectful" align="center" />
          <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: "Capacity-building, not dependency",
                body: "We build the knowledge, systems, and skills that stay after the consultation ends.",
              },
              {
                icon: HeartHandshake,
                title: "Context-sensitive by design",
                body: "Recommendations adapt to your culture, curriculum, resources, and local requirements.",
              },
              {
                icon: ShieldCheck,
                title: "Ethical & neurodiversity-aware",
                body: "Dignity, assent, and least-restrictive practice guide everything we teach.",
              },
            ].map((v) => (
              <div key={v.title} className="rounded-lg border border-border bg-card p-6 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest">
                  <v.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------- Latest insights */}
      <Section>
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Latest insights" title="Ideas from the field" />
            <Button href="/insights" variant="outline">
              All articles
            </Button>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {insights.map((a) => (
              <Link
                key={a.slug}
                href={`/insights/${a.slug}`}
                className="group flex flex-col rounded-lg border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone="sage">{a.category}</Badge>
                  <span>{a.readMinutes} min read</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold group-hover:text-forest">{a.title}</h3>
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
