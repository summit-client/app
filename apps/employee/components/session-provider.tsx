"use client";

/**
 * Identity for the whole app, resolved once and shared.
 *
 * `SessionGate` is what screens wrap themselves in. It renders one of three
 * things: a loading state while identity resolves, an explanation if identity
 * is unusable, or the screen. That third case is the only one where a screen's
 * own code runs, so screens never have to handle a null user.
 */

import * as React from "react";
import {
  explainProblem, getSession, refreshSession,
  type HubRole, type Session,
} from "@/lib/session";

interface Ctx { session: Session | null; loading: boolean; reload: () => void }

const SessionCtx = React.createContext<Ctx>({ session: null, loading: true, reload: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((fresh = false) => {
    setLoading(true);
    (fresh ? refreshSession() : getSession())
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const value = React.useMemo(
    () => ({ session, loading, reload: () => load(true) }),
    [session, loading, load],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  return React.useContext(SessionCtx);
}

/** The signed-in person's identity, for screens rendered inside a SessionGate.
 *  Throws if used outside one - that is a programming error, not a runtime
 *  condition, so it should be loud. */
export function useIdentity(): Session {
  const { session } = useSession();
  if (!session) throw new Error("useIdentity() used outside a <SessionGate>");
  return session;
}

/**
 * Wraps a screen. `requires` gates on the hub role - omit it for screens
 * everyone sees.
 */
export function SessionGate({
  children,
  requires,
}: {
  children: React.ReactNode;
  requires?: HubRole[];
}) {
  const { session, loading } = useSession();

  if (loading || !session) return <p className="sub">Loading…</p>;

  if (session.problem) {
    const { title, detail } = explainProblem(session.problem);
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">{title}</h1>
        <p className="sub" style={{ marginTop: 8 }}>{detail}</p>
      </div>
    );
  }

  if (requires && !requires.includes(session.role)) {
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">Not available to you</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          This area is for {requires.map((r) => r.toLowerCase()).join(" and ")} accounts.
          {session.isPreview ? " In preview you can switch role from My Profile to demo it." : ""}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
