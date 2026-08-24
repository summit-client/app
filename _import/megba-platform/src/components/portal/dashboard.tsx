"use client";

import * as React from "react";
import { ArrowUpRight, TriangleAlert, CalendarClock, Sparkles, ArrowRight, Rocket } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/content/portal";
import type { ActionItem } from "@/content/portal-admin";

/** Data-driven command-centre dashboard shared by every portal role. */
export function Dashboard({ data }: { data: DashboardData }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <p className="text-sm text-muted-foreground">{data.greeting}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((m) => (
          <div
            key={m.label}
            className={cn(
              "rounded-xl border p-5",
              m.hero ? "border-forest/20 bg-forest-50" : "border-border bg-card",
            )}
          >
            <p className="text-sm text-muted-foreground">{m.label}</p>
            <p className={cn("mt-1 font-semibold", m.hero ? "text-3xl text-forest" : "text-2xl")}>
              {m.value}
            </p>
            {m.delta ? (
              <p className={cn("mt-1 text-xs", m.hero ? "text-forest/80" : "text-muted-foreground")}>
                {m.delta}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.today.length ? <ActionGroup title="Today" items={data.today} /> : null}
          {data.priorities.length ? <ActionGroup title="Priorities" items={data.priorities} /> : null}
          {data.alerts.length ? (
            <ActionGroup title="Alerts" items={data.alerts} accent="ember" icon={TriangleAlert} />
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Upcoming" icon={CalendarClock}>
            {data.upcoming.length ? (
              <ul className="divide-y divide-border">
                {data.upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.title}</p>
                      <p className="text-xs text-muted-foreground">{u.when}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                      {u.kind}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            )}
          </Card>

          {data.insights.length ? (
            <Card title="AI insights" icon={Sparkles}>
              <ul className="space-y-3">
                {data.insights.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Card title="Recent activity">
        {data.activity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent activity</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">User</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Activity</th>
                  <th scope="col" className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-4 font-medium">{a.who}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{a.what}</td>
                    <td className="whitespace-nowrap py-2.5 text-muted-foreground">{a.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {Icon ? <Icon className="h-4 w-4 text-forest" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActionGroup({
  title,
  items,
  accent = "forest",
  icon: Icon,
}: {
  title: string;
  items: ActionItem[];
  accent?: "forest" | "ember";
  icon?: React.ElementType;
}) {
  const { toast } = useToast();
  return (
    <Card title={title} icon={Icon}>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border p-3",
              it.tone === "urgent" ? "border-ember/30 bg-ember/5" : "border-border",
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{it.title}</p>
              <p className="text-xs text-muted-foreground">{it.meta}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                toast({
                  tone: "success",
                  title: it.action,
                  description: "Preview action, connects to live data in Phase 2.",
                })
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                accent === "ember"
                  ? "bg-ember text-accent-foreground hover:bg-ember-600"
                  : "border border-forest/30 text-forest hover:bg-forest/5",
              )}
            >
              {it.action}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Honest empty-state for sections whose live data arrives in Phase 2. */
export function SectionPreview({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest">
        <Rocket className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-xl font-semibold">{label}</h2>
      <p className="mt-2 text-muted-foreground">
        This is a preview of the portal. {label} connects to live data in the Phase 2 build, where
        you will manage records, run bulk actions, and act on AI recommendations here.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-forest-700"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        Back to dashboard
      </button>
    </div>
  );
}
