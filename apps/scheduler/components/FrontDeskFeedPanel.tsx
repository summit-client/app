import { useEffect, useState } from "react";

type FeedState = {
  active: boolean;
  feedUrl: string | null;
  webcalUrl: string | null;
};

/**
 * "Front desk calendar feed" - the admin-managed counterpart to
 * components/CalendarFeedPanel.tsx's personal "My calendar feed" panel,
 * against the same `calendar_feed_tokens` table but a distinct `kind`
 * (migration 0071 - see that migration's header for exactly who may create
 * one and why). Same generate/copy/revoke logic and the same
 * pages/api/calendar/feed-token.ts endpoint, just always passing
 * `kind: "front_desk"` so it never touches the signed-in admin's own
 * personal token.
 *
 * A CLINIC-WIDE resource, not a personal one - deliberately NOT placed in
 * CalendarFeedPanel.tsx (the Sidebar's personal panel, reachable by any
 * signed-in staff role) or the Sidebar at all. Rendered instead from
 * pages/index.jsx's SettingsView, inside its already admin-only "Admin" tab
 * (Sidebar.tsx's own `roles: ["admin"]` on the "settings" nav entry is what
 * actually gates reaching this screen at all - this component adds no
 * gating of its own beyond that, same as every other control in that tab).
 * The API route's own role check (admin/scheduler) is the real enforcement
 * either way - this component being admin-reachable-only is belt, not
 * suspenders.
 *
 * Styled with CSS custom properties (design tokens), matching
 * CalendarFeedPanel.tsx's own approach, rather than index.jsx's local
 * `COLORS` object (a plain JS constant private to that file, not exported -
 * reusing it here would mean either exporting page-local state out of a
 * Next.js page module, which nothing else in this app does, or duplicating
 * its values and risking drift). Both draw from the same underlying design
 * tokens in practice, so the visual result fits the surrounding "Admin" tab
 * without needing that coupling.
 */
export function FrontDeskFeedPanel() {
  const [state, setState] = useState<FeedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/feed-token?kind=front_desk")
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Couldn't load the front-desk feed status.");
          setState({ active: false, feedUrl: null, webcalUrl: null });
          return;
        }
        setState(data as FeedState);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load the front-desk feed status.");
          setState({ active: false, feedUrl: null, webcalUrl: null });
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/calendar/feed-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "front_desk" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate a new link.");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a new link.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/calendar/feed-token?kind=front_desk", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't revoke this link.");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke this link.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!state?.webcalUrl) return;
    try {
      await navigator.clipboard.writeText(state.webcalUrl);
      setCopied(true);
    } catch {
      // Clipboard access can be denied - the link is still visible as text
      // below, so copying isn't the only way to get it.
    }
  }

  const btnStyle: React.CSSProperties = {
    fontSize: "var(--text-2xs)",
    padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary, transparent)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        background: "var(--color-background-secondary)",
        borderRadius: 12,
        padding: "16px 18px",
        border: "1px solid var(--color-border-tertiary)",
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
        Front desk calendar feed
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12, lineHeight: 1.4 }}>
        A single shared link showing the whole clinic's schedule - times, session types and
        locations only. No client names, no home addresses, and no staff names, even for
        sessions you booked yourself. Anyone with this link can see it, so treat it like a
        front-desk display, not a personal calendar.
      </div>

      {!loaded ? (
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>Loading…</span>
      ) : state?.active && state.webcalUrl ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--color-text-tertiary)",
              lineHeight: 1.4,
              wordBreak: "break-all",
            }}
          >
            {state.webcalUrl}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={state.webcalUrl} style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}>
              Subscribe
            </a>
            <button type="button" onClick={copyLink} disabled={loading} style={btnStyle}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={revoke} disabled={loading} style={btnStyle}>
              {loading ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={loading} style={btnStyle}>
          {loading ? "Generating…" : "Generate front-desk link"}
        </button>
      )}
      {error && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-danger, #c0392b)", marginTop: 8, lineHeight: 1.4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
