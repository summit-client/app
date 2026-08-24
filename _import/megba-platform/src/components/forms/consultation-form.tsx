"use client";

import * as React from "react";
import { consultationSchema } from "@/lib/validation";
import { Field, Input, Textarea, Select, Checkbox, ErrorSummary } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { services } from "@/content/services";
import { useLeadSubmit } from "./use-lead-submit";
import { FormSuccess } from "./form-success";

export function ConsultationForm() {
  const { state, errors, submit, summaryRef } = useLeadSubmit(consultationSchema, "consultation");
  if (state === "success") return <FormSuccess title="Consultation request received" />;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    submit({
      kind: "consultation",
      name: f.get("name"),
      email: f.get("email"),
      organization: f.get("organization"),
      role: f.get("role"),
      country: f.get("country"),
      serviceInterest: f.get("serviceInterest"),
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
        <Field label="Email" htmlFor="email" required error={errors.email}>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label="Organization / school" htmlFor="organization">
          <Input name="organization" autoComplete="organization" />
        </Field>
        <Field label="Your role" htmlFor="role">
          <Input name="role" autoComplete="organization-title" />
        </Field>
        <Field label="Country" htmlFor="country" required error={errors.country}>
          <Input name="country" autoComplete="country-name" />
        </Field>
        <Field label="Service of interest" htmlFor="serviceInterest">
          <Select name="serviceInterest" defaultValue="">
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.slug} value={s.title}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="What's your main challenge?"
        htmlFor="message"
        required
        error={errors.message}
        hint="A few sentences is plenty, we'll follow up to learn more."
      >
        <Textarea name="message" />
      </Field>

      <Checkbox
        id="consent"
        name="consent"
        label="I consent to MEGBA contacting me about this request and agree to the Privacy Policy."
      />
      {errors.consent ? <p className="text-xs font-medium text-ember-600">{errors.consent}</p> : null}

      <Button type="submit" loading={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Request a consultation"}
      </Button>
    </form>
  );
}
