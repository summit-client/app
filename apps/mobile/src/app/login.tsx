import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // error.message only. A Supabase error object can carry `details` and
    // `hint` quoting the row it failed on, so the object itself never reaches
    // a log or a screen.
    if (error) setError(error.message);
    setBusy(false);
    // On success the root layout's auth listener redirects; nothing to do here.
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Summit</Text>
      <Text style={styles.subtitle}>Sign in with your Summit account.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={signIn}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, (busy || !email || !password) && styles.buttonDisabled]}
        disabled={busy || !email || !password}
        onPress={signIn}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </TouchableOpacity>
      <View style={styles.spacer} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 15, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#c7c7cc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: "#b00020", fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: "#1f6feb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  spacer: { height: 40 },
});
