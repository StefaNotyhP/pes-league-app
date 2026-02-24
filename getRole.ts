import { supabase } from "@/lib/supabase";

export async function getRole(): Promise<"admin" | "player" | null> {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const email = sessionData.session?.user?.email?.toLowerCase() ?? null;
  if (!email) return null;

  const { data, error } = await supabase
    .from("players")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;

  const role = (data?.role ?? null) as "admin" | "player" | null;
  return role;
}