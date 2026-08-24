"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export interface PdVM {
  id: string;
  title: string;
  provider: string | null;
  category: string | null;
  source: string | null;
  date: string | null;
  hours: number;
  instructor: string | null;
  certificateUrl: string | null;
  expiryDate: string | null;
  verified: boolean;
}

const SOURCES = ["Internal", "MEGBA", "External", "Conference", "Workshop", "Webinar", "Supervision", "Clinical training"];

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "-";
}

export function PdManager({ items, total }: { items: PdVM[]; total: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [fSource, setFSource] = React.useState("");
  const [fYear, setFYear] = React.useState("");
  const [fVerified, setFVerified] = React.useState("");

  const years = Array.from(new Set(items.map((r) => (r.date ? new Date(r.date).getFullYear() : null)).filter(Boolean))) as number[];

  const filtered = items.filter((r) => {
    if (fSource && r.source !== fSource) return false;
    if (fYear && (!r.date || new Date(r.date).getFullYear() !== Number(fYear))) return false;
    if (fVerified === "verified" && !r.verified) return false;
    if (fVerified === "unverified" && r.verified) return false;
    return true;
  });
  const filteredHours = filtered.reduce((s, r) => s + r.hours, 0);

  return (
    <div className="space-y-4">
      {/* Header: total + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-base font-semibold text-foreground">{total.toFixed(1)} hours</span> total professional
          development
        </p>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" aria-hidden /> Add record
        </Button>
      </div>

      {open ? <AddForm onDone={() => { setOpen(false); router.refresh(); }} /> : null}

      {/* Filters */}
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={fYear} onChange={(e) => setFYear(e.target.value)} aria-label="Filter by year">
            <option value="">All years</option>
            {years.sort((a, b) => b - a).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
          <Select value={fVerified} onChange={(e) => setFVerified(e.target.value)} aria-label="Filter by verification">
            <option value="">All</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </Select>
        </div>
      ) : null}

      {/* List */}
      {filtered.length ? (
        <>
          {(fSource || fYear || fVerified) ? (
            <p className="text-sm text-muted-foreground">{filtered.length} records · {filteredHours.toFixed(1)} hours</p>
          ) : null}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 bg-card p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    {r.verified ? (
                      <span className="text-xs font-medium text-forest">Verified</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[r.provider, r.source, fmt(r.date)].filter(Boolean).join(" · ")}
                  </p>
                  {r.certificateUrl ? (
                    <a href={r.certificateUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-forest hover:underline">
                      Certificate
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{r.hours.toFixed(1)}h</span>
                  {!r.verified ? (
                    <button
                      type="button"
                      aria-label={`Delete ${r.title}`}
                      onClick={async () => {
                        await fetch(`/api/hub/pd?id=${r.id}`, { method: "DELETE" });
                        router.refresh();
                      }}
                      className="rounded p-2 text-muted-foreground hover:text-ember-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No professional development recorded</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Add courses, workshops, webinars, conferences, supervision, and certifications to build your permanent learning record.
          </p>
        </div>
      )}
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = React.useState({
    title: "", provider: "", category: "", source: "", date: "", hours: "", instructor: "", description: "", certificateUrl: "", expiryDate: "", notes: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hub/pd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hours: Number(form.hours) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { onDone(); return; }
      setError(data.error || "We couldn't save this record.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4" noValidate>
      <h2 className="text-base font-semibold">Add a development record</h2>
      {error ? (
        <div role="alert" className="rounded-md border border-ember-600/40 bg-ember/5 p-3 text-sm font-medium text-ember-600">{error}</div>
      ) : null}
      <Field label="Title" htmlFor="title" required>
        <Input value={form.title} onChange={set("title")} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider" htmlFor="provider"><Input value={form.provider} onChange={set("provider")} /></Field>
        <Field label="Source" htmlFor="source">
          <Select value={form.source} onChange={set("source")}>
            <option value="">Select…</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Category" htmlFor="category"><Input value={form.category} onChange={set("category")} /></Field>
        <Field label="Instructor" htmlFor="instructor"><Input value={form.instructor} onChange={set("instructor")} /></Field>
        <Field label="Date" htmlFor="date"><Input type="date" value={form.date} onChange={set("date")} /></Field>
        <Field label="Hours" htmlFor="hours" required><Input type="number" min={0} step="0.5" value={form.hours} onChange={set("hours")} required /></Field>
        <Field label="Certificate URL" htmlFor="certificateUrl"><Input type="url" value={form.certificateUrl} onChange={set("certificateUrl")} placeholder="https://…" /></Field>
        <Field label="Expiry date" htmlFor="expiryDate" hint="If applicable"><Input type="date" value={form.expiryDate} onChange={set("expiryDate")} /></Field>
      </div>
      <Field label="Description" htmlFor="description"><Textarea value={form.description} onChange={set("description")} rows={2} /></Field>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={busy}>Save record</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
