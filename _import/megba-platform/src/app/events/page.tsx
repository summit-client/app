import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";
import { events } from "@/content/misc";
import { formatDate } from "@/lib/utils";

export const metadata = buildMetadata({
  title: "Events & Webinars",
  path: "/events",
  description: "Upcoming MEGBA webinars, workshops, and info sessions.",
});

export default function EventsPage() {
  return (
    <>
      <PageHero
        eyebrow="Events & webinars"
        title="Learn with us, live"
        description="Join upcoming webinars, workshops, and info sessions from across the academies."
        crumbs={[{ name: "Home", href: "/" }, { name: "Events" }]}
      />
      <Section>
        <Container>
          <ul className="space-y-4">
            {events.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/events/${e.slug}`}
                  className="group grid gap-4 rounded-xl border border-border bg-card p-6 transition-all hover:border-forest hover:shadow-lift sm:grid-cols-[auto_1fr_auto] sm:items-center"
                >
                  <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-forest/10 text-forest">
                    <CalendarDays className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="sage">{e.type}</Badge>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold group-hover:text-forest">{e.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(e.date)} · {e.time} · {e.audience}
                    </p>
                  </div>
                  <ArrowRight
                    className="hidden h-5 w-5 text-forest transition-transform group-hover:translate-x-1 sm:block"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
      <CTASection eyebrow="Stay in the loop" title="Want event invitations?" primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "Browse courses", href: "/courses" }} />
    </>
  );
}
