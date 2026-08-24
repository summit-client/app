import { Container, Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Section>
      <Container>
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </Container>
    </Section>
  );
}
