"use client";

import * as React from "react";
import { z } from "zod";
import { useToast } from "@/components/ui/toast";

type State = "idle" | "submitting" | "success";

/** Reads UTM params from the current URL for lead-source tracking. */
function readTracking(defaultSource: string) {
  if (typeof window === "undefined") return { source: defaultSource };
  const p = new URLSearchParams(window.location.search);
  return {
    source: p.get("utm_campaign") ? "campaign" : defaultSource,
    utm_source: p.get("utm_source") ?? undefined,
    utm_medium: p.get("utm_medium") ?? undefined,
    utm_campaign: p.get("utm_campaign") ?? undefined,
  };
}

export function useLeadSubmit<S extends z.ZodTypeAny>(schema: S, defaultSource: string) {
  const { toast } = useToast();
  const [state, setState] = React.useState<State>("idle");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const summaryRef = React.useRef<HTMLDivElement>(null);

  const submit = React.useCallback(
    async (raw: Record<string, unknown>) => {
      setErrors({});
      const payload = { ...raw, ...readTracking(defaultSource) };
      const parsed = schema.safeParse(payload);

      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        setErrors(fieldErrors);
        // Move focus to the error summary for screen readers.
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }

      setState("submitting");
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) throw new Error("Request failed");
        setState("success");
        toast({ tone: "success", title: "Message sent", description: "We'll be in touch soon." });
      } catch {
        setState("idle");
        toast({
          tone: "error",
          title: "Something went wrong",
          description: "Please try again, or email us directly.",
        });
      }
    },
    [schema, defaultSource, toast],
  );

  return { state, errors, submit, summaryRef };
}
