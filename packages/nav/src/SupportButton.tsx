"use client";

import * as React from "react";

/**
 * Troubleshoot / feature request, for every portal.
 *
 * Lived in apps/employee only, which meant the one module whose users are
 * staff had a way to report a problem and the four that families and
 * schedulers use did not. Moved here so every app mounts the same thing.
 *
 * WHY IT TAKES PROPS INSTEAD OF READING SETTINGS
 *
 * The original read `support.devEmail` and `org.name` from @summit/settings
 * and the pathname from `next/navigation`. Neither travels:
 *
 *   - @summit/nav does not depend on @summit/settings, and adding the
 *     dependency to a package four apps import would be a lockfile change for
 *     two strings that the caller already has in hand.
 *   - `usePathname` is App Router only. apps/client and apps/scheduler are
 *     Pages Router, where it does not exist. A shared component that imports
 *     it works in two apps and breaks in two.
 *
 * So the caller passes what it knows. Each app reads its own settings and its
 * own router, which is the half that legitimately differs between them.
 *
 * NOTHING IS SENT FROM HERE
 *
 * This opens a prefilled message in the person's own mail client. No report
 * leaves the browser until they press send in their own client, which is also
 * why the body can carry the page they were on without a privacy question:
 * they can read and edit every word first.
 */
export interface SupportButtonProps {
  /** Where reports go. Read from `support.devEmail` where the app has settings. */
  to?: string;
  /** What to call this product in the subject line, e.g. "Mount Etna HR". */
  brand?: string;
  /** Which module the report came from, e.g. "apps/client". */
  moduleName?: string;
  /** The current path. Supplied by the caller: see the note above on routers. */
  pathname?: string;
  /** "sidebar" sits in a nav column; "floating" pins to the corner. */
  placement?: "sidebar" | "floating";
}

/**
 * The address reports go to when an app has no configured value.
 *
 * A real inbox rather than a placeholder: a fallback nobody reads is worse
 * than no button, because the person believes they have reported something.
 */
export const DEFAULT_SUPPORT_EMAIL = "info@summitclient.io";

type Kind = "Troubleshoot" | "Feature request";

/**
 * The mailto: URL for a report. Exported so it can be tested without a DOM,
 * and so the encoding is in one place rather than inline in a click handler.
 */
export function supportMailto(opts: {
  to: string;
  brand: string;
  kind: Kind;
  detail: string;
  moduleName: string;
  pathname: string;
  when: string;
}): string {
  const subject = encodeURIComponent(`[${opts.brand}] ${opts.kind}`);
  const body = encodeURIComponent(
    `${opts.detail}\n\n---\n`
    + `Page: ${opts.pathname || "unknown"}\n`
    + `When: ${opts.when}\n`
    + `Module: ${opts.moduleName}`,
  );
  return `mailto:${opts.to}?subject=${subject}&body=${body}`;
}

export function SupportButton({
  to = DEFAULT_SUPPORT_EMAIL,
  brand = "Summit",
  moduleName = "Summit",
  pathname = "",
  placement = "sidebar",
}: SupportButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>("Troubleshoot");
  const [detail, setDetail] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Escape closes it. A panel that only closes via its own Cancel button traps
  // a keyboard user who opened it by accident.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function send() {
    const trimmed = detail.trim();
    if (!trimmed) return;
    // A real, clicked <a> rather than window.location.href = "mailto:...".
    // Reported live during the 2026-09-02 demo: on at least one mobile
    // browser, setting location.href to a mailto: URL never opened Mail at
    // all - it prompted a browser picker instead. That's consistent with
    // some mobile WebViews and in-app browsers intercepting a script-set
    // navigation to a non-http(s) scheme but honouring a user-gesture click
    // on an anchor with the same href. The anchor is created, clicked and
    // discarded immediately; nothing about it is visible.
    const a = document.createElement("a");
    a.href = supportMailto({
      to, brand, kind, detail: trimmed, moduleName, pathname,
      when: new Date().toISOString(),
    });
    a.click();
    setOpen(false);
    setDetail("");
  }

  const floating = placement === "floating";

  return (
    <div
      ref={panelRef}
      style={
        floating
          ? {
              position: "fixed", right: 16, bottom: 16, zIndex: 40,
              maxWidth: "min(340px, calc(100vw - 32px))",
            }
          : { padding: "0 12px", marginTop: 10 }
      }
    >
      {open ? (
        <div
          role="dialog"
          aria-label="Troubleshoot or request a feature"
          style={{
            display: "grid", gap: 8,
            ...(floating
              ? {
                  background: "var(--surface, #fff)",
                  border: "1px solid var(--line, #dce8ee)",
                  borderRadius: 12, padding: 14,
                  boxShadow: "0 6px 24px rgba(23,50,71,.14)",
                }
              : { marginBottom: 8 }),
          }}
        >
          <label style={srOnly} htmlFor="support-kind">Report type</label>
          <select
            id="support-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            style={inputStyle}
          >
            <option>Troubleshoot</option>
            <option>Feature request</option>
          </select>

          <label style={srOnly} htmlFor="support-detail">
            {kind === "Troubleshoot" ? "What happened, and on which screen?" : "What would help, and why?"}
          </label>
          <textarea
            id="support-detail"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={
              kind === "Troubleshoot"
                ? "What happened, and on which screen?"
                : "What would help, and why?"
            }
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />

          {/* Said before they press it. "Email the devs" on its own reads as
              though the report is sent from here, and a person who closes the
              tab expecting that has reported nothing. */}
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #607987)", lineHeight: 1.5 }}>
            This opens a message in your own email app, with the page you are on
            attached. Nothing is sent until you send it.
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={send} disabled={!detail.trim()} style={primaryStyle(!detail.trim())}>
              Open email
            </button>
            <button type="button" onClick={() => setOpen(false)} style={ghostStyle}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={floating ? { ...ghostStyle, ...floatingTriggerStyle } : { ...ghostStyle, fontSize: 12 }}
        >
          Troubleshoot / request a feature
        </button>
      )}
    </div>
  );
}

const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid var(--line, #cddde4)", font: "inherit", fontSize: 13,
  color: "var(--ink, #173247)", background: "var(--surface, #fff)",
};
function primaryStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", minHeight: 36, borderRadius: 999,
    border: "1px solid var(--accent, #0C5350)",
    background: disabled ? "var(--muted, #8fa7b2)" : "var(--accent, #0C5350)",
    color: "#fff", fontWeight: 600, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
const ghostStyle: React.CSSProperties = {
  padding: "8px 12px", minHeight: 36, borderRadius: 999,
  border: "1px solid var(--line, #cddde4)", background: "var(--surface, #fff)",
  color: "var(--muted, #607987)", fontWeight: 600, fontSize: 13, cursor: "pointer",
};
const floatingTriggerStyle: React.CSSProperties = {
  boxShadow: "0 4px 14px rgba(23,50,71,.12)",
};
