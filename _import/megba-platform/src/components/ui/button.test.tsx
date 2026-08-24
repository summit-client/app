import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders a <button> by default", () => {
    render(<Button>Click me</Button>);
    const el = screen.getByRole("button", { name: "Click me" });
    expect(el.tagName).toBe("BUTTON");
  });

  it("renders an internal link when href is provided", () => {
    render(<Button href="/courses">Browse</Button>);
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).toHaveAttribute("href", "/courses");
  });

  it("renders an external anchor with rel for absolute URLs", () => {
    render(<Button href="https://example.com">External</Button>);
    const link = screen.getByRole("link", { name: "External" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
