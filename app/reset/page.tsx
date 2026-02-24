"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export default function ResetPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const code = sp.get("code"); // supabase redirect param (PKCE)
  const type = sp.get("type"); // invite | recovery | magiclink (varira)
  const tournamentId = sp.get("t"); // mi šaljemo ?t=...

  const [step, setStep] = useState<"exchanging" | "setpw" | "done" | "error">(
    "exchanging"
  );
  const [msg, setMsg] = useState<string>("Učitavam link...");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  const title = useMemo(() => {
    if (type === "invite") return "Aktivacija naloga";
    if (type === "recovery") return "Reset lozinke";
    return "Prijava / Aktivacija";
  }, [type]);

  useEffect(() => {
    const run = async () => {
      try {
        setMsg("Validiram link...");

        // 1) Ako nema code, ovo nije validan Supabase email redirect
        if (!code) {
          setStep("error");
          setMsg("Neispravan link (nema code parametra). Otvori link iz emaila ponovo.");
          return;
        }

        // 2) Exchange code -> session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStep("error");
          setMsg("Greška pri logovanju preko linka: " + error.message);
          return;
        }

        // 3) Sad user ima session, može da postavi password
        setStep("setpw");
        setMsg("Postavi novu lozinku.");
      } catch (e: any) {
        setStep("error");
        setMsg("Greška: " + (e?.message ?? "unknown"));
      }
    };

    run();
  }, [code]);

  async function savePassword() {
    if (saving) return;

    if (pw1.length < 6) {
      setMsg("Lozinka mora imati bar 6 karaktera.");
      return;
    }
    if (pw1 !== pw2) {
      setMsg("Lozinke se ne poklapaju.");
      return;
    }

    setSaving(true);
    setMsg(null as any);

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setSaving(false);
      setMsg("Greška pri snimanju lozinke: " + error.message);
      return;
    }

    // ✅ zapamti aktivni turnir (ako je prosleđen)
    if (tournamentId) {
      try {
        window.localStorage.setItem("activeTournamentId", tournamentId);
      } catch {}
    }

    setStep("done");
    setMsg("✅ Sačuvano. Prebacujem te na dashboard...");

    // mali delay da user vidi poruku
    setTimeout(() => {
      router.replace("/dashboard");
    }, 600);
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1 className="h1">{title}</h1>

        {step === "exchanging" && <p className="muted">{msg}</p>}

        {step === "error" && (
          <>
            <p className="err">{msg}</p>
            <p className="muted">
              Tip: proveri da je Auth Redirect URL u Supabase podešen i da otvaraš
              poslednji email link.
            </p>
          </>
        )}

        {step === "setpw" && (
          <>
            <p className="muted">
              {type === "invite"
                ? "Dobio si invite. Postavi lozinku da aktiviraš nalog."
                : "Postavi novu lozinku."}
            </p>

            <div className="form">
              <input
                className="inp"
                type="password"
                placeholder="Nova lozinka (min 6)"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
              <input
                className="inp"
                type="password"
                placeholder="Ponovi lozinku"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
              <button className={cx("btn", saving && "btnDis")} onClick={savePassword} disabled={saving}>
                {saving ? "Čuvam..." : "Sačuvaj lozinku"}
              </button>
              {msg ? <p className={msg.startsWith("Greška") ? "err" : "muted"}>{msg}</p> : null}
            </div>
          </>
        )}

        {step === "done" && <p className="ok">{msg}</p>}
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: radial-gradient(900px 500px at 20% 0%, rgba(124, 215, 255, 0.18), transparent 55%),
            radial-gradient(800px 400px at 90% 20%, rgba(255, 124, 155, 0.14), transparent 55%),
            #0b0d12;
          color: rgba(255, 255, 255, 0.92);
        }
        .card {
          width: 100%;
          max-width: 520px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          padding: 18px;
        }
        .h1 {
          margin: 0 0 10px;
          font-size: 20px;
          font-weight: 900;
        }
        .muted {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.4;
        }
        .err {
          margin: 10px 0 0;
          color: #ff7c9b;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 700;
        }
        .ok {
          margin: 10px 0 0;
          color: #7cffc2;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 800;
        }
        .form {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }
        .inp {
          height: 42px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.20);
          color: rgba(255, 255, 255, 0.92);
          outline: none;
        }
        .btn {
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.92);
          font-weight: 900;
          cursor: pointer;
        }
        .btnDis {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}