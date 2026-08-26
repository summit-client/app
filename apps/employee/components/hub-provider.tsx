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
import { SessionGate, useIdentity, useSession } from "@/components/session-provider";
import type { HubRole } from "@/lib/session";

type Status = "loading" | "ready" | "failed";

interface Ctx { status: Status; error: string | null; reload: () => void; version: number }
const HubCtx = React.createContext<Ctx>({ status: "loading", error: null, reload: () => {}, version: 0 });

function HubLoader({ children }: { children: React.ReactNode }) {
  const identity = useIdentity();
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);

  const load = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    loadHub(identity)
      .then(() => setStatus("ready"))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("failed");
      });
  }, [identity]);

  React.useEffect(() => { load(); }, [load]);

  // Mutations bump a version so every screen re-renders off the new snapshot.
  React.useEffect(() => onHubChange(bump), []);

  const value = React.useMemo(
    () => ({ status, error, reload: load, version }),
    [status, error, load, version],
  );

  if (status === "loading") return <p className="sub">Loading…</p>;

  if (status === "failed") {
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">Could not load your records</h1>
        <p className="sub" style={{ marginTop: 8 }}>{error}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={load}>Try again</button>
      </div>
    );
  }

  return <HubCtx.Provider value={value}>{children}</HubCtx.Provider>;
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

export function useHub(): Ctx {
  return React.useContext(HubCtx);
}

/**
 * Run a mutation and surface a write failure instead of losing it.
 *
 * The old code awaited every Supabase call and threw the result away, so a
 * rejected write and a successful one looked identical on screen - the user saw
 * their change, and it was gone on the next load. This puts the failure in
 * front of them.
 */
export function useHubAction(): {
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
} {
  const { reload } = useHub();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof HubWriteError ? e.message : e instanceof Error ? e.message : String(e));
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
