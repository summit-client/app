import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { SchoolProposalForm } from "@/components/forms/school-proposal-form";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Request a School Proposal",
  path: "/request-proposal",
  description:
    "Tell us about your school and we'll prepare a tailored behaviour-science partnership proposal.",
});

export default function RequestProposalPage() {
  return (
    <>
      <PageHero
        eyebrow="For schools & organizations"
        title="Request a school proposal"
        description="A few details help us tailor the right partnership, licensing, and training plan for your context. Only the starred fields are required."
        crumbs={[{ name: "Home", href: "/" }, { name: "Request a School Proposal" }]}
      />
      <Section>
        <Container className="max-w-3xl">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <SchoolProposalForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
