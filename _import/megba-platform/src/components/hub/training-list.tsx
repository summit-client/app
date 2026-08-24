"use client";

import * as React from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/form";

export interface CourseVM {
  id: string;
  title: string;
  provider: string | null;
  kind: string;
  url: string | null;
  due: string | null;
  status: string;
  completedAt: string | null;
  timeSpentMinutes: number;
  certificateUrl: string | null;
}

type Save = "idle" | "saving" | "saved" | "error";
type Row = { status: string; completedAt: string | null; save: Save };

const KIND_LABEL: Record<string, string> = { COMPLIANCE: "Compliance", CLINICAL: "Clinical" };

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : null;
}

export function TrainingList({ items }: { items: CourseVM[] }) {
  const [rows, setRows] = React.useState<Record<string, Row>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { status: i.status, completedAt: i.completedAt, save: "idle" as Save }])),
  );
  const [openForm, setOpenForm] = React.useState<string | null>(null);

  const persist = async (id: string, payload: Record<string, unknown>) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], save: "saving" } }));
    try {
      const res = await fetch("/api/hub/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setRows((r) => ({
          ...r,
          [id]: { status: data.training.status, completedAt: data.training.completedAt, save: "saved" },
        }));
        setTimeout(() => setRows((r) => (r[id]?.save === "saved" ? { ...r, [id]: { ...r[id], save: "idle" } } : r)), 1500);
        return true;
      }
      setRows((r) => ({ ...r, [id]: { ...r[id], save: "error" } }));
      return false;
    } catch {
      setRows((r) => ({ ...r, [id]: { ...r[id], save: "error" } }));
      return false;
    }
  };

  const kinds = Array.from(new Set(items.map((i) => i.kind)));

  return (
    <div className="space-y-6">
      {kinds.map((kind) => (
        <section key={kind}>
          <h2 className="mb-2 text-sm font-semibold">{KIND_LABEL[kind] ?? kind} training</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items
              .filter((i) => i.kind === kind)
              .map((i) => {
                const row = rows[i.id];
                const done = row.status === "COMPLETED";
                const overdue = i.due && !done && new Date(i.due) < new Date();
                return (
                  <li key={i.id} className={cn("p-3", done && "bg-forest-50/40")}>
                    <div className="flex items-start gap-3">
                      {done ? (
                        <CheckCircle2 className="hub-pop mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{i.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {i.provider ? <span>{i.provider}</span> : null}
                          {done ? (
                            <span className="text-forest">Completed {fmt(row.completedAt)}</span>
                          ) : i.due ? (
                            <span className={cn(overdue && "font-medium text-ember-600")}>Due {fmt(i.due)}</span>
                          ) : null}
                          {i.timeSpentMinutes ? <span>· {i.timeSpentMinutes} min logged</span> : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {i.url ? (
                            <a
                              href={i.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-forest/30 px-2.5 py-1.5 text-xs font-medium text-forest hover:bg-forest/5"
                            >
                              Open training <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          ) : null}

                          {!done ? (
                            <button
                              type="button"
                              onClick={() => setOpenForm(openForm === i.id ? null : i.id)}
                              className="rounded-md bg-forest px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-forest-700"
                            >
                              Mark complete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => persist(i.id, { status: "NOT_STARTED" })}
                              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-forest"
                            >
                              Undo
                            </button>
                          )}
                          {i.certificateUrl ? (
                            <a href={i.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-forest hover:underline">
                              Certificate
                            </a>
                          ) : null}

                          <span aria-live="polite" className="text-xs">
                            {row.save === "saving" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
                            ) : row.save === "saved" ? (
                              <span className="text-forest">Saved ✓</span>
                            ) : row.save === "error" ? (
                              <span className="font-medium text-ember-600">Couldn&apos;t save</span>
                            ) : null}
                          </span>
                        </div>

                        {openForm === i.id && !done ? (
                          <CompleteForm
                            onCancel={() => setOpenForm(null)}
                            onConfirm={async (payload) => {
                              const ok = await persist(i.id, { status: "COMPLETED", ...payload });
                              if (ok) setOpenForm(null);
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CompleteForm({
  onConfirm,
  onCancel,
}: {
  onConfirm: (payload: { attestation: boolean; timeSpentMinutes?: number; certificateUrl?: string }) => void;
  onCancel: () => void;
}) {
  const [attest, setAttest] = React.useState(false);
  const [minutes, setMinutes] = React.useState("");
  const [cert, setCert] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
      <Checkbox
        id="attest"
        checked={attest}
        onChange={(e) => setAttest(e.target.checked)}
        label="I confirm I have completed this training."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Time spent (minutes)" htmlFor="minutes" hint="Optional: time you enter">
          <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label="Certificate URL" htmlFor="cert" hint="Optional">
          <Input type="url" value={cert} onChange={(e) => setCert(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={!attest || busy}
          onClick={async () => {
            setBusy(true);
            onConfirm({
              attestation: attest,
              timeSpentMinutes: minutes ? Number(minutes) : undefined,
              certificateUrl: cert || undefined,
            });
            setBusy(false);
          }}
        >
          Confirm completion
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} type="button">
          Cancel
        </Button>
      </div>
    </div>
  );
}
