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
  clearIdentity, explainProblem, getSession, refreshSession, subscribeToAuthChanges,
  type HubRole, type Session,
} from "@/lib/session";
import {
  clearSettings, getSetting, initSettings, onSettingsChange, refreshSettings, resolve,
} from "@summit/settings";
import { applyLogoColors, type LogoTone } from "@summit/design";

interface Ctx { session: Session | null; loading: boolean; reload: () => void }

const SessionCtx = React.createContext<Ctx>({ session: null, loading: true, reload: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((fresh = false) => {
    setLoading(true);
    void (fresh ? refreshSettings() : initSettings());
    (fresh ? refreshSession() : getSession())
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Identity and settings are both module-level caches latched on first read,
  // so a tab left open while the user signed out (or signed in as someone
  // else) elsewhere kept serving the previous person's session and their
  // org/role/user settings - which in this portal means another employee's HR
  // records. Signing out clears without re-resolving: refreshSession() would
  // fire getUser() for someone who has just left.
  React.useEffect(() => subscribeToAuthChanges((event) => {
    if (event === "SIGNED_OUT") {
      clearIdentity();
      clearSettings();
      setSession(null);
      return;
    }
    load(true);
  }), [load]);

  const value = React.useMemo(
    () => ({ session, loading, reload: () => load(true) }),
    [session, loading, load],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  return React.useContext(SessionCtx);
}

/** appearance.logo1/2/3 → --logo-1/2/3. Only forwards a value when the
 *  clinic actually has an override row (source !== "default") — an org
 *  with none set must resolve exactly to tokens.css's static default, not
 *  a copy of it pushed inline (see @summit/design's applyLogoColors()
 *  comment for why). */
function overrideOnly(key: string): string | null {
  const r = resolve(key);
  return r.source === "default" ? null : String(r.effective);
}

/**
 * Applies the settings that belong on <html> — density, text size and the
 * accessibility preferences, plus this clinic's per-tenant logo colour
 * overrides — mirroring apps/data's `SettingsEffects`. Its own small
 * component rather than part of SessionProvider's identity-loading effect,
 * because it re-runs on every settings change, not on every identity one.
 * grove.tsx (Volcano, SummitPeaks, ScoreRing, TheClimb) is this app's only
 * current consumer of --logo-1/2/3 (--logo-2 only, in practice); see
 * @summit/design's applyLogoColors() for the contrast note before adding
 * a new one.
 */
export function BrandingEffects() {
  React.useEffect(() => {
    const apply = () => {
      // This app's own app.css implements data-density, data-textsize,
      // data-line-spacing, data-large-controls, data-focus-rings and
      // data-reduce-motion, but nothing here ever set them, so density and
      // every accessibility preference - the ones the settings screen
      // describes as "yours alone; follows you across devices" - silently
      // did nothing in this portal while working in apps/data. Same six
      // attributes apps/data's SettingsEffects sets, minus its run.tapSize
      // clause, which is a data-portal setting.
      const el = document.documentElement;
      el.setAttribute("data-density", String(getSetting("appearance.density")).toLowerCase());
      el.setAttribute("data-textsize", String(getSetting("a11y.textSize")).toLowerCase());
      el.toggleAttribute("data-reduce-motion", getSetting("a11y.reduceMotion") === true);
      el.toggleAttribute("data-line-spacing", getSetting("a11y.lineSpacing") === true);
      el.toggleAttribute("data-large-controls", getSetting("a11y.largerControls") === true);
      el.toggleAttribute("data-focus-rings", getSetting("a11y.focusIndicators") === true);
      applyLogoColors({
        logo1: overrideOnly("appearance.logo1"),
        logo2: overrideOnly("appearance.logo2"),
        logo3: overrideOnly("appearance.logo3"),
      } satisfies Partial<Record<LogoTone, string | null>>);
    };
    apply();
    return onSettingsChange(apply);
  }, []);
  return null;
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
