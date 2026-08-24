"use client";

import * as React from "react";
import { demoSchema } from "@/lib/validation";
import { Field, Input, Textarea, Select, Checkbox, ErrorSummary } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useLeadSubmit } from "./use-lead-submit";
import { FormSuccess } from "./form-success";

const SIZES = ["1–50", "51–200", "201–1,000", "1,000+"];

export function DemoForm() {
  const { state, errors, submit, summaryRef } = useLeadSubmit(demoSchema, "demo");
  if (state === "success") return <FormSuccess title="Demo request received" />;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    submit({
      kind: "demo",
      name: f.get("name"),
      email: f.get("email"),
      organization: f.get("organization"),
      role: f.get("role"),
      learners: f.get("learners"),
      message: f.get("message"),
      consent: f.get("consent") === "on",
      company_website: f.get("company_website"),
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div ref={summaryRef} tabIndex={-1}>
        <ErrorSummary errors={errors} />
      </div>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required error={errors.name}>
          <Input name="name" autoComplete="name" />
        </Field>
        <Field label="Work email" htmlFor="email" required error={errors.email}>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label="Organization" htmlFor="organization" required error={errors.organization}>
          <Input name="organization" autoComplete="organization" />
        </Field>
        <Field label="Your role" htmlFor="role">
          <Input name="role" />
        </Field>
        <Field label="Approx. number of learners" htmlFor="learners">
          <Select name="learners" defaultValue="">
            <option value="">Select…</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Anything you'd like the demo to focus on?" htmlFor="message">
        <Textarea name="message" />
      </Field>

      <Checkbox
        id="consent"
        name="consent"
        label="I consent to MEGBA contacting me about a platform demo and agree to the Privacy Policy."
      />
      {errors.consent ? <p className="text-xs font-medium text-ember-600">{errors.consent}</p> : null}

      <Button type="submit" loading={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Book a platform demo"}
      </Button>
    </form>
  );
}
