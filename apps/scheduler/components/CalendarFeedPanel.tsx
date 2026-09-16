import { useEffect, useState } from "react";

type FeedState = {
  active: boolean;
  feedUrl: string | null;
  webcalUrl: string | null;
};

/**
 * "My calendar feed" - a compact, collapsible control for the signed-in
 * scheduling staff member's own personal calendar_feed_tokens row
 * (migration 0044 + 0070, pages/api/calendar/feed-token.ts). Same
 * generate/revoke/copy logic as
 * apps/client/components/calendar-feed-subscribe.tsx, reshaped to fit a
 * narrow (228px) sidebar column instead of a full page section, and styled
 * to match Sidebar.tsx's own inline-style conventions (design tokens via
 * CSS custom properties, no CSS module) rather than that file's
 * styles/design-b.module.css, which this app doesn't use.
 *
 * A personal feature, not an admin one - rendered for ANY signed-in staff
 * role this portal admits (admin/scheduler/clinician; see
 * @summit/portals' ACCESS.scheduler), not gated further here. The one thing
 * this component can't control is whether the caller actually HAS a
 * resolvable staff_id (employment_records) - if not, the API tells it so in
 * plain language (feed-token.ts's NO_STAFF_LINK case) and that message is
 * shown as-is rather than a generic failure.
 */
export function CalendarFeedPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FeedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/feed-token")
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          // NO_STAFF_LINK (or any other explained failure) - the route's own
          // message is already specific and human-readable; show it as-is.
          setError(data.error || "Couldn't load your calendar feed status.");
          setState({ active: false, feedUrl: null, webcalUrl: null });
          return;
        }
        setState(data as FeedState);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load your calendar feed status.");
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
      const res = await fetch("/api/calendar/feed-token", { method: "POST" });
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
      const res = await fetch("/api/calendar/feed-token", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't revoke your link.");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke your link.");
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

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-2xs)",
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase" as const,
  };

  const btnStyle: React.CSSProperties = {
    fontSize: "var(--text-2xs)",
    padding: "5px 8px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary, transparent)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid var(--color-border-tertiary)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 2px",
        }}
        aria-expanded={open}
      >
        <span style={labelStyle}>My calendar feed</span>
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {!loaded ? (
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>
              Loading…
            </span>
          ) : state?.active && state.webcalUrl ? (
            <>
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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a href={state.webcalUrl} style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}>
                  Subscribe
                </a>
                <button type="button" onClick={copyLink} disabled={loading} style={btnStyle}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" onClick={revoke} disabled={loading} style={btnStyle}>
                  Revoke
                </button>
              </div>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
                Anyone with this link can see your own upcoming sessions - revoke it if you ever
                share it by mistake.
              </span>
            </>
          ) : (
            <button type="button" onClick={generate} disabled={loading} style={btnStyle}>
              {loading ? "Generating…" : "Generate link"}
            </button>
          )}
          {error && (
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-danger, #c0392b)", lineHeight: 1.4 }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
