"use client";

/**
 * Identity for apps/web's one authenticated screen (/profile). Mirrors
 * apps/data/components/session-provider.tsx and
 * apps/employee/components/session-provider.tsx, but deliberately skips
 * gate(): apps/web is not a PortalKey (@summit/portals) and this page has no
 * per-role admission question - every signed-in role may view their own
 * profile, so the only problems worth blocking on are the identity-level
 * ones (not signed in, no profile row, no clinic), never ROLE_EXCLUDED.
 */

import * as React from "react";
import {
  explainProblem, getIdentity, refreshIdentity, type Identity,
} from "@summit/session";
import { initSettings } from "@summit/settings";

interface Ctx { identity: Identity | null; loading: boolean; reload: () => void }

const SessionCtx = React.createContext<Ctx>({ identity: null, loading: true, reload: () => {} });

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((fresh = false) => {
    setLoading(true);
    (fresh ? refreshIdentity() : getIdentity())
      .then(setIdentity)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);
  // First use of @summit/settings in this app - same call/timing every
  // other portal's session bootstrap already uses (see apps/client's own
  // _app.tsx). Only consumer today is the Availability card's
  // calendar.workStart/workEnd/workDays/gridIncrementMinutes read.
  React.useEffect(() => { if (identity) void initSettings(); }, [identity]);

  const value = React.useMemo(
    () => ({ identity, loading, reload: () => load(true) }),
    [identity, loading, load],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  return React.useContext(SessionCtx);
}

/** The signed-in person's identity, for content rendered inside a
 *  ProfileGate. Throws if used outside one - a programming error, not a
 *  runtime condition. */
export function useIdentity(): Identity {
  const { identity } = useSession();
  if (!identity) throw new Error("useIdentity() used outside a <ProfileGate>");
  return identity;
}

/** Wraps the page content. Nothing inside renders until identity resolves,
 *  and NOT_SIGNED_IN/NO_PROFILE/NO_CLINIC replace it with an explanation
 *  instead of an RLS-emptied shell - same "say something" rule every other
 *  portal's gate follows. The PortalKey explainProblem() takes only matters
 *  for ROLE_EXCLUDED, which this page never produces (no gate() call
 *  above), so the placeholder key here is inert. */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const { identity, loading } = useSession();

  if (loading || !identity) return <p className="sub">Loading…</p>;

  if (identity.problem) {
    const { title, detail } = explainProblem(identity.problem, "client");
    return (
      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <h1 className="h-page">{title}</h1>
        <p className="sub" style={{ marginTop: 8 }}>{detail}</p>
      </div>
    );
  }

  return <>{children}</>;
}
