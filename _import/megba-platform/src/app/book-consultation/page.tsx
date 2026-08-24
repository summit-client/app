import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/alert";
import { ConsultationForm } from "@/components/forms/consultation-form";
import { buildMetadata } from "@/lib/seo";
import { careDisclaimer } from "@/content/site";

export const metadata = buildMetadata({
  title: "Book a Consultation",
  path: "/book-consultation",
  description: "Request a behaviour-support consultation for your school or organization.",
});

export default function BookConsultationPage() {
  return (
    <>
      <PageHero
        eyebrow="Book a consultation"
        title="Request a school consultation"
        description="Share your context and we'll arrange a conversation with a MEGBA consultant."
        crumbs={[{ name: "Home", href: "/" }, { name: "Book a Consultation" }]}
      />
      <Section>
        <Container className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <ConsultationForm />
          </div>
          <aside className="space-y-4">
            <Alert tone="note" title="Educational & collaborative">
              {careDisclaimer}
            </Alert>
            <div className="rounded-xl border border-border bg-card p-6 text-sm">
              <h2 className="font-semibold">What to expect</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>We review your request and reply by email.</li>
                <li>A short discovery call to understand your context.</li>
                <li>A tailored recommendation and next steps.</li>
              </ol>
            </div>
          </aside>
        </Container>
      </Section>
    </>
  );
}
