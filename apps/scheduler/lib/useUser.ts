import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { admits, signOutUrl } from "@summit/portals";
import { supabase } from "./supabase";

/**
 * The one role vocabulary, matching `profiles.role` as migration 0001 defines
 * it and as `auth_role()` / `auth_is_staff()` read it.
 *
 * The scheduler used to carry its own set, with a "staff" role the database
 * never recognised and without "supervisor" or "clinician", which it does. A
 * clinician signing into the scheduler was an unhandled role.
 */
export type UserRole =
  | "admin"
  | "scheduler"
  | "supervisor"
  | "clinician"
  | "client";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
  /**
   * Already present on every row this hook fetches (`select("*")` on
   * profiles) - just not typed until now. Every insert into clients, staff,
   * sessions, calendars, locations, session_types, client_availability or
   * staff_availability must set this (migration 0013 made it not-null and
   * RLS-checked), since none of those tables' schemas predate multi-tenant
   * scoping the way this column does.
   */
  clinic_id: string;
}

/**
 * Why the signed-in person can't use this portal, when that's true. RLS
 * filters queries to empty results rather than erroring (see CLAUDE.md's
 * "RLS returns empty sets, not errors" trap), so without this a wrong-role
 * or clinic-less account just sees the full shell with nothing in it -
 * indistinguishable from "no data yet."
 */
export type UserProblem = "NO_PROFILE" | "NO_CLINIC" | "ROLE_EXCLUDED";

/** @summit/portals' ACCESS.scheduler - the one place that owns which roles
 *  this portal serves. Read via admits() rather than duplicating the list. */
const PORTAL_KEY = "scheduler" as const;

/** Reject rather than hang forever if a call never settles. */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [problem, setProblem] = useState<UserProblem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      try {
        if (!session) {
          setUser(null);
          setProblem(null);
          return;
        }

        const { data: profile, error } = await withTimeout(
          supabase.from("profiles").select("*").eq("id", session.user.id).single(),
          8000,
          "profiles lookup"
        );
        if (cancelled) return;

        if (error) console.error("[useUser] profile lookup failed", error);

        if (!profile) {
          setUser(null);
          setProblem("NO_PROFILE");
          return;
        }

        const p = profile as AppUser;
        setUser(p);
        setProblem(
          !p.clinic_id ? "NO_CLINIC" :
          !admits(PORTAL_KEY, p.role) ? "ROLE_EXCLUDED" :
          null
        );
      } catch (err) {
        console.error("[useUser] profile load failed", err);
        if (!cancelled) {
          setUser(null);
          setProblem("NO_PROFILE");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Initial read. Safe to call getSession here -- we are not inside an auth
    // callback, so the auth lock is not already held by our own caller.
    (async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          "supabase.auth.getSession"
        );
        if (!cancelled) await applySession(session);
      } catch (err) {
        console.error("[useUser] initial auth load failed", err);
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Never call supabase.auth.* synchronously in here. This callback is
      // invoked while gotrue holds the auth lock, so a nested getSession()
      // waits on a lock its own caller owns -- a self-deadlock. That was the
      // cause of the permanent "Loading..." hang. Use the session we are
      // handed, and defer any further supabase work off the callback stack.
      setTimeout(() => {
        if (!cancelled) applySession(session);
      }, 0);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Navigates to apps/web's own signout endpoint rather than calling
  // supabase.auth.signOut() on this app's own client: this client's default
  // cookie writer can only clear a cookie scoped to this host, not the
  // shared `.summitclient.io` cookie every portal reads - see
  // @summit/portals's signOutUrl() for the full reasoning. Calling signOut()
  // here used to look like it worked (this tab cleared, redirected to
  // login) while leaving that shared cookie valid for every other portal.
  const signOut = () => {
    window.location.href = signOutUrl();
  };

  return { user, problem, loading, signOut };
}
