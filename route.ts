import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = must("NEXT_PUBLIC_SUPABASE_URL");
    const ANON_KEY = must("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const SERVICE_ROLE = must("SUPABASE_SERVICE_ROLE_KEY");
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // 1) Token iz header-a (dashboard mora da šalje)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized (missing Bearer token)" },
        { status: 401 }
      );
    }

    // 2) Validacija tokena -> ko je pozvao
    const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await supabaseAnon.auth.getUser(token);
    const user = userRes?.user;

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized (invalid token)" }, { status: 401 });
    }

    // 3) Provera admin role (RLS mora dozvoliti read own profile)
    const supabaseAuthed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profErr } = await supabaseAuthed
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profErr) {
      return NextResponse.json(
        { error: `Role check failed: ${profErr.message}` },
        { status: 500 }
      );
    }
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden (not admin)" }, { status: 403 });
    }

    // 4) Body
    const body = (await req.json()) as { email?: string; tournamentId?: string };
    const email = (body.email || "").trim().toLowerCase();
    const tournamentId = (body.tournamentId || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!tournamentId) {
      return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });
    }

    // 5) Redirect za invite link => /reset?t=...
    const redirectTo = `${SITE_URL}/reset?t=${encodeURIComponent(tournamentId)}`;

    // 6) Service role: invite user (kreira ako ne postoji + šalje email)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (inviteErr) {
      return NextResponse.json(
        { error: `Failed to invite: ${inviteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invited: true,
      userId: inviteData?.user?.id ?? null,
      redirectTo,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}