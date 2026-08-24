"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Plus, Sparkles, CornerDownLeft } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { quickCreate, aiActions, type NavEntry } from "@/content/portal-admin";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  group: "Navigate" | "Create" | "AI actions";
  hint?: string;
  run: () => void;
};

/**
 * Global command palette (Cmd/Ctrl-K). Navigate, create, or trigger AI actions.
 * Create/AI items are clearly prototype actions in this preview (they confirm
 * via toast) and connect to live data in Phase 2.
 */
export function CommandPalette({
  open,
  onClose,
  navEntries = [],
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  navEntries?: NavEntry[];
  onNavigate?: (label: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const items = React.useMemo<Item[]>(() => {
    const nav = navEntries.map((n) => ({
      id: `nav-${n.label}`,
      label: n.label,
      group: "Navigate" as const,
      run: () => {
        if (onNavigate) onNavigate(n.label);
        else router.push(n.href);
      },
    }));
    const create = quickCreate.map((c) => ({
      id: `new-${c}`,
      label: c,
      group: "Create" as const,
      run: () => toast({ tone: "success", title: `${c}`, description: "Preview action, connects to live data in Phase 2." }),
    }));
    const ai = aiActions.map((a) => ({
      id: `ai-${a}`,
      label: a,
      group: "AI actions" as const,
      hint: "AI",
      run: () => toast({ tone: "success", title: a, description: "AI preview, wired to your data in Phase 2." }),
    }));
    return [...nav, ...create, ...ai];
  }, [router, toast, onNavigate, navEntries]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.label.toLowerCase().includes(needle));
  }, [q, items]);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, navigate, or run an action…"
            aria-label="Command palette search"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for “{q}”.
            </li>
          ) : (
            filtered.map((item, i) => {
              const showHeader = item.group !== lastGroup;
              lastGroup = item.group;
              const isActive = i === active;
              return (
                <React.Fragment key={item.id}>
                  {showHeader ? (
                    <li
                      className="px-3 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-eyebrow text-muted-foreground"
                      aria-hidden
                    >
                      {item.group}
                    </li>
                  ) : null}
                  <li role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => {
                        item.run();
                        onClose();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                        isActive ? "bg-forest text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded",
                          isActive ? "bg-white/15" : "bg-muted",
                        )}
                      >
                        {item.group === "Create" ? (
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        ) : item.group === "AI actions" ? (
                          <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {isActive ? <CornerDownLeft className="h-3.5 w-3.5 opacity-70" aria-hidden /> : null}
                    </button>
                  </li>
                </React.Fragment>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
