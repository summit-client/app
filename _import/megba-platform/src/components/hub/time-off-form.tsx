"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

function inclusiveDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

export function TimeOffForm() {
  const router = useRouter();
  const [form, setForm] = React.useState({ type: "VACATION", startDate: "", endDate: "", reason: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ days: number; notified: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const days = form.startDate && form.endDate ? inclusiveDays(form.startDate, form.endDate) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hub/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone({ days: data.days, notified: data.notified });
        setForm({ type: "VACATION", startDate: "", endDate: "", reason: "" });
        router.refresh();
        return;
      }
      setError(data.error || "We couldn't submit your request. Please try again.");
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-forest/20 bg-forest-50 p-5">
        <div className="flex items-center gap-2 text-forest">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <p className="font-semibold">Request submitted</p>
        </div>
        <p className="mt-1 text-sm text-forest/80">
          Your {done.days}-day request has been recorded.{" "}
          {done.notified
            ? "The office has been notified by email."
            : "The office will see it in the hub for review."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setDone(null)}>
          Request more time off
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <div role="alert" className="rounded-md border border-ember-600/40 bg-ember/5 p-3 text-sm font-medium text-ember-600">
          {error}
        </div>
      ) : null}

      <Field label="Type" htmlFor="type" required>
        <Select value={form.type} onChange={set("type")}>
          <option value="VACATION">Vacation</option>
          <option value="SICK">Sick / mental-health day</option>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="startDate" required>
          <Input type="date" value={form.startDate} onChange={set("startDate")} required />
        </Field>
        <Field label="To" htmlFor="endDate" required>
          <Input type="date" value={form.endDate} onChange={set("endDate")} required />
        </Field>
      </div>

      {days > 0 ? (
        <p className="text-sm text-muted-foreground">
          {days} day{days === 1 ? "" : "s"} requested.
        </p>
      ) : null}

      <Field label="Reason" htmlFor="reason" hint="Optional">
        <Textarea value={form.reason} onChange={set("reason")} rows={3} maxLength={500} />
      </Field>

      <Button type="submit" loading={busy} disabled={busy || days <= 0} className="w-full sm:w-auto">
        {!busy ? <Send className="h-4 w-4" aria-hidden /> : null}
        {busy ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
