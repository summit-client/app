import { Mail } from "lucide-react";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { ContactForm } from "@/components/forms/contact-form";
import { buildMetadata } from "@/lib/seo";
import { org } from "@/content/site";

export const metadata = buildMetadata({
  title: "Contact",
  path: "/contact",
  description: "Get in touch with Mount Etna Global Behaviour Academy.",
});

export default function ContactPage({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Let's talk"
        description="Tell us about your school, family, or organization and we'll point you to the right pathway."
        crumbs={[{ name: "Home", href: "/" }, { name: "Contact" }]}
      />
      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <ContactForm defaultTopic={searchParams.topic} />
          </div>
          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">Direct email</h2>
              <a
                href={`mailto:${org.email}`}
                className="mt-2 inline-flex items-center gap-2 text-forest hover:underline"
              >
                <Mail className="h-4 w-4" aria-hidden />
                {org.email}
              </a>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <h2 className="text-lg font-semibold text-foreground">Prefer a specific path?</h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href="/request-proposal" className="text-forest hover:underline">
                    Request a school proposal →
                  </a>
                </li>
                <li>
                  <a href="/book-consultation" className="text-forest hover:underline">
                    Book a consultation →
                  </a>
                </li>
                <li>
                  <a href="/request-demo" className="text-forest hover:underline">
                    Book a platform demo →
                  </a>
                </li>
              </ul>
            </div>
          </aside>
        </Container>
      </Section>
    </>
  );
}
