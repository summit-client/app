"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export function HubProfileForm({
  email,
  locations,
}: {
  email: string;
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    locationId: "",
    supervisorName: "",
    startDate: "",
    photoUrl: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { ...form, photoUrl: form.photoUrl.trim() || undefined };
    try {
      const res = await fetch("/api/hub/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push("/hub");
        router.refresh();
        return;
      }
      setError(data.error || "We couldn't save your profile. Please try again.");
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-ember-600/40 bg-ember/5 p-3 text-sm font-medium text-ember-600"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input value={form.firstName} onChange={set("firstName")} required autoComplete="given-name" />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input value={form.lastName} onChange={set("lastName")} required autoComplete="family-name" />
        </Field>
      </div>

      <Field label="Mount Etna email" htmlFor="email">
        <Input value={email} readOnly disabled className="opacity-70" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor="jobTitle">
          <Input value={form.jobTitle} onChange={set("jobTitle")} autoComplete="organization-title" />
        </Field>
        <Field label="Primary location" htmlFor="locationId">
          <Select value={form.locationId} onChange={set("locationId")}>
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supervisor" htmlFor="supervisorName">
          <Input value={form.supervisorName} onChange={set("supervisorName")} />
        </Field>
        <Field label="Start date" htmlFor="startDate">
          <Input type="date" value={form.startDate} onChange={set("startDate")} />
        </Field>
      </div>

      <Field label="Profile photo URL" htmlFor="photoUrl" hint="Optional. You can add this later.">
        <Input type="url" value={form.photoUrl} onChange={set("photoUrl")} placeholder="https://…" />
      </Field>

      <Button type="submit" loading={busy} disabled={busy} className="w-full">
        {busy ? "Creating your profile…" : "Create my profile"}
        {!busy ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
      </Button>
    </form>
  );
}
