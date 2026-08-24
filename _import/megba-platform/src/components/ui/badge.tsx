import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "forest" | "sage" | "ember" | "stone" | "outline";

const tones: Record<Tone, string> = {
  forest: "bg-forest text-primary-foreground",
  sage: "bg-sage-100 text-forest-900",
  ember: "bg-ember-600 text-accent-foreground",
  stone: "bg-muted text-muted-foreground",
  outline: "border border-border text-foreground",
};

export function Badge({
  tone = "stone",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
