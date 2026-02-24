"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function parseHashTokens() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return null;

  const p = new URLSearchParams(hash);
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");

  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        // 1) PKCE flow (?code=...)
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // 2) Implicit flow (#access_token=...&refresh_token=...)
        const tokens = parseHashTokens();
        if (tokens) {
          const { error } = await supabase.auth.setSession(tokens);
          if (error) throw error;
        }

        // 3) Ako imamo sesiju → dashboard
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/dashboard");
          return;
        }

        // fallback
        router.replace("/login?err=no_session");
      } catch (e: any) {
        router.replace("/login?err=callback");
      }
    };

    run();
  }, [router]);

  return <div style={{ padding: 24 }}>Prijavljivanje...</div>;
}
