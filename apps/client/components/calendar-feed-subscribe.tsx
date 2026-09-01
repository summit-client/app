import { useEffect, useState } from "react";
import styles from "../styles/design-b.module.css";

type FeedState = {
  active: boolean;
  feedUrl: string | null;
  webcalUrl: string | null;
};

/**
 * "Subscribe to calendar feed" control for pages/appointments.tsx -
 * generates/revokes the signed-in family's own `calendar_feed_tokens` row
 * (migration 0044, `pages/api/calendar/feed-token.ts`) and shows the
 * resulting `webcal://` link once one exists, next to the existing
 * one-time-download link. Rendering it is entirely the caller's call: not
 * shown at all during admin "view as" (see the render site in
 * pages/appointments.tsx) - a feed link is inherently tied to a real
 * family's own account, and generating one while looking at their data as
 * an admin doesn't mean anything (there's no "admin's version" of a
 * family's calendar subscription) - matching how every other mutation in
 * this app treats admin view-as (lib/admin-view-as.ts's header).
 */
export function CalendarFeedSubscribe() {
  const [state, setState] = useState<FeedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/feed-token")
      .then((res) => res.json())
      .then((data: FeedState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your calendar feed status.");
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
      // Clipboard access can be denied (permissions, a non-HTTPS context in
      // dev) - the link is still selectable as visible text below, so
      // copying isn't the only way to get it.
    }
  }

  if (state === null) {
    // Still loading the initial GET - render nothing rather than a flash
    // of "Subscribe" that would immediately flip to the revoke state if
    // one already exists.
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      {state.active && state.webcalUrl ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <a href={state.webcalUrl} className={styles.textButton} style={{ whiteSpace: "nowrap" }}>
              Subscribe in Calendar
            </a>
            <button type="button" onClick={copyLink} className="btn secondary" disabled={loading}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" onClick={revoke} className="btn secondary" disabled={loading}>
              Revoke
            </button>
          </div>
          <span style={{ fontSize: 11, color: "var(--faint)", textAlign: "right", maxWidth: 260 }}>
            Anyone with this link can see your appointments - revoke it if you ever share it by
            mistake.
          </span>
        </>
      ) : (
        <button type="button" onClick={generate} className="btn secondary" disabled={loading}>
          {loading ? "Generating…" : "Subscribe to calendar feed"}
        </button>
      )}
      {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
