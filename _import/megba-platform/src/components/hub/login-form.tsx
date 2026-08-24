"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function HubLoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hub/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push(data.needsProfile ? "/hub/welcome" : "/hub");
        router.refresh();
        return;
      }
      setError(data.error || "We couldn't sign you in. Please try again.");
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

      <Field label="Mount Etna email" htmlFor="hub-email" required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@mountetnachildservices.com"
        />
      </Field>

      <Field label="Beta access password" htmlFor="hub-password" required>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Button type="submit" loading={busy} disabled={busy} className="w-full">
        {!busy ? <LogIn className="h-4 w-4" aria-hidden /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        This portal is available only to Mount Etna Child &amp; Family Services team members.
      </p>
    </form>
  );
}
