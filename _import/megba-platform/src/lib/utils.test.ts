import { describe, it, expect } from "vitest";
import { cn, slugify, absoluteUrl } from "./utils";

describe("cn", () => {
  it("merges and dedupes conflicting Tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("slugify", () => {
  it("creates URL-safe slugs", () => {
    expect(slugify("Behaviour Is Communication")).toBe("behaviour-is-communication");
    expect(slugify("  ESDM-Informed  Strategies! ")).toBe("esdm-informed-strategies");
  });
});

describe("absoluteUrl", () => {
  it("prefixes the site URL and normalizes the leading slash", () => {
    const a = absoluteUrl("/courses");
    const b = absoluteUrl("courses");
    expect(a).toBe(b);
    expect(a.endsWith("/courses")).toBe(true);
  });
});
