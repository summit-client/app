"use client";

/**
 * The render half of @summit/toast. Mount once per portal, near the app
 * root; everything else in that portal emits through `toast()`/`saved()`
 * from ./store and never imports this.
 *
 * Positioning: top-centre, below the cross-portal bar. Bottom-centre was the
 * first instinct and is wrong here - the primary caller is an onBlur save on
 * a phone, where the iOS keyboard occupies the bottom third of the screen
 * and a bottom-anchored toast renders behind it, i.e. exactly the moment the
 * confirmation matters most is the moment it can't be seen. Bottom-right is
 * also already taken by @summit/nav's floating SupportButton.
 *
 * Colours come from the `--color-*` aliases only. packages/design defines
 * them as aliases of --surface/--ink/--good, and apps/scheduler defines them
 * natively in its own globals.css (it deliberately keeps its own token copy
 * rather than importing @summit/design), so one inline style works in every
 * portal without a stylesheet import and without inventing a colour that
 * would need its own WCAG measurement.
 */

import * as React from "react";
import { dismissToast, subscribeToasts, type ToastItem } from "./store";

const VISIBLE_MS = 3200;

export function ToastHost() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => subscribeToasts(setItems), []);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // One timer per item, cleared on unmount. Keyed by id so a re-render
  // caused by a NEW toast never restarts an existing one's clock.
  React.useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((t) => setTimeout(() => dismissToast(t.id), VISIBLE_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((t) => t.id).join(",")]);

  if (items.length === 0) return null;

  return (
    <div
      // polite, not assertive: a save confirmation should never interrupt
      // what a screen reader is already saying.
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        // Below the cross-portal bar wherever that token is defined, and a
        // sane fallback where it isn't (apps/web has no AppNav).
        top: "calc(var(--portalnav-h, 0px) + 16px)",
        left: "50%",
        transform: "translateX(-50%)",
        // Above .sidebar (45), its backdrop (40) and apps/employee's
        // .egg-toast (70); below nothing that matters.
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        maxWidth: "min(420px, calc(100vw - 32px))",
        width: "max-content",
      }}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.4,
            padding: "10px 16px",
            borderRadius: 10,
            maxWidth: "100%",
            color: "var(--color-text-primary)",
            background: "var(--color-background-primary)",
            border: `1px solid ${t.tone === "error" ? "var(--danger, #B3261E)" : "var(--color-border-secondary)"}`,
            borderLeft: `3px solid ${t.tone === "error" ? "var(--danger, #B3261E)" : "#5DCAA5"}`,
            boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
            animation: reduced ? undefined : "summit-toast-in .16s ease-out",
          }}
        >
          {t.text}
        </button>
      ))}
      <style>{`
        @keyframes summit-toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
