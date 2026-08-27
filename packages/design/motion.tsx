"use client";

import * as React from "react";

/**
 * Reveal: the one entrance in the system. Fades up 24px, once, when the
 * section reaches 15% visibility with a 40px bottom margin, then unobserves
 * immediately so scrolling back up never replays it.
 *
 * Use it on section-level moments, not on every element.
 */

const OPTIONS: IntersectionObserverInit = { threshold: 0.15, rootMargin: "0px 0px -40px 0px" };
const BOTTOM_MARGIN = 40;

const reveal = (el: Element) => el.classList.add("is-visible");

/** Already on screen, by the same geometry the observer uses. */
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.height === 0) return false;
  return r.top < window.innerHeight - BOTTOM_MARGIN && r.bottom > 0;
}

/** Shared observer: one per page rather than one per element. */
let observer: IntersectionObserver | null = null;

/**
 * Content is never left hidden. An element already on screen reveals on the
 * next frame without waiting for the observer, which does not report in a
 * hidden, prerendered or backgrounded tab. Only genuinely off-screen elements
 * wait for a scroll, and a visibility change re-checks them.
 */
function observe(el: Element): () => void {
  if (typeof IntersectionObserver === "undefined") {
    reveal(el);
    return () => {};
  }

  if (onScreen(el)) {
    // Two frames lets the hidden state paint first so the transition runs.
    // A hidden tab pauses rAF, so a short timer guarantees the reveal anyway.
    let done = false;
    const fire = () => { if (!done) { done = true; reveal(el); } };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(fire));
    }
    const t = setTimeout(fire, 120);
    return () => clearTimeout(t);
  }

  if (!observer) {
    observer = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        obs.unobserve(entry.target); // once, and never again
      }
    }, OPTIONS);
  }
  observer.observe(el);

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (el.isConnected && !el.classList.contains("is-visible") && onScreen(el)) {
      reveal(el);
      observer?.unobserve(el);
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    observer?.unobserve(el);
  };
}

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  /** Stagger position in ms. Capped at five steps by RevealGroup. */
  delay?: number;
  as?: "div" | "section" | "header" | "li";
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already on screen at mount: reveal on the next frame so the transition runs.
    return observe(el);
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`.trim()}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The one signature flourish a page is allowed: a drawn underline. It observes
 * itself so a title above the fold still draws, and unobserves after drawing.
 */
export function Flourish({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observe(el);
  }, []);
  return <span ref={ref} className="flourish">{children}</span>;
}

const STAGGER_MS = 120;
const MAX_STEPS = 5; // beyond five it reads as a loading screen

/** Staggers its children 120ms apart, capped at five steps. */
export function RevealGroup({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <Reveal key={i} delay={Math.min(i, MAX_STEPS - 1) * STAGGER_MS} className={className}>
          {child}
        </Reveal>
      ))}
    </>
  );
}
