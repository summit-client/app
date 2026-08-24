"use client";

import { useEffect } from "react";
import { Container, Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire to your error-reporting service here.
    console.error(error);
  }, [error]);

  return (
    <Section>
      <Container className="max-w-xl text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-semibold">We hit an unexpected error</h1>
        <p className="mt-4 text-muted-foreground">
          Please try again. If the problem persists, contact us and we&apos;ll help.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button href="/" variant="outline">
            Return home
          </Button>
        </div>
      </Container>
    </Section>
  );
}
