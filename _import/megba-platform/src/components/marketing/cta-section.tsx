import { Container, Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export function CTASection({
  eyebrow = "Partner pathways",
  title = "Let's build behaviour-informed schools, families, and communities.",
  description = "Whether you're a school, organization, professional, or family, there's a pathway into MEGBA. Tell us your context and we'll shape a plan around it.",
  primary = { label: "Partner With MEGBA", href: "/partners/become-a-partner" },
  secondary = { label: "Request a Consultation", href: "/book-consultation" },
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <Section className="pb-8">
      <Container>
        <div className="overflow-hidden rounded-lg bg-forest px-6 py-10 text-center text-primary-foreground sm:px-12">
          <div className="mx-auto max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-eyebrow text-sage-300">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">{title}</h2>
            <p className="mt-4 text-primary-foreground/80">{description}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href={primary.href} variant="accent" size="lg">
                {primary.label}
              </Button>
              <Button
                href={secondary.href}
                size="lg"
                className="border border-white/30 bg-transparent text-primary-foreground hover:bg-white/10"
              >
                {secondary.label}
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
