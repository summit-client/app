"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { getSetting } from "@summit/settings";

/**
 * Troubleshoot / feature request. Opens a prefilled email to the developer
 * address the organization configured; nothing is sent until the person
 * sends it from their own mail client.
 */
export function SupportButton() {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"Troubleshoot" | "Feature request">("Troubleshoot");
  const [detail, setDetail] = React.useState("");
  const pathname = usePathname();

  const send = () => {
    const to = String(getSetting("support.devEmail"));
    const subject = encodeURIComponent(`[MySummitHR] ${kind}`);
    const body = encodeURIComponent(
      `${detail}\n\n---\nPage: ${pathname}\nWhen: ${new Date().toISOString()}\nModule: MySummitHR (apps/employee)`,
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    setOpen(false);
    setDetail("");
  };

  return (
    <div style={{ padding: "0 var(--space-2)", marginTop: 10 }}>
      {open ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
          <select className="input" style={{ padding: "6px 8px" }} value={kind} aria-label="Report type"
            onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option>Troubleshoot</option>
            <option>Feature request</option>
          </select>
          <textarea className="input" rows={3} value={detail} aria-label="What happened, or what would help?"
            placeholder={kind === "Troubleshoot" ? "What happened, and on which screen?" : "What would help, and why?"}
            onChange={(e) => setDetail(e.target.value)} />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ padding: "6px 12px" }} onClick={send} disabled={!detail.trim()}>Email the devs</button>
            <button className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn ghost" style={{ padding: "6px 10px", fontSize: "var(--text-xs)" }} onClick={() => setOpen(true)}>
          Troubleshoot / request a feature
        </button>
      )}
    </div>
  );
}
