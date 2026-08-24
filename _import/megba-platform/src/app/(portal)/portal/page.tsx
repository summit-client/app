import Link from "next/link";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";
import { portals } from "@/content/portals";

export const metadata = buildMetadata({
  title: "Portal",
  path: "/portal",
  description: "Role-based portals for learners, schools, supervisors, consultants, and admins.",
  noindex: true,
});

export default function PortalHome() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/85 px-4 backdrop-blur sm:px-6">
        <Link href="/" aria-label="Mount Etna, home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-megba.svg" alt="Mount Etna Global Behaviour Academy" className="h-9 w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-forest"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Back to site
        </Link>
      </header>

      <main className="container py-12 sm:py-16">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">Portal</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">Choose your portal</h1>
          <p className="mt-3 text-muted-foreground">
            Preview the role-based portals. In production, you land here after signing in and see
            only the portals your role permits.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {portals.map((p) => (
            <Link
              key={p.slug}
              href={`/portal/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sage-100 text-forest">
                  <p.icon className="h-5 w-5" aria-hidden />
                </span>
                <Badge tone="stone">{p.role}</Badge>
              </div>
              <h2 className="mt-4 text-lg font-semibold group-hover:text-forest">{p.name}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.summary}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                Open portal
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12">
          <p className="eyebrow mb-3">Tools</p>
          <Link
            href="/portal/studio"
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:flex-row sm:items-center sm:gap-6"
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest text-primary-foreground">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <div className="mt-4 flex-1 sm:mt-0">
              <h2 className="text-lg font-semibold group-hover:text-forest">
                AI Content &amp; Video Studio
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Turn a voice or written brief into storyboards, voiceovers, captions, and short-form
                video. Draft, review, and approve, nothing publishes on its own.
              </p>
            </div>
            <ArrowRight
              className="mt-4 h-5 w-5 text-forest transition-transform group-hover:translate-x-0.5 sm:mt-0"
              aria-hidden
            />
          </Link>
        </div>
      </main>
    </div>
  );
}
