import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

/**
 * EXPO_PUBLIC_* is inlined into the shipped JavaScript bundle, exactly as
 * NEXT_PUBLIC_* is readable in a browser. The anon key belongs here; a
 * service-role key never does, and no security decision may be gated on one.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when both are present. A screen renders this instead of the app, so a
 * missing `.env` reads as a sentence rather than as a blank screen or a crash
 * inside createClient.
 */
export const configError: string | null =
  !url || !anonKey
    ? `Missing ${!url ? "EXPO_PUBLIC_SUPABASE_URL" : ""}${!url && !anonKey ? " and " : ""}${
        !anonKey ? "EXPO_PUBLIC_SUPABASE_ANON_KEY" : ""
      }. Copy apps/mobile/.env.example to apps/mobile/.env, fill it in, and restart the dev server with -c.`
    : null;

/**
 * SecureStore is backed by the iOS keychain, which refuses values much over
 * 2 KB - and a Supabase session is larger than that once it carries a JWT. So
 * the session ciphertext lives in AsyncStorage and only its AES key lives in
 * the keychain: reading the AsyncStorage blob off a device gets you nothing
 * without the keychain entry. This is Supabase's documented LargeSecureStore
 * pattern.
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = Crypto.getRandomBytes(256 / 8);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    // The keychain entry goes first: an AsyncStorage blob whose key is gone is
    // unreadable anyway, whereas the reverse order can strand a usable key.
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  }
}

export const supabase = createClient(url ?? "http://invalid.invalid", anonKey ?? "missing", {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    // No URL bar to read a session out of, and leaving it on makes supabase-js
    // reach for browser globals that do not exist here.
    detectSessionInUrl: false,
  },
});

/**
 * supabase-js only refreshes on a timer while the app is in the foreground; a
 * backgrounded timer that keeps firing would burn the refresh token against a
 * dead network. Registered once, at module scope, so it cannot be duplicated
 * by a re-rendering component.
 */
if (!configError) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
