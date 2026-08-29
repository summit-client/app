import { useEffect } from "react";
import "../styles/globals.css";
import { useUser } from "../lib/useUser";
import { UserContext } from "../lib/UserContext";
import { AppNav } from '@summit/nav';
import { initSettings } from "@summit/settings";

export default function App({ Component, pageProps }) {
  const { user, loading, signOut } = useUser();

  // Working hours (calendar.workStart/workEnd/workDays) are org settings now,
  // not the calendar tab's own never-persisted state - first use of
  // @summit/settings in this app. Called once identity is known, same
  // timing @summit/settings' own doc comment asks for (see apps/data and
  // apps/employee's SessionProvider).
  useEffect(() => { if (user) void initSettings(); }, [user]);

  if (loading) return <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>Loading...</div>;

  return (
    <>
      <AppNav activeKey="scheduler" role={user?.role} />
      <UserContext.Provider value={user}>
        <Component {...pageProps} signOut={signOut} />
      </UserContext.Provider>
    </>
  );
}