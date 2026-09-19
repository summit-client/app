import { useMemo, useState } from "react";
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
import { useTheme } from "@/lib/use-theme";
import type { Theme } from "@/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => sheet(theme), [theme]);

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
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={theme.colors.muted}
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
        {busy ? (
          <ActivityIndicator color={theme.colors.accentInk} />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>
      <View style={styles.spacer} />
    </KeyboardAvoidingView>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center",
      padding: t.size.space6,
      gap: t.size.space3,
      backgroundColor: t.colors.bg,
    },
    title: { fontSize: t.size.text4xl, fontWeight: "700", color: t.colors.ink },
    subtitle: { fontSize: t.size.textBase, color: t.colors.muted, marginBottom: t.size.space3 },
    input: {
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      color: t.colors.ink,
      borderRadius: t.size.radiusMd,
      paddingHorizontal: t.size.space4,
      paddingVertical: t.size.space3,
      fontSize: t.size.textMd,
    },
    error: { color: t.colors.danger, fontSize: t.size.textSm, lineHeight: 20 },
    button: {
      backgroundColor: t.colors.accent,
      borderRadius: t.size.radiusMd,
      paddingVertical: t.size.space4,
      alignItems: "center",
      marginTop: t.size.space1,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.colors.accentInk, fontSize: t.size.textMd, fontWeight: "600" },
    spacer: { height: t.size.space10 },
  });
