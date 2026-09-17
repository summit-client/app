"use client";

/**
 * Loads the hub's data once, before any screen renders.
 *
 * This is what lets hub.ts keep synchronous reads. Screens call getProgress()
 * inline during render, as they always have; the difference is that the data
 * behind it now came from Supabase rather than from this browser's localStorage.
 *
 * <HubGate> is the contract: nothing inside it renders until the snapshot is
 * loaded, so requireSnap() cannot throw in a screen that is properly wrapped.
 */

import * as React from "react";
import { loadHub, onHubChange } from "@/lib/hub";
import { HubWriteError } from "@/lib/hub-backend";
import { SessionGate, useIdentity } from "@/components/session-provider";
import { toast, toastError } from "@summit/toast";
import type { HubRole, Session } from "@/lib/session";

type Status = "loading" | "ready" | "failed";

export interface GateCtx { status: Status; error: string | null; reload: () => void; version: number }
export const HubCtx = React.createContext<GateCtx>({ status: "loading", error: null, reload: () => {}, version: 0 });

/**
 * The loading half of a gate: runs `load(identity)` and tracks it.
 *
 * Shared with hr-provider.tsx, which needs two of these running side by side.
 * `load` and `subscribe` have to be module-level functions - an inline arrow
 * changes identity every render and would re-run the load forever.
 */
export function useSnapshot(
  load: (identity: Session) => Promise<void>,
  subscribe: (fn: () => void) => () => void,
): GateCtx {
  const identity = useIdentity();
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);

  const run = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    load(identity)
      .then(() => setStatus("ready"))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("failed");
      });
  }, [identity, load]);

  React.useEffect(() => { run(); }, [run]);

  // Mutations bump a version so every screen re-renders off the new snapshot.
  React.useEffect(() => subscribe(bump), [subscribe]);

  return React.useMemo(
    () => ({ status, error, reload: run, version }),
    [status, error, run, version],
  );
}

/** A snapshot that could not be loaded at all - the screen behind it would
 *  throw on its first synchronous read, so it never renders. */
export function LoadFailed({ title, error, onRetry }: { title: string; error: string | null; onRetry: () => void }) {
  return (
    <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
      <h1 className="h-page">{title}</h1>
      <p className="sub" style={{ marginTop: 8 }}>{error}</p>
      <button className="btn" style={{ marginTop: 12 }} onClick={onRetry}>Try again</button>
    </div>
  );
}

function HubLoader({ children }: { children: React.ReactNode }) {
  const hub = useSnapshot(loadHub, onHubChange);

  if (hub.status === "loading") return <p className="sub">Loading…</p>;
  if (hub.status === "failed") {
    return <LoadFailed title="Could not load your records" error={hub.error} onRetry={hub.reload} />;
  }

  return <HubCtx.Provider value={hub}>{children}</HubCtx.Provider>;
}

/** Wrap a screen. Identity resolves first, then the hub snapshot loads, then
 *  the screen renders - so neither can be missing inside it. */
export function HubGate({ children, requires }: { children: React.ReactNode; requires?: HubRole[] }) {
  return (
    <SessionGate requires={requires}>
      <HubLoader>{children}</HubLoader>
    </SessionGate>
  );
}

export function useHub(): GateCtx {
  return React.useContext(HubCtx);
}

/**
 * Run a mutation and surface a write failure instead of losing it.
 *
 * The old code awaited every Supabase call and threw the result away, so a
 * rejected write and a successful one looked identical on screen - the user saw
 * their change, and it was gone on the next load. This puts the failure in
 * front of them.
 *
 * Both halves are announced here rather than at each call site: a screen that
 * routes a write through this never has to remember to confirm it, and one
 * that is written next year gets the same confirmation for free. Pass
 * `{ silent: true }` for an action that records something without the user
 * having asked to save anything.
 */
export function useHubAction(): {
  run: (fn: () => Promise<unknown>, opts?: { silent?: boolean }) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
} {
  const { reload } = useHub();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async (fn: () => Promise<unknown>, opts: { silent?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (!opts.silent) toast();
    } catch (e: unknown) {
      setError(e instanceof HubWriteError ? e.message : e instanceof Error ? e.message : String(e));
      // The <WriteError> card carries the detail and stays until dismissed;
      // the toast only has to catch the eye of someone who already looked away.
      toastError();
      // The snapshot was updated optimistically in some paths; re-read so the
      // screen shows what is actually stored rather than what we hoped.
      reload();
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return { run, busy, error, clearError: () => setError(null) };
}

/** Renders a write failure, for screens that use useHubAction(). */
export function WriteError({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="card card-pad" role="alert" style={{ marginTop: 12, borderColor: "var(--danger, #b3261e)" }}>
      <b>Not saved.</b> <span className="sub">{error}</span>
      <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
