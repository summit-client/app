"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/hub/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, error: data.error as string | undefined };
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    const { ok, error } = await post(body);
    setBusy(null);
    if (!ok) {
      setError(error || "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, error, run };
}

export function SignoffButtons({ progressId }: { progressId: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" loading={busy === "a"} disabled={!!busy} onClick={() => run("a", { action: "signoff", progressId, decision: "APPROVED" })}>
        Approve
      </Button>
      <Button size="sm" variant="outline" loading={busy === "r"} disabled={!!busy} onClick={() => run("r", { action: "signoff", progressId, decision: "RETURNED" })}>
        Return
      </Button>
      {error ? <span role="alert" className="text-xs font-medium text-ember-600">{error}</span> : null}
    </div>
  );
}

export function TimeOffDecision({ id }: { id: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" loading={busy === "a"} disabled={!!busy} onClick={() => run("a", { action: "timeoff", id, decision: "APPROVED" })}>
        Approve
      </Button>
      <Button size="sm" variant="outline" loading={busy === "d"} disabled={!!busy} onClick={() => run("d", { action: "timeoff", id, decision: "DENIED" })}>
        Deny
      </Button>
      {error ? <span role="alert" className="text-xs font-medium text-ember-600">{error}</span> : null}
    </div>
  );
}

export function PdVerifyButton({ id, verified }: { id: string; verified: boolean }) {
  const { busy, run } = useAction();
  return (
    <Button
      size="sm"
      variant={verified ? "outline" : "primary"}
      loading={!!busy}
      disabled={!!busy}
      onClick={() => run("v", { action: "pd_verify", id, verified: !verified })}
    >
      {verified ? "Unverify" : "Verify"}
    </Button>
  );
}

export function IssueCertificateForm({ employeeUserId }: { employeeUserId: string }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", competency: "", instructor: "", trainingHours: "", expiryDate: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Issue certificate
      </Button>
    );
  }
  return (
    <form
      className="mt-2 space-y-3 rounded-lg border border-border bg-muted/40 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("issue", {
          action: "issue_certificate",
          employeeUserId,
          title: form.title,
          competency: form.competency,
          instructor: form.instructor,
          trainingHours: form.trainingHours ? Number(form.trainingHours) : undefined,
          expiryDate: form.expiryDate,
        });
        if (ok) {
          setOpen(false);
          setForm({ title: "", competency: "", instructor: "", trainingHours: "", expiryDate: "" });
        }
      }}
    >
      <Field label="Certificate title" htmlFor="cert-title" required>
        <Input value={form.title} onChange={set("title")} required placeholder="e.g. Clinical Competency Training Program" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Competency" htmlFor="cert-comp">
          <Input value={form.competency} onChange={set("competency")} />
        </Field>
        <Field label="Instructor" htmlFor="cert-inst">
          <Input value={form.instructor} onChange={set("instructor")} />
        </Field>
        <Field label="Training hours" htmlFor="cert-hours">
          <Input type="number" min={0} step="0.5" value={form.trainingHours} onChange={set("trainingHours")} />
        </Field>
        <Field label="Expiry date" htmlFor="cert-exp" hint="If applicable">
          <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} />
        </Field>
      </div>
      {error ? <p role="alert" className="text-xs font-medium text-ember-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy === "issue"} disabled={!!busy || !form.title.trim()}>
          Issue certificate
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
