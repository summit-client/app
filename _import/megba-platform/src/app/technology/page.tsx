import {
  Languages,
  LayoutDashboard,
  GraduationCap,
  BarChart3,
  ShieldCheck,
  Bell,
  FileText,
  Palette,
  MessageSquare,
  CalendarClock,
  Accessibility,
  FileDown,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Technology Platform",
  path: "/technology",
  description:
    "MEGBA's multilingual learning platform, course delivery, dashboards, reporting, certificates, and white-label branding.",
});

const capabilities = [
  { icon: Languages, title: "Multilingual UI & content", body: "Translated interface, courses, and downloadable resources; translation-ready technician modules." },
  { icon: GraduationCap, title: "Courses & assessments", body: "Knowledge checks, assessments, certificates, and renewal pathways." },
  { icon: LayoutDashboard, title: "Dashboards", body: "Learner, supervisor, administrator, and organization dashboards with school-level reporting." },
  { icon: BarChart3, title: "Learning analytics", body: "Cohort management, completion tracking, and exportable reports." },
  { icon: Bell, title: "Automated reminders", body: "Time-zone-aware scheduling and nudges to keep learners on track." },
  { icon: Palette, title: "White-label branding", body: "Custom school subdomains, logos, colours, and branded certificates." },
  { icon: MessageSquare, title: "Secure messaging", body: "Learner communication and consultation booking in one place." },
  { icon: FileText, title: "Resource libraries", body: "Localized, downloadable resources organized by audience." },
  { icon: CalendarClock, title: "Consultation & booking", body: "Schedule consultations and live sessions across time zones." },
  { icon: ShieldCheck, title: "Privacy by design", body: "Role-based access, consent records, and audit logging." },
  { icon: Accessibility, title: "Accessibility controls", body: "Captioned video, transcripts, and adjustable text, contrast, and motion." },
  { icon: FileDown, title: "Billing & exports", body: "Invoice and subscription management, plus exportable reports." },
];

export default function TechnologyPage() {
  return (
    <>
      <PageHero
        eyebrow="Technology platform"
        title="One platform. Multiple languages. Global reach."
        description="MEGBA comes with its own software and learning infrastructure, bringing courses, resources, certificates, progress, consultation, and institutional reporting into one multilingual environment."
        crumbs={[{ name: "Home", href: "/" }, { name: "Technology" }]}
      >
        <div className="flex flex-wrap gap-3">
          <Button href="/request-demo">Book a demo</Button>
          <Button href="/technology/multilingual" variant="outline">
            Multilingual learning
          </Button>
        </div>
      </PageHero>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Platform capabilities"
            title="Everything an academy needs"
            description="Built for schools, organizations, and networks, from a single classroom to a multi-site partner."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-lg border border-border bg-card p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-forest">
                  <c.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-muted pt-0">
        <Container className="max-w-3xl">
          <Alert tone="note" title="Localization is reviewed, not just machine-translated">
            Machine-assisted translation is professionally reviewed before it is represented as
            formally localized clinical or educational content.
          </Alert>
        </Container>
      </Section>

      <CTASection
        eyebrow="See it live"
        title="Book a platform demo"
        primary={{ label: "Request a demo", href: "/request-demo" }}
        secondary={{ label: "Institutional licensing", href: "/services/institutional-licensing" }}
      />
    </>
  );
}
