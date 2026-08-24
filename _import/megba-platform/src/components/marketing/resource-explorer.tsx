"use client";

import * as React from "react";
import { Download, FileText, ArrowUpRight, Globe2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resources, type ResourceItem } from "@/content/misc";
import { languages } from "@/content/languages";
import { org } from "@/content/site";

const langNames = (codes: string[]) =>
  codes.map((c) => languages.find((l) => l.code === c)?.label ?? c).join(", ");

export function ResourceExplorer() {
  const [active, setActive] = React.useState<ResourceItem | null>(null);

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((r) => (
          <button
            key={r.title}
            type="button"
            onClick={() => setActive(r)}
            className="group flex flex-col rounded-lg border border-border bg-card p-4 text-left shadow-card transition-colors duration-150 hover:border-forest/40"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sage-100 text-forest transition-colors group-hover:bg-forest group-hover:text-primary-foreground">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <Badge tone="sage">{r.type}</Badge>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{r.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">For {r.audience}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-forest">
              View details
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <Sheet
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.title ?? ""}
        description={active ? `${active.type} · For ${active.audience}` : undefined}
        footer={
          active ? (
            <div className="flex flex-col gap-2">
              <Button
                href={`mailto:${org.email}?subject=${encodeURIComponent(`Resource request: ${active.title}`)}`}
                className="w-full"
              >
                <Download className="h-4 w-4" aria-hidden />
                Request this resource
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Downloads are provisioned per partner in the platform.
              </p>
            </div>
          ) : null
        }
      >
        {active ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="text-sm text-muted-foreground">
                A practical, ready-to-use {active.type.toLowerCase()} for {active.audience.toLowerCase()},
                designed to translate behaviour science into everyday practice.
              </p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Format</dt>
                <dd className="font-medium">{active.type}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Audience</dt>
                <dd className="font-medium">{active.audience}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe2 className="h-4 w-4" aria-hidden /> Languages
                </dt>
                <dd className="text-right font-medium">{langNames(active.languages)}</dd>
              </div>
            </dl>
            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              Localized versions are professionally reviewed before release. Partners can access the
              full resource library from the learner and school portals.
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
