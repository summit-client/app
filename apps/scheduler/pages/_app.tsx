import "../styles/globals.css";
import { useUser } from "../lib/useUser";
import { UserContext } from "../lib/UserContext";
import { AppNav } from '@summit/nav';

export default function App({ Component, pageProps }) {
  const { user, loading, signOut } = useUser();

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