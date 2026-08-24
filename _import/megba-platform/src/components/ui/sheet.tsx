"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible slide-over (desktop) / bottom-sheet (mobile).
 *
 * - Right-side panel ≥ sm; bottom sheet on mobile.
 * - Enter/exit transitions (~260ms) with reduced-motion fallback.
 * - Escape to close, backdrop click to close, body scroll lock, focus moves in.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Mount → next frame → animate in. On close, animate out then unmount.
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  const titleId = "sheet-title";

  return (
    <div className="fixed inset-0 z-[80]" aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-charcoal/40 transition-opacity duration-200 motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Panel */}
      <div className="absolute inset-0 flex items-end justify-center sm:items-stretch sm:justify-end">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-lift outline-none transition-transform duration-[260ms] ease-out motion-reduce:transition-none",
            "sm:max-h-none sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl",
            visible ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full",
          )}
        >
          {/* Grabber (mobile affordance) */}
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-4 sm:pt-6">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
