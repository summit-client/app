"use client";

import * as React from "react";
import { Sparkles, Send } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { aiActions } from "@/content/portal-admin";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };

const CANNED =
  "This is a preview of MEGBA's AI assistant. In the Phase 2 build it answers from your live data, courses, cohorts, partners, leads, and translations, and can take actions such as drafting replies, summarizing activity, and flagging at-risk cohorts. It is not connected to live data in this preview.";

/**
 * AI assistant slide-over. An honest prototype: it echoes a clearly-labelled
 * preview response rather than pretending to query live data.
 */
export function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [...m, { role: "user", text: t }, { role: "assistant", text: CANNED }]);
    setInput("");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="AI Assistant"
      description="Ask about your data or run an action"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            aria-label="Ask the AI assistant"
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            aria-label="Send"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-primary-foreground transition-colors hover:bg-forest-700 disabled:opacity-50"
            disabled={!input.trim()}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-ember/30 bg-ember/5 p-3 text-xs text-muted-foreground">
          Preview, responses are illustrative and not connected to live data yet.
        </div>

        {messages.length === 0 ? (
          <div>
            <p className="text-sm font-medium">Try an action</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {aiActions.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => ask(a)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-forest hover:text-forest"
                >
                  <Sparkles className="h-3.5 w-3.5 text-ember" aria-hidden />
                  {a}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <span
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user"
                      ? "bg-forest text-primary-foreground"
                      : "border border-border bg-muted text-foreground",
                  )}
                >
                  {m.text}
                </span>
              </li>
            ))}
            <div ref={endRef} />
          </ul>
        )}
      </div>
    </Sheet>
  );
}
