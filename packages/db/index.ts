import { createBrowserClient } from "@supabase/ssr";

const isProduction = process.env.NODE_ENV === "production";

/**
 * The single Supabase browser client shared by every portal.
 *
 * Do NOT call createBrowserClient anywhere else in an app that imports this.
 * Two clients in one document share a storage key, an auth Web Lock and a
 * refresh ticker: they contend on every auth call, and whichever one performs
 * the login writes the session cookie with its own settings. That is what
 * produced the duplicate host-only `sb-<ref>-auth-token` cookie on
 * scheduler.summitclient.io and the permanent "Loading..." deadlock.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Must be a positive number. If this reaches navigatorLock as undefined,
      // `if (acquireTimeout > 0)` is false, no abort timer is armed, and a
      // contended lock waits forever with no error and no network request.
      lockAcquireTimeout: 5000,
    },
    cookies: {
      getAll() {
        if (typeof document === "undefined") return [];
        return document.cookie.split("; ").filter(Boolean).map((c) => {
          const [name, ...rest] = c.split("=");
          return { name, value: rest.join("=") };
        });
      },
      setAll(cookies) {
        if (typeof document === "undefined") return;
        const isHttps = location.protocol === "https:";
        cookies.forEach(({ name, value, options }) => {
          const opts = { ...options, path: "/" };
          let str = `${name}=${value}`;
          // Session must be readable across *.summitclient.io. Without this the
          // default writer sets a host-only cookie that shadows the real one.
          if (isProduction) str += `; Domain=.summitclient.io`;
          str += `; Path=${opts.path}`;
          if (opts.maxAge) str += `; Max-Age=${opts.maxAge}`;
          str += `; SameSite=${opts.sameSite || "Lax"}`;
          if (isHttps) str += `; Secure`;
          document.cookie = str;
        });
      },
    },
  }
);
