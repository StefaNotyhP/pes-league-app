"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      if (!data.session) {
        setMsg("Nema session (Auth nije vratio session).");
        return;
      }

      router.replace("/dashboard");
    } catch (e: any) {
      setMsg(e?.message || "Failed to fetch (network/config).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Login</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>Unesi email i lozinku za prijavu.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <input
          type="email"
          placeholder="tvoj@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />

        <input
          type="password"
          placeholder="Lozinka"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />

        <button
          onClick={handleLogin}
          disabled={!email || !password || loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #111",
            cursor: !email || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Prijavljujem..." : "Prijavi se"}
        </button>
      </div>

      {msg && <p style={{ marginTop: 12, color: "crimson" }}>Greška: {msg}</p>}
    </div>
  );
}
