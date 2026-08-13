import { useState } from "react";
import { supabase } from '@summit/db';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async () => {
  setLoading(true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setMessage(error.message);
  else window.location.href = "/";
  setLoading(false);
};

  const handleMagicLink = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setMessage(error.message);
    else setMessage("Magic link sent — check your email.");
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ marginBottom: 24 }}>Summit Scheduler</h2>

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" }}
      />

                {mode === "password" && (
        <>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </>
      )}

      {mode === "password" ? (
        <>
          <button onClick={handlePasswordLogin} disabled={loading}
            style={{ width: "100%", padding: 10, background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 12 }}>
            {loading ? "Logging in..." : "Log In"}
          </button>
          <button onClick={() => setMode("magic")}
            style={{ width: "100%", padding: 10, background: "transparent", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
            Send Magic Link instead
          </button>
        </>
      ) : (
        <>
          <button onClick={handleMagicLink} disabled={loading}
            style={{ width: "100%", padding: 10, background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 12 }}>
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
          <button onClick={() => setMode("password")}
            style={{ width: "100%", padding: 10, background: "transparent", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
            Use Password instead
          </button>
        </>
      )}

      {message && <p role="status" aria-live="polite" style={{ marginTop: 16, color: "#666" }}>{message}</p>}
    </div>
  );
}
