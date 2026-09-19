import type { User } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { configError, supabase } from "@/lib/supabase";

const AuthContext = createContext<{ user: User | null }>({ user: null });
export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  if (configError) return <ConfigErrorScreen message={configError} />;
  return <AuthedLayout />;
}

function AuthedLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // getUser(), not getSession(): it verifies the token against the auth
    // server instead of trusting whatever is in local storage.
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!user && !onLogin) router.replace("/login");
    if (user && onLogin) router.replace("/");
  }, [ready, user, segments, router]);

  if (!ready) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ user }}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.centre}>
      <Text style={styles.errorTitle}>Not configured</Text>
      <Text style={styles.errorBody}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: "600" },
  errorBody: { fontSize: 15, lineHeight: 22, textAlign: "center" },
});
