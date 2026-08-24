"use client";

import * as React from "react";
import { contactSchema } from "@/lib/validation";
import { Field, Input, Textarea, Select, Checkbox, ErrorSummary } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useLeadSubmit } from "./use-lead-submit";
import { FormSuccess } from "./form-success";

const TOPICS = [
  "General enquiry",
  "School partnership",
  "Parent coaching",
  "Technician training",
  "RBT-aligned training",
  "Careers",
  "Media",
];

export function ContactForm({ defaultTopic }: { defaultTopic?: string }) {
  const { state, errors, submit, summaryRef } = useLeadSubmit(contactSchema, "contact");

  if (state === "success") return <FormSuccess />;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    submit({
      kind: "contact",
      name: f.get("name"),
      email: f.get("email"),
      topic: f.get("topic"),
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
      </div>

      <Field label="Topic" htmlFor="topic">
        <Select name="topic" defaultValue={defaultTopic ?? ""}>
          <option value="">Select a topic…</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Message" htmlFor="message" required error={errors.message}>
        <Textarea name="message" />
      </Field>

      <Checkbox
        id="consent"
        name="consent"
        label="I consent to MEGBA contacting me about my enquiry and agree to the Privacy Policy."
      />
      {errors.consent ? <p className="text-xs font-medium text-ember-600">{errors.consent}</p> : null}

      <Button type="submit" loading={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
