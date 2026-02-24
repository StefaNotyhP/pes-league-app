import type { SupabaseClient } from "@supabase/supabase-js";

type FixtureRow = {
  id: string;
  tournament_id: string;
  round_number: 1 | 2;
  match_number: number;
  home_team_id: string | null;
  away_team_id: string | null;
  is_bye: boolean;
  source: "manual" | "auto_reverse";
  created_at: string;
};

export async function loadFixtures(supabase: SupabaseClient, tournamentId: string): Promise<FixtureRow[]> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round_number", { ascending: true })
    .order("match_number", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FixtureRow[];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export async function saveRound1AndGenerateRound2(
  supabase: SupabaseClient,
  tournamentId: string,
  drafts: { match_number: number; home_team_id: string; away_team_id: string }[]
) {
  const cleaned = (drafts ?? []).map((d) => ({
    match_number: d.match_number,
    home_team_id: (d.home_team_id ?? "").trim(),
    away_team_id: (d.away_team_id ?? "").trim(),
  }));

  // minimal validation
  for (const d of cleaned) {
    if (!d.home_team_id || !d.away_team_id) {
      throw new Error(`Popuni oba tima za meč ${d.match_number}.`);
    }
    if (d.home_team_id === d.away_team_id) {
      throw new Error(`Ne može isti tim vs isti tim (meč ${d.match_number}).`);
    }
  }

  const used = cleaned.flatMap((d) => [d.home_team_id, d.away_team_id]);
  if (uniq(used).length !== used.length) {
    throw new Error("Isti tim je upisan više puta u Kolu 1. Svaki tim mora biti tačno jednom.");
  }

  // reset (simpler than upsert)
  const { error: delErr } = await supabase.from("fixtures").delete().eq("tournament_id", tournamentId);
  if (delErr) throw delErr;

  const round1Rows = cleaned.map((d) => ({
    tournament_id: tournamentId,
    round_number: 1 as const,
    match_number: d.match_number,
    home_team_id: d.home_team_id,
    away_team_id: d.away_team_id,
    is_bye: false,
    source: "manual" as const,
  }));

  const round2Rows = cleaned.map((d) => ({
    tournament_id: tournamentId,
    round_number: 2 as const,
    match_number: d.match_number,
    home_team_id: d.away_team_id,
    away_team_id: d.home_team_id,
    is_bye: false,
    source: "auto_reverse" as const,
  }));

  const { error: insErr } = await supabase.from("fixtures").insert([...round1Rows, ...round2Rows]);
  if (insErr) throw insErr;

  return true;
}