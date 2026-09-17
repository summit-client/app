"use client";

/**
 * Loads My HR data before any screen that reads it renders - alongside the hub
 * snapshot rather than behind it.
 *
 * This used to be <HubGate><HrLoader>…</HrLoader></HubGate>, so the HR wave's
 * 13 queries could not begin until the hub's 7 had all come back: a whole
 * round trip of latency on every screen in this portal, bought for nothing,
 * since loadHub() and loadHr() each need only the identity and never each
 * other's result. They start in the same render now.
 *
 * Two properties the old nesting gave for free, kept deliberately:
 *  - nothing renders until BOTH have settled. hr() and the hub's requireSnap()
 *    throw when read before their own load, and several screens read both, so
 *    rendering on the first one to resolve would crash them.
 *  - each loader runs exactly once. loadHub() does not dedupe - the comment in
 *    app/profile/page.tsx records what a double-wrapped gate cost last time.
 */

import * as React from "react";
import { loadHr, onHrChange, HrWriteError } from "@/lib/hr-store";
import { loadHub, onHubChange } from "@/lib/hub";
import { HubCtx, LoadFailed, useSnapshot, type GateCtx } from "@/components/hub-provider";
import { SessionGate } from "@/components/session-provider";
import { toast, toastError } from "@summit/toast";
import type { HubRole } from "@/lib/session";

const HrCtx = React.createContext<GateCtx>({ status: "loading", error: null, reload: () => {}, version: 0 });

function HubAndHrLoader({ children }: { children: React.ReactNode }) {
  const hub = useSnapshot(loadHub, onHubChange);
  const hrSnapshot = useSnapshot(loadHr, onHrChange);

  if (hub.status === "failed") {
    return <LoadFailed title="Could not load your records" error={hub.error} onRetry={hub.reload} />;
  }
  if (hrSnapshot.status === "failed") {
    return <LoadFailed title="Could not load your HR records" error={hrSnapshot.error} onRetry={hrSnapshot.reload} />;
  }
  if (hub.status !== "ready" || hrSnapshot.status !== "ready") return <p className="sub">Loading…</p>;

  // Both contexts, because an HrGate screen may read either store - and
  // useHubAction() without HubCtx would reload nothing after a failed write.
  return (
    <HubCtx.Provider value={hub}>
      <HrCtx.Provider value={hrSnapshot}>{children}</HrCtx.Provider>
    </HubCtx.Provider>
  );
}

/** Identity, then both snapshots in parallel, then the screen. */
export function HrGate({ children, requires }: { children: React.ReactNode; requires?: HubRole[] }) {
  return (
    <SessionGate requires={requires}>
      <HubAndHrLoader>{children}</HubAndHrLoader>
    </SessionGate>
  );
}

export function useHr(): GateCtx {
  return React.useContext(HrCtx);
}

/**
 * Runs a mutation and surfaces a failure rather than losing it.
 *
 * Both halves are announced here rather than at each call site: career, PD,
 * policies, team and recognition all route their writes through this, so one
 * change gives every one of them the same confirmation, and so does the next
 * screen anyone adds. Pass `{ silent: true }` for an action that records
 * something the user did not ask to save - opening a policy, for instance,
 * writes an audit row but is not a save.
 */
export function useHrAction(): {
  run: (fn: () => Promise<unknown>, opts?: { silent?: boolean }) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
} {
  const { reload } = useHr();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async (fn: () => Promise<unknown>, opts: { silent?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reload();
      if (!opts.silent) toast();
    } catch (e: unknown) {
      setError(e instanceof HrWriteError ? e.message : e instanceof Error ? e.message : String(e));
      // The <WriteError> card below carries the detail and stays until it is
      // dismissed; the toast only has to catch the eye of someone who has
      // already looked away from the control they changed.
      toastError();
      reload();
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return { run, busy, error, clearError: () => setError(null) };
}

export function WriteError({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="card card-pad" role="alert" style={{ marginTop: 12, borderColor: "var(--danger, #b3261e)" }}>
      <b>Not saved.</b> <span className="sub">{error}</span>
      <button className="btn ghost" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
