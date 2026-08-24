"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-medium text-primary-foreground hover:bg-forest-700"
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
