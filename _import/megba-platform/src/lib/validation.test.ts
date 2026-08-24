import { describe, it, expect } from "vitest";
import { leadSchema, schoolProposalSchema } from "./validation";

describe("leadSchema", () => {
  it("accepts a valid contact lead", () => {
    const result = leadSchema.safeParse({
      kind: "contact",
      name: "Alex",
      email: "alex@example.com",
      message: "I would like to learn more about your school programs.",
      consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = leadSchema.safeParse({
      kind: "contact",
      name: "Alex",
      email: "not-an-email",
      message: "Hello there, this is long enough.",
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("requires consent", () => {
    const result = leadSchema.safeParse({
      kind: "contact",
      name: "Alex",
      email: "alex@example.com",
      message: "Hello there, this is long enough.",
      consent: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("schoolProposalSchema", () => {
  it("validates required school fields", () => {
    const result = schoolProposalSchema.safeParse({
      kind: "school-proposal",
      schoolName: "Global International School",
      country: "Poland",
      contactPerson: "Jamie Lee",
      email: "jamie@school.example",
      mainChallenge: "We want to build behaviour-informed classrooms across campuses.",
      consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("flags the honeypot as a validation issue when filled", () => {
    const result = schoolProposalSchema.safeParse({
      kind: "school-proposal",
      schoolName: "Test",
      country: "X",
      contactPerson: "Bot",
      email: "bot@example.com",
      mainChallenge: "This is spam content that is long enough.",
      consent: true,
      company_website: "http://spam.example",
    });
    expect(result.success).toBe(false);
  });
});
