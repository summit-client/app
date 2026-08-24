"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccordionItem = { id: string; question: React.ReactNode; answer: React.ReactNode };

/** Accessible disclosure accordion (button + region, aria-expanded/controls). */
export function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className={cn("divide-y divide-border rounded-lg border border-border bg-card", className)}>
      {items.map((item) => {
        const isOpen = open === item.id;
        const panelId = `acc-panel-${item.id}`;
        const btnId = `acc-btn-${item.id}`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium hover:bg-forest/5"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={cn("h-5 w-5 shrink-0 transition-transform", isOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className="px-5 pb-5 text-muted-foreground"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
