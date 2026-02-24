"use client";

/**
 * PLAYER PAGE (PES League)
 * - Player-only UI (latinica, srpski)
 * - Hero + 3 velika dugmeta + 2 kartice + bottom bar
 * - Turnir selector (opcija A)
 * - Moji mečevi + filter po kolu
 * - Tabela (highlight moj tim)
 * - Read-only žreb (ko je dobio koji tim)
 *
 * ✅ TEMPLATE BG (Opcija C) je rešena preko fixed layer-a (ne body),
 *    tako da globals/layout ne mogu da ga pregaze.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRole } from "@/lib/getRole";

/* =========================
   UI PRIMITIVES (NO DEPS)
   ========================= */

function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

function Card({
  title,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("pl-card", className)}>
      {(title || right) && (
        <div className="pl-card-h">
          <div className="pl-card-title">{title}</div>
          <div>{right}</div>
        </div>
      )}
      <div className="pl-card-b">{children}</div>
    </section>
  );
}

function Button({
  children,
  variant = "solid",
  disabled,
  onClick,
  type = "button",
  title,
  className,
}: {
  children: React.ReactNode;
  variant?: "solid" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "pl-btn",
        variant === "solid" && "pl-btn-solid",
        variant === "outline" && "pl-btn-outline",
        variant === "ghost" && "pl-btn-ghost",
        variant === "danger" && "pl-btn-danger",
        className
      )}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
  className,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={cx("pl-select", className)}
    >
      {children}
    </select>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn";
}) {
  return (
    <span
      className={cx(
        "pl-pill",
        tone === "ok" && "pl-pill-ok",
        tone === "warn" && "pl-pill-warn"
      )}
    >
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="pl-hint">{children}</p>;
}

function Msg({ text }: { text: string }) {
  const isErr =
    text.toLowerCase().startsWith("greška") ||
    text.toLowerCase().includes("error");
  return <p className={cx("pl-msg", isErr && "pl-msg-err")}>{text}</p>;
}

/* =========================
   TYPES
   ========================= */

type PlayerRow = { email: string; name: string | null; role: string };
type TournamentRow = { id: string; name: string; date: string | null };
type TeamRow = { id: string; name: string; logo_url: string | null };
type TournamentTeamRow = { id: string; tournament_id: string; team_id: string };
type TournamentPlayerRow = {
  id: string;
  tournament_id: string;
  player_email: string;
  team_id: string;
};
type MatchRow = {
  id: string;
  tournament_id: string;
  round: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  player1_email: string | null;
  player2_email: string | null;
  player1_score: number | null;
  player2_score: number | null;
  played_at: string | null;
};

type StandingRow = {
  team_id: string;
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

function isPlayed(m: MatchRow) {
  return Boolean(m.played_at);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "(bez datuma)";
  const d = dateStr.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return dateStr;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/* =========================
   PAGE WRAPPER
   ========================= */

export default function Page() {
  return <PlayerPage />;
}

/* =========================
   MAIN PLAYER PAGE
   ========================= */

function PlayerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const [myEmail, setMyEmail] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);

  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(
    null
  );
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamRow[]>(
    []
  );
  const [tournamentPlayers, setTournamentPlayers] =
    useState<TournamentPlayerRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const [msg, setMsg] = useState<string | null>(null);

  // UI state
  const [roundFilter, setRoundFilter] = useState<string>("all");

  // sections refs
  const secResultsRef = useRef<HTMLDivElement | null>(null);
  const secDrawRef = useRef<HTMLDivElement | null>(null);
  const secHistoryRef = useRef<HTMLDivElement | null>(null);
  const secProfileRef = useRef<HTMLDivElement | null>(null);

  const activeTournament = useMemo(
    () => tournaments.find((t) => t.id === activeTournamentId) ?? null,
    [tournaments, activeTournamentId]
  );

  const teamById = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const playerByEmail = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.email, p);
    return m;
  }, [players]);

  const myPlayer = useMemo(() => {
    if (!myEmail) return null;
    return playerByEmail.get(myEmail) ?? null;
  }, [myEmail, playerByEmail]);

  const myTeamId = useMemo(() => {
    if (!myEmail) return null;
    const tp = tournamentPlayers.find((x) => x.player_email === myEmail);
    return tp?.team_id ?? null;
  }, [tournamentPlayers, myEmail]);

  const myTeam = useMemo(() => {
    if (!myTeamId) return null;
    return teamById.get(myTeamId) ?? null;
  }, [myTeamId, teamById]);

  const roundOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) if (m.round) set.add(m.round);
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [matches]);

  const myMatches = useMemo(() => {
    if (!myTeamId) return [];
    return matches.filter(
      (m) => m.home_team_id === myTeamId || m.away_team_id === myTeamId
    );
  }, [matches, myTeamId]);

  const filteredMyMatches = useMemo(() => {
    if (roundFilter === "all") return myMatches;
    const r = Number(roundFilter);
    if (Number.isNaN(r)) return myMatches;
    return myMatches.filter((m) => (m.round ?? -1) === r);
  }, [myMatches, roundFilter]);

  const myStats = useMemo(() => {
    if (!myTeamId)
      return { played: 0, wins: 0, draws: 0, losses: 0, pts: 0, gf: 0, ga: 0 };

    let played = 0,
      wins = 0,
      draws = 0,
      losses = 0,
      pts = 0,
      gf = 0,
      ga = 0;

    for (const m of matches) {
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!isPlayed(m)) continue;
      if (m.player1_score === null || m.player2_score === null) continue;

      const isHome = m.home_team_id === myTeamId;
      const isAway = m.away_team_id === myTeamId;
      if (!isHome && !isAway) continue;

      played += 1;

      const myGoals = isHome ? m.player1_score : m.player2_score;
      const oppGoals = isHome ? m.player2_score : m.player1_score;

      gf += myGoals;
      ga += oppGoals;

      if (myGoals > oppGoals) {
        wins += 1;
        pts += 3;
      } else if (myGoals < oppGoals) {
        losses += 1;
      } else {
        draws += 1;
        pts += 1;
      }
    }

    return { played, wins, draws, losses, pts, gf, ga };
  }, [matches, myTeamId]);

  const standings: StandingRow[] = useMemo(() => {
    const tourTeamIds = new Set(tournamentTeams.map((x) => x.team_id));
    const map = new Map<string, StandingRow>();

    for (const teamId of tourTeamIds) {
      const t = teamById.get(teamId);
      map.set(teamId, {
        team_id: teamId,
        team_name: t?.name ?? teamId,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
      });
    }

    for (const m of matches) {
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!isPlayed(m)) continue;
      if (m.player1_score === null || m.player2_score === null) continue;

      const home = map.get(m.home_team_id);
      const away = map.get(m.away_team_id);
      if (!home || !away) continue;

      home.played += 1;
      away.played += 1;

      home.gf += m.player1_score;
      home.ga += m.player2_score;

      away.gf += m.player2_score;
      away.ga += m.player1_score;

      if (m.player1_score > m.player2_score) {
        home.wins += 1;
        away.losses += 1;
        home.pts += 3;
      } else if (m.player1_score < m.player2_score) {
        away.wins += 1;
        home.losses += 1;
        away.pts += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.pts += 1;
        away.pts += 1;
      }
    }

    const list = Array.from(map.values()).map((r) => ({
      ...r,
      gd: r.gf - r.ga,
    }));
    list.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });

    return list;
  }, [matches, tournamentTeams, teamById]);

  const lastPlayedGlobal = useMemo(() => {
    const played = matches.filter(
      (m) => isPlayed(m) && m.player1_score !== null && m.player2_score !== null
    );
    played.sort((a, b) => (a.played_at ?? "").localeCompare(b.played_at ?? ""));
    return played.length ? played[played.length - 1] : null;
  }, [matches]);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    if (!ref.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* =========================
     LOADERS
     ========================= */

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("email, name, role")
      .order("name", { ascending: true });
    if (error) throw error;
    setPlayers((data ?? []) as PlayerRow[]);
  }

  async function loadTeams() {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, logo_url")
      .order("name", { ascending: true });
    if (error) throw error;
    setTeams((data ?? []) as TeamRow[]);
  }

  async function loadTournaments() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, date")
      .order("date", { ascending: false });
    if (error) throw error;

    const list = (data ?? []) as TournamentRow[];
    setTournaments(list);

    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("playerActiveTournamentId")
        : null;

    // postavi default samo ako još nema aktivnog
    setActiveTournamentId((prev) => {
      if (prev) return prev;
      if (stored && list.some((x) => x.id === stored)) return stored;
      return list.length ? list[0].id : null;
    });
  }

  async function loadTournamentTeams(tournamentId: string) {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select("*")
      .eq("tournament_id", tournamentId);
    if (error) throw error;
    setTournamentTeams((data ?? []) as TournamentTeamRow[]);
  }

  async function loadTournamentPlayers(tournamentId: string) {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*")
      .eq("tournament_id", tournamentId);
    if (error) throw error;
    setTournamentPlayers((data ?? []) as TournamentPlayerRow[]);
  }

  async function loadMatches(tournamentId: string) {
    // ✅ matches.created_at ne postoji -> sortiramo po round pa id
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;
    setMatches((data ?? []) as MatchRow[]);
  }

  async function refreshTournamentData(tournamentId: string) {
    await Promise.all([
      loadTournamentTeams(tournamentId),
      loadTournamentPlayers(tournamentId),
      loadMatches(tournamentId),
    ]);
  }

  /* =========================
     INIT + AUTH
     ========================= */

  useEffect(() => {
    const run = async () => {
      try {
        setFatal(null);
        setMsg(null);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          router.replace("/login");
          return;
        }

        const email = data.session.user.email ?? null;
        setMyEmail(email);

        // admin -> dashboard
        try {
          const role = await getRole();
          if (role === "admin") {
            router.replace("/dashboard");
            return;
          }
        } catch {
          // ignoriši ako getRole pukne
        }

        await Promise.all([loadPlayers(), loadTeams(), loadTournaments()]);
        setLoading(false);
      } catch (e: unknown) {
        const m =
          e instanceof Error ? e.message : typeof e === "string" ? e : "unknown";
        setFatal("Greška pri inicijalizaciji: " + m);
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!activeTournamentId) return;
    setMsg(null);
    refreshTournamentData(activeTournamentId).catch((e: unknown) => {
      const m =
        e instanceof Error ? e.message : typeof e === "string" ? e : "unknown";
      setMsg("Greška pri učitavanju turnira: " + m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTournamentId]);

  useEffect(() => {
    if (!activeTournamentId) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("playerActiveTournamentId", activeTournamentId);
  }, [activeTournamentId]);

  /* =========================
     RENDER HELPERS
     ========================= */

  function matchLine(m: MatchRow) {
    const home = m.home_team_id ? teamById.get(m.home_team_id) : null;
    const away = m.away_team_id ? teamById.get(m.away_team_id) : null;

    const hg = m.player1_score;
    const ag = m.player2_score;
    const score = hg === null || ag === null ? "— : —" : `${hg} : ${ag}`;

    return (
      <div key={m.id} className="pl-item pl-item-tight">
        <div className="pl-item-main">
          <div className="pl-row" style={{ gap: 10, flexWrap: "wrap" }}>
            {m.round ? <Pill>kolo {m.round}</Pill> : null}
            <div className="pl-match">
              <span className="pl-team">
                {home?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={home.logo_url}
                    alt={home.name}
                    width={18}
                    height={18}
                    style={{ borderRadius: 5 }}
                  />
                ) : (
                  <span className="pl-dot" />
                )}
                {home ? home.name : m.home_team_id ?? "—"}
              </span>

              <span className="pl-muted">vs</span>

              <span className="pl-team">
                {away?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={away.logo_url}
                    alt={away.name}
                    width={18}
                    height={18}
                    style={{ borderRadius: 5 }}
                  />
                ) : (
                  <span className="pl-dot" />
                )}
                {away ? away.name : m.away_team_id ?? "—"}
              </span>
            </div>
          </div>

          <div className="pl-item-sub">
            Status: <b>{isPlayed(m) ? "odigrano" : "nije odigrano"}</b>
          </div>
        </div>

        <div className="pl-item-actions">
          <div className="pl-score">{score}</div>
        </div>
      </div>
    );
  }

  /* =========================
     RENDER
     ========================= */

  if (loading) {
    return (
      <div className="pl-wrap pl-phone">
        {/* ✅ template layers */}
        <div className="pl-bg-base" aria-hidden="true" />
        <div className="pl-bg" aria-hidden="true" />

        <div className="pl-content">
          <div className="pl-hero">
            <div className="pl-hero-top">
              <div>
                <div className="pl-brand">PES LIGA</div>
                <div className="pl-brand-sub">Učitavanje...</div>
              </div>
            </div>
          </div>

          <Card title="Loading">
            <Hint>Učitavam podatke...</Hint>
          </Card>

          <div className="pl-footer">PES Liga • Player UI • v1</div>
        </div>

        <GlobalStyles />
      </div>
    );
  }

  return (
    <div className="pl-wrap pl-phone">
      {/* ✅ template layers */}
      <div className="pl-bg-base" aria-hidden="true" />
      <div className="pl-bg" aria-hidden="true" />

      <div className="pl-content">
        <div className="pl-hero">
          <div className="pl-hero-top">
            <div>
              <div className="pl-brand">PES LIGA</div>
              <div className="pl-brand-sub">Sezona 2026 • Player panel</div>
            </div>

            <div className="pl-row">
              <Button
                variant="outline"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                }}
              >
                Logout
              </Button>
            </div>
          </div>

          {/* Turnir selector */}
          <div className="pl-hero-select">
            <div
              className="pl-row"
              style={{
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div className="pl-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <Pill tone="muted">tekući turnir</Pill>
                <Select
                  value={activeTournamentId ?? ""}
                  onChange={(e) => setActiveTournamentId(e.target.value || null)}
                  disabled={tournaments.length === 0}
                  className="pl-select pl-select-wide"
                >
                  <option value="">
                    {tournaments.length ? "Izaberi turnir..." : "Nema turnira"}
                  </option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.date ? `(${formatDate(t.date)})` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="pl-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {activeTournament ? (
                  <Pill tone="ok">{activeTournament.name}</Pill>
                ) : (
                  <Pill tone="warn">nema aktivnog</Pill>
                )}
              </div>
            </div>

            <div className="pl-hero-meta">
              <div className="pl-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="pl-muted">Igrač:</span>{" "}
                <b>{myPlayer?.name ?? "(bez imena)"}</b>
                <span className="pl-muted">•</span>
                <span className="pl-muted">{myEmail ?? "—"}</span>
              </div>

              <div
                className="pl-row"
                style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}
              >
                <span className="pl-muted">Moj tim:</span>{" "}
                <b>{myTeam?.name ?? "—"}</b>
                {!myTeamId && <Pill tone="warn">nema žreba / nema tima</Pill>}
              </div>
            </div>

            {/* 3 velika dugmeta */}
            <div className="pl-big-actions">
              <button
                className="pl-big-btn pl-big-gold"
                onClick={() => scrollTo(secResultsRef)}
                disabled={!activeTournamentId}
              >
                <div className="pl-big-ico">🏆</div>
                <div className="pl-big-txt">
                  <div className="pl-big-title">Rezultati</div>
                  <div className="pl-big-sub">Moji mečevi</div>
                </div>
              </button>

              <button
                className="pl-big-btn pl-big-blue"
                onClick={() => scrollTo(secDrawRef)}
                disabled={!activeTournamentId}
              >
                <div className="pl-big-ico">🔀</div>
                <div className="pl-big-txt">
                  <div className="pl-big-title">Žreb timova</div>
                  <div className="pl-big-sub">Ko je dobio šta</div>
                </div>
              </button>

              <button
                className="pl-big-btn pl-big-copper"
                onClick={() => scrollTo(secHistoryRef)}
                disabled={!activeTournamentId}
              >
                <div className="pl-big-ico">🗓️</div>
                <div className="pl-big-txt">
                  <div className="pl-big-title">Istorija</div>
                  <div className="pl-big-sub">Sezona / arhiva</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {fatal && (
          <Card title="Greška">
            <Msg text={fatal} />
          </Card>
        )}

        {msg && (
          <Card title="Info">
            <Msg text={msg} />
          </Card>
        )}

        {/* 2 kartice */}
        <div className="pl-two">
          <Card
            title={
              <div>
                <div className="pl-sec-title">Tekući turnir</div>
                <div className="pl-sec-sub">
                  {activeTournament
                    ? `${activeTournament.name} • ${formatDate(activeTournament.date)}`
                    : "Izaberi turnir gore"}
                </div>
              </div>
            }
            right={<Pill tone="muted">status</Pill>}
            className="pl-card-mini"
          >
            {!activeTournamentId ? (
              <Hint>Izaberi turnir.</Hint>
            ) : !lastPlayedGlobal ? (
              <Hint>Nema odigranih mečeva još.</Hint>
            ) : (
              <>
                <div className="pl-mini-match">
                  <div className="pl-mini-row">
                    <span className="pl-mini-team">
                      {teamById.get(lastPlayedGlobal.home_team_id ?? "")?.name ??
                        "—"}
                    </span>
                    <span className="pl-mini-score">
                      {lastPlayedGlobal.player1_score ?? "—"}:
                      {lastPlayedGlobal.player2_score ?? "—"}
                    </span>
                    <span className="pl-mini-team">
                      {teamById.get(lastPlayedGlobal.away_team_id ?? "")?.name ??
                        "—"}
                    </span>
                  </div>
                  <div className="pl-mini-sub">Poslednje odigrano</div>
                </div>

                <Button className="pl-wide" onClick={() => scrollTo(secResultsRef)}>
                  Rezultati
                </Button>
              </>
            )}
          </Card>

          <Card
            title={
              <div>
                <div className="pl-sec-title">Trenutna tabela</div>
                <div className="pl-sec-sub">Top 4 (moj tim označen)</div>
              </div>
            }
            right={<Pill tone="muted">pts</Pill>}
            className="pl-card-mini"
          >
            {!activeTournamentId ? (
              <Hint>Izaberi turnir.</Hint>
            ) : tournamentTeams.length === 0 ? (
              <Hint>Nema timova u turniru.</Hint>
            ) : (
              <div className="pl-mini-table">
                {standings.slice(0, 4).map((s, idx) => {
                  const isMine = myTeamId && s.team_id === myTeamId;
                  return (
                    <div
                      key={s.team_id}
                      className={cx("pl-mini-tr", isMine && "pl-mini-mine")}
                    >
                      <div className="pl-muted">{idx + 1}</div>
                      <div className={cx("pl-mini-name", isMine && "pl-mine")}>
                        {s.team_name}
                      </div>
                      <div className="r b">{s.pts}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Moj profil */}
        <div ref={secProfileRef}>
          <Card
            title={
              <div>
                <div className="pl-sec-title">Moj profil</div>
                <div className="pl-sec-sub">
                  Brza statistika (iz odigranih mečeva)
                </div>
              </div>
            }
            right={<Pill tone="muted">player</Pill>}
          >
            {!activeTournamentId ? (
              <Hint>Izaberi aktivni turnir.</Hint>
            ) : !myTeamId ? (
              <Hint>Nemaš dodeljen tim (još nema žreba ili nisi u žrebu).</Hint>
            ) : (
              <>
                <div className="pl-row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <Pill tone="muted">P: {myStats.played}</Pill>
                  <Pill tone="ok">W: {myStats.wins}</Pill>
                  <Pill tone="muted">D: {myStats.draws}</Pill>
                  <Pill tone="warn">L: {myStats.losses}</Pill>
                  <Pill tone="muted">
                    GF/GA: {myStats.gf}/{myStats.ga}
                  </Pill>
                  <Pill tone="ok">PTS: {myStats.pts}</Pill>
                </div>
                <Hint>Napomena: ovo je statistika tima (ne “player skill”).</Hint>
              </>
            )}
          </Card>
        </div>

        {/* Rezultati */}
        <div ref={secResultsRef}>
          <Card
            title={
              <div>
                <div className="pl-sec-title">Rezultati</div>
                <div className="pl-sec-sub">Moji mečevi</div>
              </div>
            }
            right={
              <div className="pl-row" style={{ flexWrap: "wrap" }}>
                <Select
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value)}
                  disabled={!activeTournamentId || roundOptions.length === 0}
                  className="pl-select-round"
                >
                  <option value="all">Sva kola</option>
                  {roundOptions.map((r) => (
                    <option key={r} value={String(r)}>
                      kolo {r}
                    </option>
                  ))}
                </Select>
              </div>
            }
          >
            {!activeTournamentId ? (
              <Hint>Izaberi aktivni turnir.</Hint>
            ) : !myTeamId ? (
              <Hint>Nemaš dodeljen tim u ovom turniru.</Hint>
            ) : filteredMyMatches.length === 0 ? (
              <Hint>Nema mečeva za izabrani filter.</Hint>
            ) : (
              <div className="pl-list">{filteredMyMatches.map(matchLine)}</div>
            )}
          </Card>
        </div>

        {/* Tabela */}
        <Card
          title={
            <div>
              <div className="pl-sec-title">Tabela</div>
              <div className="pl-sec-sub">Računa se iz odigranih mečeva</div>
            </div>
          }
        >
          {!activeTournamentId ? (
            <Hint>Izaberi aktivni turnir.</Hint>
          ) : tournamentTeams.length === 0 ? (
            <Hint>U turniru nema timova.</Hint>
          ) : (
            <div className="pl-table">
              <div className="pl-tr pl-th">
                <div>#</div>
                <div>Tim</div>
                <div className="r">P</div>
                <div className="r">W</div>
                <div className="r">D</div>
                <div className="r">L</div>
                <div className="r">PTS</div>
              </div>

              {standings.map((s, idx) => {
                const isMine = myTeamId && s.team_id === myTeamId;
                return (
                  <div
                    key={s.team_id}
                    className={cx("pl-tr", isMine && "pl-tr-mine")}
                  >
                    <div className="pl-muted">{idx + 1}</div>
                    <div className={cx("b", isMine && "pl-mine")}>
                      {s.team_name}
                    </div>
                    <div className="r">{s.played}</div>
                    <div className="r">{s.wins}</div>
                    <div className="r">{s.draws}</div>
                    <div className="r">{s.losses}</div>
                    <div className="r b">{s.pts}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Žreb */}
        <div ref={secDrawRef}>
          <Card
            title={
              <div>
                <div className="pl-sec-title">Žreb timova</div>
                <div className="pl-sec-sub">Ko je dobio koji tim</div>
              </div>
            }
            right={<Pill tone="muted">read-only</Pill>}
          >
            {!activeTournamentId ? (
              <Hint>Izaberi aktivni turnir.</Hint>
            ) : tournamentPlayers.length === 0 ? (
              <Hint>Još nema žreba za ovaj turnir.</Hint>
            ) : (
              <div className="pl-list">
                {tournamentPlayers.map((tp) => {
                  const playerName =
                    playerByEmail.get(tp.player_email)?.name ?? tp.player_email;
                  const team = teamById.get(tp.team_id);
                  const isMe = myEmail && tp.player_email === myEmail;

                  return (
                    <div
                      key={tp.id}
                      className={cx("pl-item", isMe && "pl-item-me")}
                    >
                      <div className="pl-item-main">
                        <div className="pl-item-title">
                          {playerName}{" "}
                          {isMe ? <span className="pl-me-tag">• ja</span> : null}
                        </div>
                        <div className="pl-item-sub">{tp.player_email}</div>
                      </div>
                      <div className="pl-item-actions">
                        <div className="pl-row" style={{ gap: 10 }}>
                          {team?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={team.logo_url}
                              alt={team.name}
                              width={22}
                              height={22}
                              style={{ borderRadius: 6 }}
                            />
                          ) : (
                            <div className="pl-avatar" />
                          )}
                          <div className="pl-muted">
                            {team ? team.name : tp.team_id}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Istorija */}
        <div ref={secHistoryRef}>
          <Card
            title={
              <div>
                <div className="pl-sec-title">Istorija</div>
                <div className="pl-sec-sub">
                  Sezona / arhiva (sledeća iteracija)
                </div>
              </div>
            }
            right={<Pill tone="muted">coming soon</Pill>}
          >
            <Hint>
              Ovde posle: prethodni turniri, godišnja statistika, hall of fame,
              export…
            </Hint>
          </Card>
        </div>

        {/* Bottom bar */}
        <div className="pl-bottom">
          <button
            className="pl-bottom-btn"
            onClick={() => scrollTo(secProfileRef)}
          >
            <span className="pl-bottom-ico">👤</span>
            <span>Moj profil</span>
          </button>
          <button
            className="pl-bottom-btn"
            onClick={() => scrollTo(secHistoryRef)}
          >
            <span className="pl-bottom-ico">⚽</span>
            <span>Sezona 2026</span>
          </button>
        </div>

        <div className="pl-footer">PES Liga • Player UI • v1</div>
      </div>

      <GlobalStyles />
    </div>
  );
}

/* =========================
   GLOBAL STYLES (INLINE)
   ========================= */

function GlobalStyles() {
  return (
    <style jsx global>{`
      :root {
        --bg: #0b0d12;
        --card: rgba(255, 255, 255, 0.06);
        --bd: rgba(255, 255, 255, 0.12);
        --bd2: rgba(255, 255, 255, 0.16);
        --txt: rgba(255, 255, 255, 0.92);
        --muted: rgba(255, 255, 255, 0.68);
        --ok: #7cffc2;
        --warn: #ffd37c;
        --danger: #ff7c9b;
        --mine: rgba(124, 255, 194, 0.1);
        --me: rgba(124, 215, 255, 0.08);
        --mebd: rgba(124, 215, 255, 0.25);

        /* 20% manje šareno (Opcija C) */
        --gold: rgba(255, 211, 124, 0.16);
        --goldbd: rgba(255, 211, 124, 0.28);
        --blue: rgba(124, 215, 255, 0.14);
        --bluebd: rgba(124, 215, 255, 0.26);
        --copper: rgba(255, 148, 124, 0.14);
        --copperbd: rgba(255, 148, 124, 0.26);
      }

      html,
      body {
        height: 100%;
      }

      /* ✅ NE kačimo template na body (da ga globals/layout ne pregaze) */
      body {
        background: transparent !important;
        color: var(--txt);
      }

      /* ✅ FIX: z-index layering bez negativnih vrednosti */
      .pl-bg-base {
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: var(--bg);
        z-index: 0;
      }

      .pl-bg {
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
            900px 520px at 12% 0%,
            rgba(255, 211, 124, 0.12),
            transparent 55%
          ),
          radial-gradient(
            900px 520px at 88% 12%,
            rgba(124, 215, 255, 0.12),
            transparent 58%
          ),
          radial-gradient(
            900px 520px at 50% 90%,
            rgba(255, 124, 155, 0.08),
            transparent 60%
          ),
          radial-gradient(
            700px 380px at 20% 18%,
            rgba(255, 211, 124, 0.08),
            transparent 60%
          ),
          radial-gradient(
            760px 420px at 85% 28%,
            rgba(124, 215, 255, 0.08),
            transparent 62%
          ),
          radial-gradient(
            780px 520px at 52% 86%,
            rgba(255, 124, 155, 0.06),
            transparent 65%
          );
        z-index: 1;
      }

      .pl-wrap {
        position: relative;
        padding: 18px;
        max-width: 520px;
        margin: 0 auto;
        z-index: 0; /* bitno */
      }

      .pl-phone {
        padding-bottom: 86px;
      }

      /* ✅ content iznad bg */
      .pl-content {
        position: relative;
        z-index: 2;
      }

      .pl-hero {
        position: relative;
        border: 1px solid var(--bd);
        border-radius: 18px;
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.08),
          rgba(255, 255, 255, 0.03)
        );
        padding: 14px;
        margin-bottom: 14px;
      }

      .pl-hero-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .pl-brand {
        font-weight: 950;
        font-size: 22px;
        letter-spacing: 0.6px;
      }
      .pl-brand-sub {
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
      }

      .pl-hero-select {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .pl-hero-meta {
        margin-top: 10px;
      }

      .pl-big-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        margin-top: 12px;
      }
      @media (max-width: 460px) {
        .pl-big-actions {
          grid-template-columns: 1fr;
        }
      }

      .pl-big-btn {
        border: 1px solid var(--bd);
        border-radius: 16px;
        padding: 12px;
        text-align: left;
        display: flex;
        gap: 10px;
        align-items: center;
        cursor: pointer;
        color: var(--txt);
        background: rgba(0, 0, 0, 0.12);
        transition: transform 0.06s ease, background 0.15s ease,
          border-color 0.15s ease;
        user-select: none;
      }
      .pl-big-btn:active {
        transform: scale(0.985);
      }
      .pl-big-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .pl-big-gold {
        background: var(--gold);
        border-color: var(--goldbd);
      }
      .pl-big-blue {
        background: var(--blue);
        border-color: var(--bluebd);
      }
      .pl-big-copper {
        background: var(--copper);
        border-color: var(--copperbd);
      }

      .pl-big-ico {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.16);
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-size: 18px;
      }

      .pl-big-title {
        font-weight: 950;
        font-size: 13px;
      }
      .pl-big-sub {
        color: var(--muted);
        font-size: 12px;
        margin-top: 2px;
      }

      .pl-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 520px) {
        .pl-two {
          grid-template-columns: 1fr;
        }
      }

      .pl-card {
        border: 1px solid var(--bd);
        border-radius: 16px;
        background: var(--card);
        overflow: hidden;
        margin-bottom: 14px;
      }

      .pl-card-mini .pl-card-b {
        padding: 12px;
      }

      .pl-card-h {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .pl-card-title {
        font-weight: 900;
      }

      .pl-card-b {
        padding: 14px;
      }

      .pl-sec-title {
        font-weight: 950;
        font-size: 15px;
      }
      .pl-sec-sub {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .pl-row {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .pl-muted {
        color: var(--muted);
      }

      .pl-select {
        height: 40px;
        padding: 0 12px;
        border-radius: 12px;
        border: 1px solid var(--bd2);
        background: rgba(0, 0, 0, 0.18);
        color: var(--txt);
        outline: none;
        min-width: 200px;
      }

      .pl-select-wide {
        min-width: 260px;
      }
      .pl-select-round {
        min-width: 120px;
      }

      .pl-btn {
        height: 40px;
        padding: 0 12px;
        border-radius: 12px;
        border: 1px solid transparent;
        cursor: pointer;
        font-weight: 900;
        color: var(--txt);
        transition: transform 0.05s ease, opacity 0.15s ease,
          background 0.15s ease, border 0.15s ease;
        user-select: none;
        white-space: nowrap;
      }
      .pl-btn:active {
        transform: scale(0.98);
      }
      .pl-btn:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .pl-btn-solid {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.18);
      }

      .pl-btn-outline {
        background: transparent;
        border-color: rgba(255, 255, 255, 0.18);
      }

      .pl-pill {
        font-size: 12px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: var(--muted);
        background: rgba(0, 0, 0, 0.12);
      }
      .pl-pill-ok {
        color: var(--ok);
        border-color: rgba(124, 255, 194, 0.28);
      }
      .pl-pill-warn {
        color: var(--warn);
        border-color: rgba(255, 211, 124, 0.28);
      }

      .pl-hint {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 13px;
      }
      .pl-msg {
        margin: 10px 0 0;
        font-size: 13px;
        color: var(--muted);
      }
      .pl-msg-err {
        color: var(--danger);
      }

      .pl-list {
        display: grid;
        gap: 10px;
      }

      .pl-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.1);
      }

      .pl-item-tight {
        padding: 10px;
      }

      .pl-item-me {
        border-color: var(--mebd);
        background: var(--me);
      }

      .pl-me-tag {
        font-weight: 950;
        color: rgba(124, 215, 255, 0.9);
        font-size: 12px;
      }

      .pl-item-title {
        font-weight: 950;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 340px;
      }
      .pl-item-sub {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }

      .pl-avatar {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        opacity: 0.7;
      }
      .pl-dot {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        display: inline-block;
        opacity: 0.8;
      }

      .pl-match {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .pl-team {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        font-weight: 950;
      }

      .pl-score {
        min-width: 64px;
        text-align: right;
        font-weight: 950;
      }

      .pl-table {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        overflow: hidden;
      }
      .pl-tr {
        display: grid;
        grid-template-columns: 34px 1fr 44px 44px 44px 44px 60px;
        gap: 10px;
        padding: 12px;
        align-items: center;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.06);
      }
      .pl-tr-mine {
        background: var(--mine);
      }
      .pl-mine {
        color: rgba(124, 255, 194, 0.95);
      }
      .pl-th {
        border-top: none;
        background: rgba(255, 255, 255, 0.06);
        color: var(--muted);
        font-size: 13px;
      }
      .r {
        text-align: right;
      }
      .b {
        font-weight: 950;
      }

      .pl-mini-table {
        display: grid;
        gap: 8px;
      }
      .pl-mini-tr {
        display: grid;
        grid-template-columns: 22px 1fr 48px;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.08);
      }
      .pl-mini-mine {
        background: var(--mine);
      }
      .pl-mini-name {
        font-weight: 950;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pl-mini-match {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        padding: 10px;
        background: rgba(0, 0, 0, 0.08);
      }
      .pl-mini-row {
        display: grid;
        grid-template-columns: 1fr 70px 1fr;
        gap: 10px;
        align-items: center;
      }
      .pl-mini-team {
        font-weight: 950;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pl-mini-score {
        text-align: center;
        font-weight: 950;
      }
      .pl-mini-sub {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .pl-wide {
        width: 100%;
        margin-top: 10px;
      }

      .pl-bottom {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px 12px;
        background: rgba(10, 12, 16, 0.78);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        z-index: 50;
      }
      .pl-bottom-btn {
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        padding: 10px 12px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.06);
        color: var(--txt);
        font-weight: 950;
        cursor: pointer;
      }
      .pl-bottom-ico {
        width: 26px;
        height: 26px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .pl-footer {
        margin: 14px 0 8px;
        color: var(--muted);
        font-size: 12px;
        text-align: center;
      }
    `}</style>
  );
}