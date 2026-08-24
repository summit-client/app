import { Container } from "@/components/ui/section";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";

export function PageHero({
  eyebrow,
  title,
  description,
  crumbs,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-ivory">
      <Container className="py-10 sm:py-12">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <div className="mt-4 max-w-3xl">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </Container>
    </div>
  );
}
