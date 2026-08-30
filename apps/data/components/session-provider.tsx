"use client";

/**
 * Identity for the clinician portal, resolved once and shared.
 *
 * apps/data's proxy.ts only verifies that someone is signed in - it has no
 * idea whether their `profiles.role` is one this portal serves. A scheduler
 * or client-role user who reaches it today gets the full shell and blank
 * screens, because RLS filters every query to nothing rather than refusing
 * outright. `<SessionGate>` is the missing role gate: it renders a loading
 * state while identity resolves, an explanation if the role is not admitted,
 * or the screen. Mirrors apps/employee/components/session-provider.tsx.
 */

import * as React from "react";
import { AppNav } from "@summit/nav";
import { signOutUrl } from "@summit/portals";
import {
  explainProblem, gate, getIdentity, refreshIdentity, type Identity,
} from "@summit/session";
import { initSettings, refreshSettings } from "@summit/settings";

interface Ctx { identity: Identity | null; loading: boolean; reload: () => void }

const SessionCtx = React.createContext<Ctx>({ identity: null, loading: true, reload: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((fresh = false) => {
    setLoading(true);
    void (fresh ? refreshSettings() : initSettings());
    (fresh ? refreshIdentity() : getIdentity())
      .then((i) => setIdentity(gate(i, "clinician")))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const value = React.useMemo(
    () => ({ identity, loading, reload: () => load(true) }),
    [identity, loading, load],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  return React.useContext(SessionCtx);
}

/** The signed-in person's identity, for screens rendered inside a SessionGate.
 *  Throws if used outside one - that is a programming error, not a runtime
 *  condition, so it should be loud. */
export function useIdentity(): Identity {
  const { identity } = useSession();
  if (!identity) throw new Error("useIdentity() used outside a <SessionGate>");
  return identity;
}

/** Wraps a screen. Nothing inside renders until identity resolves, and a
 *  ROLE_EXCLUDED (or any other) problem replaces the screen with an
 *  explanation instead of letting it load into an RLS-emptied shell. */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const { identity, loading } = useSession();

  if (loading || !identity) return <p className="sub">Loading…</p>;

  if (identity.problem) {
    const { title, detail } = explainProblem(identity.problem, "clinician");
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">{title}</h1>
        <p className="sub" style={{ marginTop: 8 }}>{detail}</p>
      </div>
    );
  }

  return <>{children}</>;
}

/** The cross-portal bar, with the viewer's role once it resolves. */
export function PortalBar(props: { activeKey: string; settingsHref?: string }) {
  const { identity } = useSession();
  return <AppNav {...props} role={identity?.appRole} signOutHref={signOutUrl()} />;
}
