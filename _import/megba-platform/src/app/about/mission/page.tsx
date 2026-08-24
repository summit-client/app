import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Stat } from "@/components/marketing/stat";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Our Global Mission",
  path: "/about/mission",
  description:
    "MEGBA's mission: building behaviour-informed schools, families, and communities around the world.",
});

const principles = [
  {
    title: "Capacity over dependency",
    body: "We build knowledge, systems, and skills that remain after any single engagement ends.",
  },
  {
    title: "Context over templates",
    body: "Every recommendation adapts to local culture, curriculum, resources, and requirements.",
  },
  {
    title: "Access over exclusivity",
    body: "Through grant-supported and sponsored pathways, we work to remove barriers to learning.",
  },
  {
    title: "Dignity over compliance",
    body: "Assent, least-restrictive practice, and neurodiversity-affirming values guide our work.",
  },
];

export default function MissionPage() {
  return (
    <>
      <PageHero
        eyebrow="Our global mission"
        title="Building behaviour-informed schools, families, and communities around the world"
        description="We believe practical behaviour science should cross borders, respectfully, accessibly, and in many languages."
        crumbs={[{ name: "Home", href: "/" }, { name: "About", href: "/about" }, { name: "Mission" }]}
      />

      <Section>
        <Container className="prose-reading">
          <p>
            Behaviour is universal; access to good behaviour science is not. MEGBA exists to close
            that gap, bringing evidence-informed, culturally responsive education and consultation to
            the schools, families, and professionals who need it, wherever they are.
          </p>
          <h2>What we are working toward</h2>
          <p>
            A world where every classroom is behaviour-informed, every caregiver has practical
            strategies, and every professional can keep learning, supported by a multilingual
            platform that meets people in their own language and context.
          </p>
        </Container>
      </Section>

      <Section className="bg-muted">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2">
            {principles.map((p) => (
              <div key={p.title} className="rounded-lg border border-border bg-background p-6">
                <h3 className="text-lg font-semibold text-forest">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 grid grid-cols-2 gap-8 rounded-2xl border border-border bg-background p-8 sm:grid-cols-4">
            <Stat value={10} suffix="+" label="Languages targeted" />
            <Stat value={5} label="Academies" />
            <Stat value={3} label="Regions engaged" />
            <Stat value={11} label="Audiences served" />
          </div>
        </Container>
      </Section>

      <CTASection eyebrow="Join the mission" />
    </>
  );
}
