import { z } from "zod";

/** Shared lead-source / tracking metadata attached to every submission. */
export const trackingSchema = z.object({
  source: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  // Honeypot, must stay empty (bots fill it).
  company_website: z.string().max(0).optional(),
});

const consent = z.literal(true, {
  errorMap: () => ({ message: "Please provide consent to continue." }),
});

export const contactSchema = trackingSchema.extend({
  kind: z.literal("contact"),
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Please enter a valid email address."),
  topic: z.string().optional(),
  message: z.string().min(10, "Please tell us a little more (10+ characters)."),
  consent,
});

export const consultationSchema = trackingSchema.extend({
  kind: z.literal("consultation"),
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Please enter a valid email address."),
  organization: z.string().optional(),
  role: z.string().optional(),
  country: z.string().min(2, "Please enter your country."),
  serviceInterest: z.string().optional(),
  message: z.string().min(10, "Please describe your main challenge (10+ characters)."),
  consent,
});

export const demoSchema = trackingSchema.extend({
  kind: z.literal("demo"),
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Please enter a valid email address."),
  organization: z.string().min(2, "Please enter your organization."),
  role: z.string().optional(),
  learners: z.string().optional(),
  message: z.string().optional(),
  consent,
});

export const schoolProposalSchema = trackingSchema.extend({
  kind: z.literal("school-proposal"),
  schoolName: z.string().min(2, "Please enter the school name."),
  country: z.string().min(2, "Please enter the country."),
  city: z.string().optional(),
  schoolType: z.string().optional(),
  curriculum: z.string().optional(),
  studentPopulation: z.string().optional(),
  ageRange: z.string().optional(),
  contactPerson: z.string().min(2, "Please enter a contact name."),
  role: z.string().optional(),
  email: z.string().email("Please enter a valid email address."),
  phone: z.string().optional(),
  mainChallenge: z.string().min(10, "Please describe your main challenge (10+ characters)."),
  servicesOfInterest: z.array(z.string()).optional(),
  preferredDelivery: z.string().optional(),
  staffCount: z.string().optional(),
  learnerCount: z.string().optional(),
  timeline: z.string().optional(),
  languages: z.string().optional(),
  budgetRange: z.string().optional(),
  details: z.string().optional(),
  consent,
});

export const leadSchema = z.discriminatedUnion("kind", [
  contactSchema,
  consultationSchema,
  demoSchema,
  schoolProposalSchema,
]);

export type LeadPayload = z.infer<typeof leadSchema>;
