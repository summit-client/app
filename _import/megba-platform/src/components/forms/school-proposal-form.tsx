"use client";

import * as React from "react";
import { schoolProposalSchema } from "@/lib/validation";
import { Field, Input, Textarea, Select, Checkbox, ErrorSummary } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useLeadSubmit } from "./use-lead-submit";
import { FormSuccess } from "./form-success";

const SERVICES = [
  "School behaviour consultation",
  "Teacher & staff training",
  "Parent coaching",
  "Technician training",
  "Institutional licensing",
  "White-label portal",
  "Custom curriculum",
];
const CURRICULA = ["IB", "British", "American", "Canadian", "National", "Other / mixed"];
const DELIVERY = ["Remote", "On-site", "Blended", "Not sure yet"];
const TIMELINES = ["Immediately", "This term", "Next term", "Next academic year", "Exploring"];
const BUDGETS = ["Not sure", "< $10k", "$10k–$50k", "$50k–$150k", "$150k+"];

export function SchoolProposalForm() {
  const { state, errors, submit, summaryRef } = useLeadSubmit(schoolProposalSchema, "school-proposal");
  if (state === "success")
    return <FormSuccess title="Proposal request received" body="Our partnerships team will review your details and prepare a tailored proposal. Watch for a confirmation email." />;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    submit({
      kind: "school-proposal",
      schoolName: f.get("schoolName"),
      country: f.get("country"),
      city: f.get("city"),
      schoolType: f.get("schoolType"),
      curriculum: f.get("curriculum"),
      studentPopulation: f.get("studentPopulation"),
      ageRange: f.get("ageRange"),
      contactPerson: f.get("contactPerson"),
      role: f.get("role"),
      email: f.get("email"),
      phone: f.get("phone"),
      mainChallenge: f.get("mainChallenge"),
      servicesOfInterest: f.getAll("servicesOfInterest").map(String),
      preferredDelivery: f.get("preferredDelivery"),
      staffCount: f.get("staffCount"),
      learnerCount: f.get("learnerCount"),
      timeline: f.get("timeline"),
      languages: f.get("languages"),
      budgetRange: f.get("budgetRange"),
      details: f.get("details"),
      consent: f.get("consent") === "on",
      company_website: f.get("company_website"),
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <div ref={summaryRef} tabIndex={-1}>
        <ErrorSummary errors={errors} />
      </div>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <fieldset className="space-y-5">
        <legend className="text-sm font-semibold uppercase tracking-eyebrow text-forest">
          About your school
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="School name" htmlFor="schoolName" required error={errors.schoolName}>
            <Input name="schoolName" />
          </Field>
          <Field label="School type" htmlFor="schoolType">
            <Input name="schoolType" placeholder="International, private, public…" />
          </Field>
          <Field label="Country" htmlFor="country" required error={errors.country}>
            <Input name="country" autoComplete="country-name" />
          </Field>
          <Field label="City" htmlFor="city">
            <Input name="city" />
          </Field>
          <Field label="Curriculum" htmlFor="curriculum">
            <Select name="curriculum" defaultValue="">
              <option value="">Select…</option>
              {CURRICULA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Student population" htmlFor="studentPopulation">
            <Input name="studentPopulation" placeholder="e.g. 850" />
          </Field>
          <Field label="Age / grade range" htmlFor="ageRange">
            <Input name="ageRange" placeholder="e.g. Ages 3–18" />
          </Field>
          <Field label="Languages required" htmlFor="languages">
            <Input name="languages" placeholder="e.g. English, Polish" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-sm font-semibold uppercase tracking-eyebrow text-forest">
          Contact
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="contactPerson" required error={errors.contactPerson}>
            <Input name="contactPerson" autoComplete="name" />
          </Field>
          <Field label="Role" htmlFor="role">
            <Input name="role" />
          </Field>
          <Field label="Email" htmlFor="email" required error={errors.email}>
            <Input name="email" type="email" autoComplete="email" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input name="phone" type="tel" autoComplete="tel" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-sm font-semibold uppercase tracking-eyebrow text-forest">
          What you need
        </legend>
        <Field label="Main challenge" htmlFor="mainChallenge" required error={errors.mainChallenge}>
          <Textarea name="mainChallenge" placeholder="What are you hoping to improve or solve?" />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Services of interest</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SERVICES.map((s, i) => (
              <Checkbox key={s} id={`svc-${i}`} name="servicesOfInterest" value={s} label={s} />
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred delivery" htmlFor="preferredDelivery">
            <Select name="preferredDelivery" defaultValue="">
              <option value="">Select…</option>
              {DELIVERY.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Number of staff" htmlFor="staffCount">
            <Input name="staffCount" />
          </Field>
          <Field label="Number of learners" htmlFor="learnerCount">
            <Input name="learnerCount" />
          </Field>
          <Field label="Preferred timeline" htmlFor="timeline">
            <Select name="timeline" defaultValue="">
              <option value="">Select…</option>
              {TIMELINES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget range (optional)" htmlFor="budgetRange">
            <Select name="budgetRange" defaultValue="">
              <option value="">Prefer not to say</option>
              {BUDGETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Additional details" htmlFor="details">
          <Textarea name="details" />
        </Field>
      </fieldset>

      <Checkbox
        id="consent"
        name="consent"
        label="I consent to MEGBA contacting me about this proposal and agree to the Privacy Policy."
      />
      {errors.consent ? <p className="text-xs font-medium text-ember-600">{errors.consent}</p> : null}

      <Button type="submit" size="lg" loading={state === "submitting"}>
        {state === "submitting" ? "Submitting…" : "Request a school proposal"}
      </Button>
    </form>
  );
}
