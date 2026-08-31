import { useEffect } from "react";
import "../styles/globals.css";
import { useUser } from "../lib/useUser";
import { UserContext } from "../lib/UserContext";
import { explainProblem } from "../lib/explainProblem";
import { AppNav } from '@summit/nav';
import { initSettings } from "@summit/settings";

export default function App({ Component, pageProps }) {
  const { user, problem, loading, signOut } = useUser();

  // Working hours (calendar.workStart/workEnd/workDays) are org settings now,
  // not the calendar tab's own never-persisted state - first use of
  // @summit/settings in this app. Called once identity is known, same
  // timing @summit/settings' own doc comment asks for (see apps/data and
  // apps/employee's SessionProvider).
  useEffect(() => { if (user) void initSettings(); }, [user]);

  if (loading) return <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>Loading...</div>;

  // A signed-in user whose account this portal can't serve (no clinic, no
  // usable profile, or a role @summit/portals' ACCESS.scheduler doesn't
  // admit) gets an explanation instead of the shell rendering into an
  // RLS-emptied blank page - see the "RLS returns empty sets, not errors"
  // trap in CLAUDE.md. proxy.ts only verifies a session exists; it has no
  // way to know the role, so this is the actual gate.
  if (problem) {
    const { title, detail } = explainProblem(problem);
    return (
      <>
        <AppNav activeKey="scheduler" role={user?.role} />
        <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px", fontFamily: "Inter, sans-serif" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{title}</h1>
          <p style={{ color: "#6B7280", fontSize: 15 }}>{detail}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <AppNav activeKey="scheduler" role={user?.role} />
      <UserContext.Provider value={user}>
        <Component {...pageProps} signOut={signOut} />
      </UserContext.Provider>
    </>
  );
}