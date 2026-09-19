import { useCallback, useEffect, useState } from "react";
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

type Profile = { role: string | null; clinic_id: string | null };

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Signed in</Text>

      <Field label="Email" value={email ?? "—"} />
      <Field label="Role" value={profile?.role ?? "null"} />
      <Field label="Clinic" value={profile?.clinic_id ?? "null"} />

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 16 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  field: { gap: 2 },
  label: { fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280" },
  value: { fontSize: 17 },
  note: { fontSize: 14, lineHeight: 20, color: "#b00020" },
  button: {
    borderWidth: 1,
    borderColor: "#c7c7cc",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
