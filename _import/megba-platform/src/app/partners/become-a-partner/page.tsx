import { Container, Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Become a Partner",
  path: "/partners/become-a-partner",
  description:
    "Partner with MEGBA, schools, universities, nonprofits, government, clinics, and community organizations.",
});

const partnerTypes = [
  "Partner schools",
  "Universities",
  "Therapy centres",
  "NGOs & nonprofits",
  "Ministries of Education",
  "Inclusive-education providers",
  "IB & curriculum schools",
  "Government & community agencies",
  "Clinics & behaviour-service organizations",
  "Early-learning centres",
  "Homeschool & microschool programs",
];

/** Current availability (honest positioning). */
const availability = [
  "Currently serving Ontario, Canada",
  "Expanding to Bulgaria in 2027",
  "Virtual services worldwide, plus in-person field visits",
];

/** What partners engage MEGBA for. */
const engagements = [
  "Behaviour-analytic consultation",
  "Educator training",
  "Parent coaching",
  "Organizational capacity building",
  "Internationally oriented behaviour-analysis education",
];

const models = [
  "Annual institutional licensing",
  "Per-school licensing",
  "Per-student & per-family access",
  "Staff training packages",
  "Consulting retainers",
  "Live cohort delivery",
  "White-label academy portals",
  "Grant-supported delivery",
  "Sponsored community access",
  "Train-the-trainer licensing",
  "Custom curriculum development",
];

const pathways = [
  { title: "Schools", body: "Consultation, training, licensing, and white-label portals.", cta: { label: "Request a proposal", href: "/request-proposal" } },
  { title: "Organizations & NGOs", body: "Training packages, grant-supported and sponsored access.", cta: { label: "Contact partnerships", href: "/contact?topic=School partnership" } },
  { title: "Regional partners", body: "Represent MEGBA and co-deliver in your region.", cta: { label: "Explore regions", href: "/partners/regions" } },
];

export default function BecomePartnerPage() {
  return (
    <>
      <PageHero
        eyebrow="Partner with MEGBA"
        title="Let's build behaviour-informed communities together"
        description="MEGBA partners with schools, organizations, and regional collaborators through flexible, context-sensitive engagement models."
        crumbs={[{ name: "Home", href: "/" }, { name: "Become a Partner" }]}
      >
        <Button href="/request-proposal">Request a school proposal</Button>
      </PageHero>

      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            {pathways.map((p) => (
              <div key={p.title} className="flex flex-col rounded-xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold">{p.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.body}</p>
                <Button href={p.cta.href} variant="outline" className="mt-4 self-start">
                  {p.cta.label}
                </Button>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Who we partner with" title="" className="mb-0" />
            <ul className="mt-6 flex flex-wrap gap-2">
              {partnerTypes.map((t) => (
                <li key={t}>
                  <span className="inline-block rounded-full border border-border bg-background px-3.5 py-1.5 text-sm">
                    {t}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading eyebrow="Engagement models" title="" className="mb-0" />
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {models.map((m) => (
                <li key={m} className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <div className="overflow-hidden rounded-2xl border border-border bg-forest text-primary-foreground">
            <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-sage-300">
                  Availability
                </p>
                <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
                  Serving Ontario now, expanding to Bulgaria in 2027
                </h2>
                <p className="mt-3 text-primary-foreground/80">
                  We currently serve Ontario, Canada, and welcome partner schools, universities,
                  therapy centres, NGOs, ministries of education, and inclusive-education providers
                  exploring training, consultation, and partnership in Bulgaria and worldwide.
                </p>
                <ul className="mt-5 space-y-2">
                  {availability.map((a) => (
                    <li
                      key={a}
                      className="flex items-start gap-2.5 text-sm text-primary-foreground/90"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-maple" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white/5 p-6">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-sage-300">
                  Engage MEGBA for
                </p>
                <ul className="mt-4 space-y-3">
                  {engagements.map((e) => (
                    <li key={e} className="flex items-start gap-2.5 text-sm text-primary-foreground/90">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-maple" aria-hidden />
                      {e}
                    </li>
                  ))}
                </ul>
                <Button href="/request-proposal" variant="accent" className="mt-6">
                  Enrol your organization
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-2xl text-center">
          <h2 className="text-3xl font-semibold">Ready to explore a partnership?</h2>
          <p className="mt-3 text-muted-foreground">
            Tell us about your context and we&apos;ll tailor the right model for you.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button href="/request-proposal">Request a school proposal</Button>
            <Button href="/contact" variant="outline">
              Contact us
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
