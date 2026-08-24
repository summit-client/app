import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { DemoForm } from "@/components/forms/demo-form";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Request a Platform Demo",
  path: "/request-demo",
  description: "See the MEGBA multilingual learning platform in action.",
});

const highlights = [
  "Multilingual course delivery & translation-ready content",
  "Organization dashboards & school-level reporting",
  "Cohort management, certificates & automated reminders",
  "White-label branding & custom subdomains",
];

export default function RequestDemoPage() {
  return (
    <>
      <PageHero
        eyebrow="Platform demo"
        title="Book a platform demo"
        description="A guided walkthrough of the Digital Academy, tailored to how your organization would use it."
        crumbs={[{ name: "Home", href: "/" }, { name: "Request a Platform Demo" }]}
      />
      <Section>
        <Container className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <DemoForm />
          </div>
          <aside className="rounded-xl border border-border bg-forest p-6 text-primary-foreground">
            <h2 className="text-lg font-semibold">In the demo, you'll see</h2>
            <ul className="mt-4 space-y-3 text-sm text-primary-foreground/85">
              {highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-300" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          </aside>
        </Container>
      </Section>
    </>
  );
}
