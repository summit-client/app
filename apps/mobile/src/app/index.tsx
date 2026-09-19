import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/use-theme";
import type { Theme } from "@/lib/theme";

type Profile = { role: string | null; clinic_id: string | null };

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => sheet(theme), [theme]);

  const load = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setNote(userError?.message ?? "No signed-in user.");
      setLoading(false);
      return;
    }
    setEmail(userData.user.email ?? null);

    // maybeSingle, not single: RLS answers a forbidden read with an empty set
    // rather than an error, and `single()` would turn that into a row-count
    // error that reads like a bug in the query. An empty result here means
    // either no profiles row or no policy admitting this user - worth saying
    // out loud rather than rendering blank.
    const { data, error } = await supabase
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (error) setNote(error.message);
    else if (!data) setNote("No profiles row is readable for this account.");
    else setProfile(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Called directly, unlike the web portals. Their rule - never call signOut(),
  // navigate to signOutUrl() - exists because four browser portals share one
  // .summitclient.io cookie that only apps/web may clear. This app shares no
  // cookie with anything; its session lives in its own encrypted storage, so
  // the central endpoint has nothing to end here.
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + theme.size.space6 }]}
    >
      <Text style={styles.title}>Signed in</Text>

      <Field theme={theme} label="Email" value={email ?? "—"} />
      <Field theme={theme} label="Role" value={profile?.role ?? "null"} />
      <Field theme={theme} label="Clinic" value={profile?.clinic_id ?? "null"} />

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = useMemo(() => sheet(theme), [theme]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    page: { backgroundColor: t.colors.bg },
    screen: { padding: t.size.space6, gap: t.size.space4 },
    centre: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.bg,
    },
    title: {
      fontSize: t.size.text3xl,
      fontWeight: "700",
      color: t.colors.ink,
      marginBottom: t.size.space2,
    },
    field: { gap: 2 },
    label: {
      fontSize: t.size.textSm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: t.colors.muted,
    },
    value: { fontSize: t.size.textLg, color: t.colors.ink },
    note: { fontSize: t.size.textSm, lineHeight: 20, color: t.colors.danger },
    button: {
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: t.size.radiusMd,
      paddingVertical: t.size.space4,
      alignItems: "center",
      marginTop: t.size.space6,
    },
    buttonText: { fontSize: t.size.textMd, fontWeight: "600", color: t.colors.ink },
  });
