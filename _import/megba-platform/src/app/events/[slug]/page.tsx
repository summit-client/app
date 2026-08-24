import { notFound } from "next/navigation";
import { CalendarDays, Clock, Users, Globe2 } from "lucide-react";
import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, eventJsonLd } from "@/lib/seo";
import { events } from "@/content/misc";
import { languages } from "@/content/languages";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return events.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const e = events.find((x) => x.slug === params.slug);
  if (!e) return buildMetadata({ title: "Event" });
  return buildMetadata({ title: e.title, path: `/events/${e.slug}`, description: e.summary });
}

export default function EventPage({ params }: { params: { slug: string } }) {
  const event = events.find((e) => e.slug === params.slug);
  if (!event) notFound();

  const langs = event.languages.map((c) => languages.find((l) => l.code === c)?.label ?? c).join(", ");

  return (
    <>
      <JsonLd data={eventJsonLd(event)} />
      <PageHero
        eyebrow={event.type}
        title={event.title}
        description={event.summary}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Events", href: "/events" },
          { name: event.title },
        ]}
      />
      <Section>
        <Container className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="prose-reading !max-w-none">
            <p>
              This session brings MEGBA&apos;s practical, behaviour-informed approach to a live
              audience. You&apos;ll leave with strategies you can use right away, plus space for
              questions with our team.
            </p>
            <p>
              The full agenda and joining details are confirmed closer to the date. Register your
              interest below and we&apos;ll send you everything you need to attend.
            </p>
          </div>
          <aside className="rounded-xl border border-border bg-card p-6">
            <dl className="space-y-3 text-sm">
              <Row icon={CalendarDays} label="Date" value={formatDate(event.date)} />
              <Row icon={Clock} label="Time" value={event.time} />
              <Row icon={Users} label="Audience" value={event.audience} />
              <Row icon={Globe2} label="Languages" value={langs} />
            </dl>
            <Button href="/contact?topic=General enquiry" className="mt-6 w-full">
              Register interest
            </Button>
          </aside>
        </Container>
      </Section>
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
