import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Accordion } from "@/components/ui/accordion";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, faqJsonLd } from "@/lib/seo";
import { faqs, faqCategories } from "@/content/misc";

export const metadata = buildMetadata({
  title: "FAQ",
  path: "/faq",
  description: "Frequently asked questions about MEGBA's services, credentials, platform, and privacy.",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(faqs.map((f) => ({ q: f.q, a: f.a })))} />
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Answers about our services, credentials, platform, and privacy. Can't find what you need? Just ask."
        crumbs={[{ name: "Home", href: "/" }, { name: "FAQ" }]}
      />
      <Section>
        <Container className="max-w-3xl space-y-10">
          {faqCategories.map((cat) => (
            <div key={cat}>
              <h2 className="mb-4 text-xl font-semibold">{cat}</h2>
              <Accordion
                items={faqs
                  .filter((f) => f.category === cat)
                  .map((f, i) => ({ id: `${cat}-${i}`, question: f.q, answer: f.a }))}
              />
            </div>
          ))}
        </Container>
      </Section>
      <CTASection eyebrow="Still have questions?" title="We're happy to help" primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "Book a consultation", href: "/book-consultation" }} />
    </>
  );
}
