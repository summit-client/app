import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FormSuccess({
  title = "Thank you, we've received your request",
  body = "A member of the MEGBA team will be in touch shortly. A confirmation has been sent to your email.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="rounded-lg border border-forest/20 bg-forest-50 p-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-forest" aria-hidden />
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{body}</p>
      <div className="mt-6">
        <Button href="/" variant="outline">
          Back to home
        </Button>
      </div>
    </div>
  );
}
