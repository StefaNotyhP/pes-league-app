"use client";
export const revalidate = 0;

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ResetPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStatus("working");
        setMsg("Pripremam reset...");

        const mod = await import("../../lib/supabase");
        const supabase = (mod as any).supabase;

        if (!supabase) throw new Error("Supabase nije inicijalizovan (proveri Vercel env varijable).");

        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          if (!cancelled) {
            setStatus("ok");
            setMsg("Reset link je potvrđen. Možeš da postaviš novu lozinku.");
          }
          return;
        }

        const access_token = sp.get("access_token");
        const refresh_token = sp.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;

          if (!cancelled) {
            setStatus("ok");
            setMsg("Sesija postavljena. Možeš da postaviš novu lozinku.");
          }
          return;
        }

        if (!cancelled) {
          setStatus("error");
          setMsg("Nedostaje reset token u linku (code ili access_token).");
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setMsg(e?.message || "Greška pri resetu.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sp]);

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Reset lozinke</h1>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ marginBottom: 10 }}>
          Status:{" "}
          <b>
            {status === "working"
              ? "obrađujem…"
              : status === "ok"
              ? "OK"
              : status === "error"
              ? "greška"
              : "spremno"}
          </b>
        </div>

        <div style={{ opacity: 0.9 }}>{msg}</div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Nazad na login
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.10)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Idi na dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
