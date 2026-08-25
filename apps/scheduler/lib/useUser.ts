import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type UserRole = "admin" | "scheduler" | "staff" | "client";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
}

/** Reject rather than hang forever if an auth or data call never settles. */
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          "supabase.auth.getSession"
        );
        if (cancelled) return;

        if (!session) {
          setUser(null);
          return;
        }

        const { data: profile, error } = await withTimeout(
          supabase.from("profiles").select("*").eq("id", session.user.id).single(),
          8000,
          "profiles lookup"
        );
        if (cancelled) return;

        if (error) console.error("[useUser] profile lookup failed", error);
        setUser(profile ? (profile as AppUser) : null);
      } catch (err) {
        // Never leave the app stuck behind the _app.tsx loading gate.
        console.error("[useUser] auth load failed", err);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return { user, loading, signOut };
}
