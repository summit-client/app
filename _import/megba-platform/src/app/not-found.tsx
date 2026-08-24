import { Container, Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Section>
      <Container className="max-w-xl text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-3 text-4xl font-semibold">This page can&apos;t be found</h1>
        <p className="mt-4 text-muted-foreground">
          The page you&apos;re looking for may have moved. Explore the academies or head back home.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/">Return home</Button>
          <Button href="/academies" variant="outline">
            Explore the academies
          </Button>
          <Button href="/courses" variant="ghost">
            Browse courses
          </Button>
        </div>
      </Container>
    </Section>
  );
}
