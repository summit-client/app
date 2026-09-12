"use client";

/**
 * Loads My HR data before any screen that reads it renders.
 *
 * Mirrors components/hub-provider.tsx deliberately - two loaders with the same
 * shape is easier to hold in your head than one clever one, and the two stores
 * have genuinely different lifecycles.
 */

import * as React from "react";
import { loadHr, onHrChange, HrWriteError } from "@/lib/hr-store";
import { HubGate } from "@/components/hub-provider";
import { useIdentity } from "@/components/session-provider";
import type { HubRole } from "@/lib/session";

type Status = "loading" | "ready" | "failed";
interface Ctx { status: Status; error: string | null; reload: () => void; version: number }

const HrCtx = React.createContext<Ctx>({ status: "loading", error: null, reload: () => {}, version: 0 });

function HrLoader({ children }: { children: React.ReactNode }) {
  const identity = useIdentity();
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);

  const load = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    loadHr(identity)
      .then(() => setStatus("ready"))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("failed");
      });
  }, [identity]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => onHrChange(bump), []);

  const value = React.useMemo(() => ({ status, error, reload: load, version }), [status, error, load, version]);

  if (status === "loading") return <p className="sub">Loading…</p>;
  if (status === "failed") {
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">Could not load your HR records</h1>
        <p className="sub" style={{ marginTop: 8 }}>{error}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={load}>Try again</button>
      </div>
    );
  }
  return <HrCtx.Provider value={value}>{children}</HrCtx.Provider>;
}

/** Identity, then the hub snapshot, then the HR snapshot, then the screen.
 *  Several screens read both stores, so this nests rather than competing. */
export function HrGate({ children, requires }: { children: React.ReactNode; requires?: HubRole[] }) {
  return (
    <HubGate requires={requires}>
      <HrLoader>{children}</HrLoader>
    </HubGate>
  );
}

export function useHr(): Ctx {
  return React.useContext(HrCtx);
}

/** Runs a mutation and surfaces a failure rather than losing it. */
export function useHrAction(): {
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
} {
  const { reload } = useHr();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reload();
    } catch (e: unknown) {
      setError(e instanceof HrWriteError ? e.message : e instanceof Error ? e.message : String(e));
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
