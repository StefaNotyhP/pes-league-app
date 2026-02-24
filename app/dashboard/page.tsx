"use client";

/**
 * PES League Dashboard (single-file, no external UI deps)
 * - Keeps your logic
 * - Adds Player UI (non-admin): My profile + My matches UX
 * - Adds tournament selector in topbar
 * - Highlights my team in standings
 * - ErrorBoundary so page can’t go blank
 *
 * ✅ MVP "SAFE FLOW":
 *   1) Admin adds players
 *   2) Admin sends invites (magic link)
 *   3) Admin LOCKS roster
 *   4) Only then -> Draw
 *   5) Fixtures -> Matches -> Auto-assign
 *
 * ✅ IMPORTANT:
 * - Invite is REMOVED from draw step (no more "invite during draw").
 * - Roster lock is stored in localStorage per tournament (no DB changes needed).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRole } from "@/lib/getRole";
import { loadFixtures, saveRound1AndGenerateRound2 } from "@/lib/fixtures";

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
}: {
  children: React.ReactNode;
  variant?: "solid" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  title?: string;
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
        variant === "danger" && "pl-btn-danger"
      )}
    >
      {children}
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
  inputMode,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      className={cx("pl-input", className)}
    />
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
   ERROR BOUNDARY (ANTI-BLANK)
   ========================= */

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; err?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, err };
  }
  componentDidCatch(err: any) {
    // eslint-disable-next-line no-console
    console.error("Dashboard error:", err);
  }
  render() {
    if (this.state.hasError) {
      const msg =
        this.state.err?.message ??
        String(this.state.err ?? "Unknown error");
      return (
        <div className="pl-wrap">
          <div className="pl-topbar">
            <div>
              <div className="pl-title">PES League</div>
              <div className="pl-sub">
                Dashboard crashed (nije “prazno” – evo greške)
              </div>
            </div>
          </div>
          <Card title="Greška u renderu" className="pl-danger-box">
            <p className="pl-msg pl-msg-err">{msg}</p>
            <Hint>Otvori DevTools → Console i videćeš isti error.</Hint>
          </Card>
          <GlobalStyles />
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================
   TYPES
   ========================= */

type PlayerRow = { email: string; name: string | null; role: string };
type TournamentRow = {
  id: string;
  name: string;
  date: string | null;
  created_at?: string;
};
type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
  created_at?: string;
};
type TournamentTeamRow = {
  id: string;
  tournament_id: string;
  team_id: string;
  created_at?: string;
};
type TournamentPlayerRow = {
  id: string;
  tournament_id: string;
  player_email: string;
  team_id: string;
  created_at?: string;
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
  created_at?: string;
};

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return "(bez datuma)";
  return dateStr;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isAdmin(role: string | null) {
  return role === "admin";
}

function isPlayed(m: MatchRow) {
  return Boolean(m.played_at);
}

function safeConfirm(msg: string) {
  if (typeof window === "undefined") return false;
  return window.confirm(msg);
}

function clampInt(v: string, min: number, max: number) {
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  const c = Math.max(min, Math.min(max, Math.trunc(n)));
  return String(c);
}

/* =========================
   STANDINGS
   ========================= */

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

/* =========================
   ScheduleCard (fixtures)
   ========================= */

function ScheduleCard({
  isAdminUser,
  tournamentId,
  teamOptions,
  fixtures,
  fixturesLoading,
  fixturesError,
  onSaveRound1,
  onResetFixtures,
  onGenerateMatchesFromFixtures,
}: {
  isAdminUser: boolean;
  tournamentId: string | null;
  teamOptions: { id: string; name: string }[];
  fixtures: FixtureRow[];
  fixturesLoading: boolean;
  fixturesError: string | null;
  onSaveRound1: (drafts: {
    match_number: number;
    home_team_id: string;
    away_team_id: string;
  }[]) => Promise<void>;
  onResetFixtures: () => Promise<void>;
  onGenerateMatchesFromFixtures: () => Promise<void>;
}) {
  const round1 = useMemo(
    () =>
      fixtures
        .filter((f) => f.round_number === 1)
        .sort((a, b) => a.match_number - b.match_number),
    [fixtures]
  );
  const round2 = useMemo(
    () =>
      fixtures
        .filter((f) => f.round_number === 2)
        .sort((a, b) => a.match_number - b.match_number),
    [fixtures]
  );

  const scheduleLocked = round1.length > 0;
  const matchCount = Math.floor(teamOptions.length / 2);

  const [drafts, setDrafts] = useState(() =>
    Array.from({ length: matchCount }, (_, i) => ({
      match_number: i + 1,
      home_team_id: "",
      away_team_id: "",
    }))
  );

  useEffect(() => {
    setDrafts(
      Array.from({ length: Math.floor(teamOptions.length / 2) }, (_, i) => ({
        match_number: i + 1,
        home_team_id: "",
        away_team_id: "",
      }))
    );
  }, [teamOptions.length, tournamentId]);

  function setDraft(
    idx: number,
    patch: Partial<(typeof drafts)[number]>
  ) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  }

  const teamName = (id: string | null) => {
    if (!id) return "—";
    return teamOptions.find((t) => t.id === id)?.name ?? id;
  };

  return (
    <Card
      title={
        <div>
          <div className="pl-sec-title">Raspored (fixtures)</div>
          <div className="pl-sec-sub">
            Kolo 1 ručno, Kolo 2 auto (swap domaćin/gost).
          </div>
        </div>
      }
      right={
        isAdminUser && tournamentId ? (
          <div className="pl-row">
            {scheduleLocked ? (
              <>
                <Button onClick={onGenerateMatchesFromFixtures}>
                  Generate matches iz fixtures
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      !safeConfirm(
                        "Reset fixtures? (obrišaće se Kolo 1 i Kolo 2)"
                      )
                    )
                      return;
                    onResetFixtures();
                  }}
                >
                  Reset fixtures
                </Button>
              </>
            ) : (
              <Button
                onClick={() => onSaveRound1(drafts)}
                disabled={teamOptions.length < 2}
              >
                Sačuvaj Kolo 1 + generiši Kolo 2
              </Button>
            )}
          </div>
        ) : null
      }
    >
      {!tournamentId ? (
        <Hint>Izaberi aktivni turnir.</Hint>
      ) : teamOptions.length < 2 ? (
        <Hint>Dodaj bar 2 tima u turnir.</Hint>
      ) : (
        <>
          {fixturesLoading && <Hint>Učitavam fixtures...</Hint>}
          {fixturesError && <Msg text={fixturesError} />}

          <div className="pl-grid">
            <div className="pl-col">
              <div className="pl-subtitle">Kolo 1</div>

              {!scheduleLocked ? (
                <div className="pl-stack">
                  {drafts.map((d, idx) => (
                    <div key={d.match_number} className="pl-fixture-row">
                      <div className="pl-fixture-num">Meč {d.match_number}</div>

                      <Select
                        value={d.home_team_id}
                        onChange={(e) =>
                          setDraft(idx, { home_team_id: e.target.value })
                        }
                      >
                        <option value="">Domaćin</option>
                        {teamOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>

                      <div className="pl-vs">vs</div>

                      <Select
                        value={d.away_team_id}
                        onChange={(e) =>
                          setDraft(idx, { away_team_id: e.target.value })
                        }
                      >
                        <option value="">Gost</option>
                        {teamOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pl-stack">
                  {round1.map((f) => (
                    <div key={f.id} className="pl-line">
                      <b>Meč {f.match_number}:</b> {teamName(f.home_team_id)} vs{" "}
                      {teamName(f.away_team_id)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pl-col">
              <div className="pl-subtitle">Kolo 2 (auto)</div>

              {!scheduleLocked ? (
                <Hint>Biće dostupno nakon snimanja Kola 1.</Hint>
              ) : (
                <div className="pl-stack">
                  {round2.map((f) => (
                    <div key={f.id} className="pl-line">
                      <b>Meč {f.match_number}:</b> {teamName(f.home_team_id)} vs{" "}
                      {teamName(f.away_team_id)}
                    </div>
                  ))}
                </div>
              )}

              {teamOptions.length % 2 === 1 && (
                <Hint>
                  Napomena: neparan broj timova. (BYE logiku možemo dodati
                  sledeće.)
                </Hint>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* =========================
   MAIN PAGE
   ========================= */

export default function DashboardPage() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [pMsg, setPMsg] = useState<string | null>(null);

  // ✅ INVITE STATES
  const [sendInviteOnAdd, setSendInviteOnAdd] = useState(true);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [invitingEmail, setInvitingEmail] = useState<string | null>(null);
  const [invitingAll, setInvitingAll] = useState(false);

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(
    null
  );

  // ✅ ROSTER LOCK (MVP: localStorage)
  const [rosterLocked, setRosterLocked] = useState(false);

  const [tName, setTName] = useState("");
  const [tDate, setTDate] = useState("");
  const [savingTournament, setSavingTournament] = useState(false);
  const [tMsg, setTMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsMsg, setTeamsMsg] = useState<string | null>(null);

  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamRow[]>(
    []
  );
  const [ttMsg, setTtMsg] = useState<string | null>(null);
  const [teamToAddId, setTeamToAddId] = useState<string>("");

  const [tournamentPlayers, setTournamentPlayers] = useState<
    TournamentPlayerRow[]
  >([]);
  const [tpMsg, setTpMsg] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);

  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [fixturesError, setFixturesError] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [mMsg, setMMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [doubleRoundRobin, setDoubleRoundRobin] = useState(false);

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editHomeGoals, setEditHomeGoals] = useState<string>("");
  const [editAwayGoals, setEditAwayGoals] = useState<string>("");
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);

  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(
    null
  );
  const [editTournamentName, setEditTournamentName] = useState("");

  // player UI filters
  const [roundFilter, setRoundFilter] = useState<string>("all");

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

  const teamToPlayerEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const tp of tournamentPlayers) m.set(tp.team_id, tp.player_email);
    return m;
  }, [tournamentPlayers]);

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

  const visibleMatches = useMemo(() => {
    if (isAdmin(role)) return matches;
    if (!myTeamId) return [];
    return matches.filter(
      (m) => m.home_team_id === myTeamId || m.away_team_id === myTeamId
    );
  }, [matches, myTeamId, role]);

  const roundOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) if (m.round) set.add(m.round);
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [matches]);

  const filteredVisibleMatches = useMemo(() => {
    if (roundFilter === "all") return visibleMatches;
    const r = Number(roundFilter);
    if (Number.isNaN(r)) return visibleMatches;
    return visibleMatches.filter((m) => (m.round ?? -1) === r);
  }, [visibleMatches, roundFilter]);

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

  const tournamentTeamOptions = useMemo(() => {
    return tournamentTeams
      .map((row) => {
        const t = teamById.get(row.team_id);
        return t ? { id: t.id, name: t.name } : { id: row.team_id, name: row.team_id };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tournamentTeams, teamById]);

  /* =========================
     ROSTER LOCK (localStorage)
     ========================= */

  function rosterKey(tournamentId: string) {
    return `rosterLocked:${tournamentId}`;
  }

  useEffect(() => {
    if (!activeTournamentId) {
      setRosterLocked(false);
      return;
    }
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(rosterKey(activeTournamentId));
    setRosterLocked(v === "1");
  }, [activeTournamentId]);

  function lockRoster() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const onlyPlayers = players.filter((p) => p.role === "player");
    if (onlyPlayers.length < 2) {
      setInviteMsg(null);
      setTpMsg("Greška: treba bar 2 igrača pre zaključavanja rostera.");
      return;
    }

    const ok = safeConfirm(
      "Zaključati roster? Posle ovoga (MVP) ne bi trebalo dodavati/brisati igrače za ovaj turnir."
    );
    if (!ok) return;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(rosterKey(activeTournamentId), "1");
    }
    setRosterLocked(true);
    setTpMsg("✅ Roster zaključan. Sledeće: Žreb.");
  }

  function unlockRoster() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const ok = safeConfirm(
      "Otključati roster? (Dozvoliće da menjaš igrače, ali može da pokvari doslednost turnira.)"
    );
    if (!ok) return;

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(rosterKey(activeTournamentId));
    }
    setRosterLocked(false);
    setTpMsg("Roster otključan.");
  }

  /* =========================
     ✅ INVITE HELPERS
     ========================= */

  async function invitePlayer(email: string) {
  if (!isAdmin(role)) return;

  if (!activeTournamentId) {
    setInviteMsg("Greška (invite): izaberi aktivni turnir prvo.");
    return;
  }

  setInviteMsg(null);
  setInvitingEmail(email);

  try {
    // ✅ uzmi access token iz trenutne sesije
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const token = sess.session?.access_token;
    if (!token) throw new Error("Nema session tokena (uloguj se ponovo).");

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // ✅ OVO JE KLJUČNO
      },
      body: JSON.stringify({ email, tournamentId: activeTournamentId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Invite failed");

    setInviteMsg(`✅ Invite poslat: ${email}`);
  } catch (e: any) {
    setInviteMsg("Greška (invite): " + (e?.message ?? "unknown"));
  } finally {
    setInvitingEmail(null);
  }
}

async function inviteAllPlayers() {
  if (!isAdmin(role)) return;

  if (!activeTournamentId) {
    setInviteMsg("Greška (invite): izaberi aktivni turnir prvo.");
    return;
  }

  const onlyPlayers = players.filter((p) => p.role === "player");
  if (onlyPlayers.length === 0) return;

  const ok = safeConfirm(`Poslati invite za ${onlyPlayers.length} igrača?`);
  if (!ok) return;

  setInviteMsg(null);
  setInvitingAll(true);

  try {
    // ✅ uzmi token jednom (brže + stabilnije)
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const token = sess.session?.access_token;
    if (!token) throw new Error("Nema session tokena (uloguj se ponovo).");

    for (const p of onlyPlayers) {
      setInvitingEmail(p.email);

      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: p.email, tournamentId: activeTournamentId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${p.email}: ${json?.error || "Invite failed"}`);
    }

    setInviteMsg("✅ Invite batch završen.");
  } catch (e: any) {
    setInviteMsg("Greška (invite all): " + (e?.message ?? "unknown"));
  } finally {
    setInvitingAll(false);
    setInvitingEmail(null);
  }
}

  /* =========================
     LOADERS
     ========================= */

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("email, name, role")
      .order("name", { ascending: true });

    if (error) {
      setPMsg("Greška pri učitavanju igrača: " + error.message);
      return;
    }
    setPlayers((data ?? []) as PlayerRow[]);
  }

  async function loadTournaments() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, date, created_at")
      .order("date", { ascending: false });

    if (error) {
      setTMsg("Greška pri učitavanju turnira: " + error.message);
      return;
    }

    const list = (data ?? []) as TournamentRow[];
    setTournaments(list);

    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("activeTournamentId")
        : null;

    if (!activeTournamentId) {
      if (stored && list.some((x) => x.id === stored)) setActiveTournamentId(stored);
      else if (list.length > 0) setActiveTournamentId(list[0].id);
    }
  }

  async function loadTeams() {
    setTeamsMsg(null);
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, logo_url, created_at")
      .order("name", { ascending: true });

    if (error) {
      setTeamsMsg("Greška pri učitavanju timova: " + error.message);
      return;
    }
    setTeams((data ?? []) as TeamRow[]);
  }

  async function loadTournamentTeams(tournamentId: string) {
    setTtMsg(null);
    const { data, error } = await supabase
      .from("tournament_teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) {
      setTtMsg("Greška pri učitavanju timova turnira: " + error.message);
      return;
    }
    setTournamentTeams((data ?? []) as TournamentTeamRow[]);
  }

  async function loadTournamentPlayers(tournamentId: string) {
    setTpMsg(null);
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) {
      setTpMsg("Greška pri učitavanju žreba: " + error.message);
      return;
    }
    setTournamentPlayers((data ?? []) as TournamentPlayerRow[]);
  }

  async function loadMatches(tournamentId: string) {
    setMMsg(null);
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMMsg("Greška pri učitavanju mečeva: " + error.message);
      return;
    }
    setMatches((data ?? []) as MatchRow[]);
  }

  async function loadFixturesForTournament(tournamentId: string) {
    setFixturesError(null);
    setFixturesLoading(true);
    try {
      const data = await loadFixtures(supabase, tournamentId);
      setFixtures((data ?? []) as FixtureRow[]);
    } catch (e: any) {
      setFixturesError(e?.message ?? "Greška pri učitavanju fixtures.");
    } finally {
      setFixturesLoading(false);
    }
  }

  async function refreshAll() {
    setPMsg(null);
    setTMsg(null);
    setMMsg(null);
    setTpMsg(null);
    setTtMsg(null);
    setTeamsMsg(null);
    setFixturesError(null);
    setInviteMsg(null);

    await loadPlayers();
    await loadTeams();
    await loadTournaments();

    if (activeTournamentId) {
      await Promise.all([
        loadMatches(activeTournamentId),
        loadTournamentPlayers(activeTournamentId),
        loadTournamentTeams(activeTournamentId),
        loadFixturesForTournament(activeTournamentId),
      ]);
    }
  }

  /* =========================
     ADMIN: players
     ========================= */

  async function addPlayer() {
    if (!isAdmin(role)) return;

    setSavingPlayer(true);
    setPMsg(null);
    setInviteMsg(null);

    const email = pEmail.trim().toLowerCase();
    const name = pName.trim();

    if (!email || !name) {
      setPMsg("Unesi i ime i email.");
      setSavingPlayer(false);
      return;
    }

    const { error } = await supabase
      .from("players")
      .upsert({ email, name, role: "player" }, { onConflict: "email" });

    if (error) {
      setPMsg("Greška pri dodavanju: " + error.message);
      setSavingPlayer(false);
      return;
    }

    setPMsg("✅ Igrač dodat/izmenjen.");
    setPName("");
    setPEmail("");
    await loadPlayers();

    // ✅ Auto-invite only if enabled AND active tournament exists
    if (sendInviteOnAdd && activeTournamentId) {
      await invitePlayer(email);
    }

    setSavingPlayer(false);
  }

  /* =========================
     ADMIN: tournaments
     ========================= */

  async function createTournament() {
    if (!isAdmin(role)) return;

    setSavingTournament(true);
    setTMsg(null);

    const name = tName.trim();
    if (!name) {
      setTMsg("Unesi naziv turnira.");
      setSavingTournament(false);
      return;
    }

    const { data, error } = await supabase
      .from("tournaments")
      .insert({ name, date: tDate || null })
      .select("id")
      .single();

    if (error) {
      setTMsg("Greška: " + error.message);
      setSavingTournament(false);
      return;
    }

    setTName("");
    setTDate("");
    setTMsg("✅ Turnir kreiran.");

    await loadTournaments();
    if (data?.id) setActiveTournamentId(data.id);

    setSavingTournament(false);
  }

  async function saveTournamentRename(tournamentId: string) {
    if (!isAdmin(role)) return;

    const newName = editTournamentName.trim();
    if (!newName) {
      setTMsg("Naziv ne može biti prazan.");
      return;
    }

    const { error } = await supabase
      .from("tournaments")
      .update({ name: newName })
      .eq("id", tournamentId);

    if (error) {
      setTMsg("Greška pri izmeni: " + error.message);
      return;
    }

    setEditingTournamentId(null);
    setEditTournamentName("");
    setTMsg("✅ Turnir preimenovan.");
    await loadTournaments();
  }

  async function deleteTournament(tournamentId: string) {
    if (!isAdmin(role)) return;

    const ok = safeConfirm("Da li sigurno želiš da obrišeš ovaj turnir?");
    if (!ok) return;

    const { error } = await supabase
      .from("tournaments")
      .delete()
      .eq("id", tournamentId);

    if (error) {
      setTMsg("Greška pri brisanju: " + error.message);
      return;
    }

    setTMsg("✅ Turnir obrisan.");

    if (activeTournamentId === tournamentId) {
      setActiveTournamentId(null);
      if (typeof window !== "undefined")
        window.localStorage.removeItem("activeTournamentId");
      setMatches([]);
      setTournamentPlayers([]);
      setTournamentTeams([]);
      setFixtures([]);
      setRosterLocked(false);
    }

    await loadTournaments();
  }

  /* =========================
     ADMIN: tournament_teams
     ========================= */

  async function addTeamToTournament() {
    if (!isAdmin(role)) return;

    if (!activeTournamentId) {
      setTtMsg("Izaberi turnir prvo.");
      return;
    }
    if (!teamToAddId) {
      setTtMsg("Izaberi tim.");
      return;
    }

    const already = tournamentTeams.some((x) => x.team_id === teamToAddId);
    if (already) {
      setTtMsg("Taj tim je već dodat u ovaj turnir.");
      return;
    }

    setTtMsg(null);

    const { error } = await supabase
      .from("tournament_teams")
      .insert({ tournament_id: activeTournamentId, team_id: teamToAddId });

    if (error) {
      setTtMsg("Greška: " + error.message);
      return;
    }

    setTeamToAddId("");
    await loadTournamentTeams(activeTournamentId);
  }

  async function removeTeamFromTournament(rowId: string) {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const { error } = await supabase
      .from("tournament_teams")
      .delete()
      .eq("id", rowId);

    if (error) {
      setTtMsg("Greška pri brisanju tima iz turnira: " + error.message);
      return;
    }

    await loadTournamentTeams(activeTournamentId);
  }

  /* =========================
     ADMIN: DRAW
     ========================= */

  async function resetDraw() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const ok = safeConfirm(
      "Reset žreba? (obrišaće se tournament_players za ovaj turnir)"
    );
    if (!ok) return;

    setTpMsg(null);

    const { error } = await supabase
      .from("tournament_players")
      .delete()
      .eq("tournament_id", activeTournamentId);

    if (error) {
      setTpMsg("Greška pri resetu žreba: " + error.message);
      return;
    }

    setTpMsg("✅ Žreb resetovan.");
    await loadTournamentPlayers(activeTournamentId);
  }

  async function drawTeamsForTournament() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) {
      setTpMsg("Nema aktivnog turnira.");
      return;
    }

    // ✅ enforce safe flow
    if (!rosterLocked) {
      setTpMsg("Greška: prvo pošalji invite i zaključaj roster, tek onda Žreb.");
      return;
    }

    const onlyPlayers = players.filter((p) => p.role === "player");

    if (onlyPlayers.length < 2) {
      setTpMsg("Treba bar 2 igrača.");
      return;
    }

    if (tournamentTeams.length < onlyPlayers.length) {
      setTpMsg("Nema dovoljno timova u turniru (mora bar koliko i igrača).");
      return;
    }

    setDrawing(true);
    setTpMsg(null);

    // 1) Obriši stari žreb
    const { error: delErr } = await supabase
      .from("tournament_players")
      .delete()
      .eq("tournament_id", activeTournamentId);

    if (delErr) {
      setTpMsg("Greška (brisanje starog žreba): " + delErr.message);
      setDrawing(false);
      return;
    }

    // 2) Shuffle teams and assign
    const shuffledTeams = shuffle(tournamentTeams).slice(0, onlyPlayers.length);

    const rows = onlyPlayers
      .slice(0, shuffledTeams.length)
      .map((p, idx) => ({
        tournament_id: activeTournamentId,
        player_email: p.email,
        team_id: shuffledTeams[idx].team_id,
      }));

    const { error } = await supabase.from("tournament_players").insert(rows);
    if (error) {
      setTpMsg("Greška pri žrebu: " + error.message);
      setDrawing(false);
      return;
    }

    setTpMsg("✅ Žreb završen.");
    setDrawing(false);

    await loadTournamentPlayers(activeTournamentId);
  }

  /* =========================
     FIXTURES: save/reset/generate
     ========================= */

  async function handleSaveScheduleRound1(
    drafts: { match_number: number; home_team_id: string; away_team_id: string }[]
  ) {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    setFixturesError(null);
    try {
      const cleaned = drafts
        .map((d) => ({
          match_number: d.match_number,
          home_team_id: d.home_team_id || "",
          away_team_id: d.away_team_id || "",
        }))
        .filter((d) => d.home_team_id && d.away_team_id);

      if (cleaned.length === 0) {
        setFixturesError("Unesi bar jedan meč u Kolo 1.");
        return;
      }

      await saveRound1AndGenerateRound2(supabase, activeTournamentId, cleaned);
      await loadFixturesForTournament(activeTournamentId);
      setFixturesError(null);
    } catch (e: any) {
      setFixturesError(e?.message ?? "Greška pri snimanju fixtures.");
    }
  }

  async function resetFixtures() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const { error } = await supabase
      .from("fixtures")
      .delete()
      .eq("tournament_id", activeTournamentId);

    if (error) {
      setFixturesError("Greška pri reset fixtures: " + error.message);
      return;
    }
    await loadFixturesForTournament(activeTournamentId);
  }

  async function generateMatchesFromFixtures() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    setMMsg(null);
    setGenerating(true);

    try {
      const { count, error: countErr } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("tournament_id", activeTournamentId);

      if (countErr) throw countErr;

      if ((count ?? 0) > 0) {
        setMMsg("Mečevi već postoje. (Ako hoćeš ponovo, uradi Reset schedule)");
        await loadMatches(activeTournamentId);
        return;
      }

      const fx = await loadFixtures(supabase, activeTournamentId);
      const list = (fx ?? []) as FixtureRow[];

      const playable = list
        .filter((f) => !f.is_bye)
        .filter((f) => f.home_team_id && f.away_team_id)
        .sort((a, b) => {
          if (a.round_number !== b.round_number) return a.round_number - b.round_number;
          return a.match_number - b.match_number;
        });

      if (playable.length === 0) {
        setMMsg("Nema fixtures. Prvo unesi Kolo 1.");
        return;
      }

      const rows = playable.map((f) => ({
        tournament_id: activeTournamentId,
        round: f.round_number,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
      }));

      const { error } = await supabase.from("matches").insert(rows);
      if (error) throw error;

      setMMsg("✅ Mečevi generisani iz fixtures.");
      await loadMatches(activeTournamentId);
    } catch (e: any) {
      setMMsg("Greška: " + (e?.message ?? "unknown"));
    } finally {
      setGenerating(false);
    }
  }

  /* =========================
     LEGACY SCHEDULE (kept)
     ========================= */

  async function resetSchedule() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const ok = safeConfirm(
      "Reset schedule? (obrišaće se svi matches za ovaj turnir)"
    );
    if (!ok) return;

    setMMsg(null);

    const { error } = await supabase
      .from("matches")
      .delete()
      .eq("tournament_id", activeTournamentId);

    if (error) {
      setMMsg("Greška pri resetu rasporeda: " + error.message);
      return;
    }

    setMMsg("✅ Schedule resetovan.");
    await loadMatches(activeTournamentId);
  }

  async function generateSchedule() {
    if (!isAdmin(role)) return;

    if (!activeTournamentId) {
      setMMsg("Nema aktivnog turnira.");
      return;
    }

    setGenerating(true);
    setMMsg(null);

    const { data: teamsData, error: teamsErr } = await supabase
      .from("tournament_teams")
      .select("team_id")
      .eq("tournament_id", activeTournamentId);

    if (teamsErr) {
      setMMsg("Greška pri učitavanju timova: " + teamsErr.message);
      setGenerating(false);
      return;
    }

    type TeamIdRow = { team_id: string };
    let teamIds = ((teamsData ?? []) as TeamIdRow[])
      .map((t) => t.team_id)
      .filter(Boolean);

    if (teamIds.length < 2) {
      setMMsg("Treba bar 2 tima u turniru.");
      setGenerating(false);
      return;
    }

    const { count, error: countErr } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", activeTournamentId);

    if (countErr) {
      setMMsg("Greška: " + countErr.message);
      setGenerating(false);
      return;
    }

    if ((count ?? 0) > 0) {
      setMMsg("Mečevi već postoje. (Ako hoćeš ponovo, uradi Reset schedule)");
      setGenerating(false);
      await loadMatches(activeTournamentId);
      return;
    }

    const BYE = "__BYE__";
    const isOdd = teamIds.length % 2 === 1;
    if (isOdd) teamIds = [...teamIds, BYE];

    const n = teamIds.length;
    const rounds = n - 1;
    const half = n / 2;

    let arr = [...teamIds];

    const rows: Array<{
      tournament_id: string;
      round: number;
      home_team_id: string | null;
      away_team_id: string | null;
    }> = [];

    for (let r = 1; r <= rounds; r++) {
      for (let i = 0; i < half; i++) {
        const t1 = arr[i];
        const t2 = arr[n - 1 - i];
        if (t1 === BYE || t2 === BYE) continue;

        const home = r % 2 === 1 ? t1 : t2;
        const away = r % 2 === 1 ? t2 : t1;

        rows.push({
          tournament_id: activeTournamentId,
          round: r,
          home_team_id: home,
          away_team_id: away,
        });
      }

      const fixed = arr[0];
      const rest = arr.slice(1);
      rest.unshift(rest.pop() as string);
      arr = [fixed, ...rest];
    }

    if (doubleRoundRobin) {
      const offset = rounds;
      const secondLeg = rows.map((m) => ({
        tournament_id: m.tournament_id,
        round: (m.round ?? 0) + offset,
        home_team_id: m.away_team_id,
        away_team_id: m.home_team_id,
      }));
      rows.push(...secondLeg);
    }

    const { error } = await supabase.from("matches").insert(rows);
    if (error) {
      setMMsg("Greška pri generisanju: " + error.message);
      setGenerating(false);
      return;
    }

    setMMsg(
      `✅ Schedule generisan (LEGACY)${
        doubleRoundRobin ? " (2x home/away)" : ""
      }.`
    );
    setGenerating(false);

    await loadMatches(activeTournamentId);
  }

  /* =========================
     ASSIGN PLAYERS
     ========================= */

  async function assignPlayersToMatches() {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) {
      setMMsg("Nema aktivnog turnira.");
      return;
    }

    if (tournamentPlayers.length === 0) {
      setMMsg("Nema žreba. Prvo uradi Žreb timova.");
      return;
    }

    if (matches.length === 0) {
      setMMsg("Nema mečeva. Prvo generiši mečeve.");
      return;
    }

    setAssigning(true);
    setMMsg(null);

    try {
      const updates = matches
        .filter((m) => m.home_team_id && m.away_team_id)
        .map((m) => {
          const p1 = m.home_team_id
            ? teamToPlayerEmail.get(m.home_team_id) ?? null
            : null;
          const p2 = m.away_team_id
            ? teamToPlayerEmail.get(m.away_team_id) ?? null
            : null;

          const need =
            (m.player1_email ?? null) !== (p1 ?? null) ||
            (m.player2_email ?? null) !== (p2 ?? null);

          return need ? { id: m.id, player1_email: p1, player2_email: p2 } : null;
        })
        .filter(Boolean) as Array<{
        id: string;
        player1_email: string | null;
        player2_email: string | null;
      }>;

      if (updates.length === 0) {
        setMMsg("Sve je već dodeljeno.");
        setAssigning(false);
        return;
      }

      for (const u of updates) {
        const { error } = await supabase
          .from("matches")
          .update({ player1_email: u.player1_email, player2_email: u.player2_email })
          .eq("id", u.id);
        if (error) throw error;
      }

      setMMsg("✅ Igrači su dodeljeni mečevima (iz žreba).");
      await loadMatches(activeTournamentId);
    } catch (e: any) {
      setMMsg("Greška pri dodeli igrača: " + (e?.message ?? "unknown"));
    } finally {
      setAssigning(false);
    }
  }

  /* =========================
     MATCH RESULT
     ========================= */

  async function saveMatchResult(matchId: string) {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const hg = editHomeGoals.trim() === "" ? null : Number(editHomeGoals);
    const ag = editAwayGoals.trim() === "" ? null : Number(editAwayGoals);

    if (hg === null || ag === null || Number.isNaN(hg) || Number.isNaN(ag)) {
      setMMsg("Unesi oba rezultata kao brojeve (npr 2 i 1).");
      return;
    }

    setSavingMatchId(matchId);
    setMMsg(null);

    const { error } = await supabase
      .from("matches")
      .update({
        player1_score: hg,
        player2_score: ag,
        played_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (error) {
      setMMsg("Greška pri čuvanju rezultata: " + error.message);
      setSavingMatchId(null);
      return;
    }

    setEditingMatchId(null);
    setEditHomeGoals("");
    setEditAwayGoals("");
    setSavingMatchId(null);

    await loadMatches(activeTournamentId);
  }

  async function clearMatchResult(matchId: string) {
    if (!isAdmin(role)) return;
    if (!activeTournamentId) return;

    const ok = safeConfirm("Obrisati rezultat (vrati na neodigrano)?");
    if (!ok) return;

    setMMsg(null);

    const { error } = await supabase
      .from("matches")
      .update({ player1_score: null, player2_score: null, played_at: null })
      .eq("id", matchId);

    if (error) {
      setMMsg("Greška pri brisanju rezultata: " + error.message);
      return;
    }

    await loadMatches(activeTournamentId);
  }

  /* =========================
     AUTH + INIT
     ========================= */

  useEffect(() => {
    const run = async () => {
      try {
        setFatal(null);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          router.replace("/login");
          return;
        }

        setMyEmail(data.session.user.email ?? null);

        const r = await getRole();
        setRole(r ?? null);

        await loadPlayers();
        await loadTeams();
        await loadTournaments();

        setLoading(false);
      } catch (e: any) {
        const msg = e?.message ?? String(e ?? "Unknown init error");
        setFatal("Greška pri inicijalizaciji: " + msg);
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!activeTournamentId) return;
    Promise.all([
      loadMatches(activeTournamentId),
      loadTournamentPlayers(activeTournamentId),
      loadTournamentTeams(activeTournamentId),
      loadFixturesForTournament(activeTournamentId),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTournamentId]);

  useEffect(() => {
    if (!activeTournamentId) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("activeTournamentId", activeTournamentId);
  }, [activeTournamentId]);

  /* =========================
     STANDINGS
     ========================= */

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

    const list = Array.from(map.values()).map((r) => ({ ...r, gd: r.gf - r.ga }));
    list.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });

    return list;
  }, [matches, tournamentTeams, teamById]);

  /* =========================
     RENDER HELPERS
     ========================= */

  function renderMatchRow(m: MatchRow) {
    const homeTeam = m.home_team_id ? teamById.get(m.home_team_id) : null;
    const awayTeam = m.away_team_id ? teamById.get(m.away_team_id) : null;

    const homeOwnerEmail = m.home_team_id ? teamToPlayerEmail.get(m.home_team_id) ?? null : null;
    const awayOwnerEmail = m.away_team_id ? teamToPlayerEmail.get(m.away_team_id) ?? null : null;

    const homeOwnerName = homeOwnerEmail ? (playerByEmail.get(homeOwnerEmail)?.name ?? homeOwnerEmail) : "—";
    const awayOwnerName = awayOwnerEmail ? (playerByEmail.get(awayOwnerEmail)?.name ?? awayOwnerEmail) : "—";

    const isEditing = editingMatchId === m.id;

    const scoreText =
      m.player1_score === null || m.player2_score === null
        ? "— : —"
        : `${m.player1_score} : ${m.player2_score}`;

    return (
      <div key={m.id} className="pl-item">
        <div className="pl-item-main">
          <div className="pl-row" style={{ flexWrap: "wrap" }}>
            {m.round ? <Pill>{`Kolo ${m.round}`}</Pill> : null}
            <div className="pl-match">
              <span className="pl-team">
                {homeTeam?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={homeTeam.logo_url}
                    alt={homeTeam.name}
                    width={18}
                    height={18}
                    style={{ borderRadius: 5 }}
                  />
                ) : (
                  <span className="pl-dot" />
                )}
                {homeTeam ? homeTeam.name : m.home_team_id ?? "—"}
              </span>

              <span className="pl-muted">vs</span>

              <span className="pl-team">
                {awayTeam?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={awayTeam.logo_url}
                    alt={awayTeam.name}
                    width={18}
                    height={18}
                    style={{ borderRadius: 5 }}
                  />
                ) : (
                  <span className="pl-dot" />
                )}
                {awayTeam ? awayTeam.name : m.away_team_id ?? "—"}
              </span>
            </div>
          </div>

          <div className="pl-item-sub">
            Igrači: <b>{homeOwnerName}</b> vs <b>{awayOwnerName}</b> •{" "}
            <span className="pl-muted">{isPlayed(m) ? "odigrano" : "nije odigrano"}</span>
          </div>
        </div>

        <div className="pl-item-actions">
          {!isEditing ? (
            <div className="pl-row">
              <div className="pl-score">{scoreText}</div>

              {isAdmin(role) && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingMatchId(m.id);
                      setEditHomeGoals(m.player1_score === null ? "" : String(m.player1_score));
                      setEditAwayGoals(m.player2_score === null ? "" : String(m.player2_score));
                    }}
                  >
                    Upiši rezultat
                  </Button>

                  {isPlayed(m) && (
                    <Button variant="ghost" onClick={() => clearMatchResult(m.id)}>
                      Obriši
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="pl-row">
              <Input
                value={editHomeGoals}
                onChange={(e) => setEditHomeGoals(clampInt(e.target.value, 0, 99))}
                placeholder="Home"
                inputMode="numeric"
                className="pl-mini"
              />
              <span className="pl-muted">:</span>
              <Input
                value={editAwayGoals}
                onChange={(e) => setEditAwayGoals(clampInt(e.target.value, 0, 99))}
                placeholder="Away"
                inputMode="numeric"
                className="pl-mini"
              />

              <Button onClick={() => saveMatchResult(m.id)} disabled={savingMatchId === m.id}>
                {savingMatchId === m.id ? "Čuvam..." : "Sačuvaj"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setEditingMatchId(null);
                  setEditHomeGoals("");
                  setEditAwayGoals("");
                }}
              >
                Otkaži
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* =========================
     RENDER
     ========================= */

  if (loading) {
    return (
      <div className="pl-wrap">
        <div className="pl-topbar">
          <div>
            <div className="pl-title">PES League</div>
            <div className="pl-sub">Učitavanje...</div>
          </div>
        </div>
        <Card title="Loading">
          <Hint>Učitavam sesiju, rolu i podatke...</Hint>
        </Card>
        <GlobalStyles />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="pl-wrap">
        <div className="pl-topbar">
          <div>
            <div className="pl-title">PES League</div>
            <div className="pl-sub">
              Uloga: <b>{role ?? "—"}</b>
              {myEmail ? (
                <>
                  {" "}
                  • <span className="pl-muted">{myEmail}</span>
                </>
              ) : null}
            </div>

            <div className="pl-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <Pill tone="muted">Aktivni turnir</Pill>
              <Select
                value={activeTournamentId ?? ""}
                onChange={(e) => setActiveTournamentId(e.target.value || null)}
                disabled={tournaments.length === 0}
                className="pl-select pl-select-wide"
              >
                <option value="">
                  {tournaments.length ? "Izaberi..." : "Nema turnira"}
                </option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.date ? `(${t.date})` : ""}
                  </option>
                ))}
              </Select>

              {activeTournament ? (
                <Pill tone="ok">{activeTournament.name}</Pill>
              ) : (
                <Pill tone="warn">nema aktivnog</Pill>
              )}

              {isAdmin(role) && activeTournamentId && (
                <Pill tone={rosterLocked ? "ok" : "warn"}>
                  {rosterLocked ? "Roster: LOCK" : "Roster: UNLOCK"}
                </Pill>
              )}
            </div>

            {!isAdmin(role) && (
              <div className="pl-sub" style={{ marginTop: 10 }}>
                Moj tim: <b>{myTeam?.name ?? "—"}</b>
              </div>
            )}
          </div>

          <div className="pl-row">
            <Button onClick={refreshAll}>Refresh</Button>
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

        {fatal && (
          <Card title="Init error" className="pl-danger-box">
            <Msg text={fatal} />
          </Card>
        )}

        {!isAdmin(role) && (
          <Card
            title={
              <div>
                <div className="pl-sec-title">Moj profil</div>
                <div className="pl-sec-sub">Brzi pregled (turnir, tim, forma)</div>
              </div>
            }
            right={<Pill tone="muted">Player</Pill>}
          >
            {!activeTournamentId ? (
              <Hint>Izaberi aktivni turnir gore.</Hint>
            ) : (
              <div className="pl-grid">
                <div className="pl-col">
                  <div className="pl-subtitle">Igrač</div>
                  <div className="pl-line">
                    <div className="pl-item-title">{myPlayer?.name ?? "(nema imena u bazi)"}</div>
                    <div className="pl-item-sub">{myEmail ?? "—"}</div>
                  </div>
                </div>

                <div className="pl-col">
                  <div className="pl-subtitle">Moj tim</div>
                  <div className="pl-line">
                    <div className="pl-row" style={{ gap: 10 }}>
                      {myTeam?.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={myTeam.logo_url}
                          alt={myTeam.name}
                          width={22}
                          height={22}
                          style={{ borderRadius: 6 }}
                        />
                      ) : (
                        <div className="pl-avatar" />
                      )}
                      <div>
                        <div className="pl-item-title">{myTeam?.name ?? "Nije dodeljen tim (još nema žreba)"}</div>
                        <div className="pl-item-sub">
                          Turnir: <b>{activeTournament?.name ?? "—"}</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pl-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                    <Pill tone="muted">P: {myStats.played}</Pill>
                    <Pill tone="ok">W: {myStats.wins}</Pill>
                    <Pill tone="muted">D: {myStats.draws}</Pill>
                    <Pill tone="warn">L: {myStats.losses}</Pill>
                    <Pill tone="muted">
                      GF/GA: {myStats.gf}/{myStats.ga}
                    </Pill>
                    <Pill tone="ok">PTS: {myStats.pts}</Pill>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {isAdmin(role) && (
          <Card
            title={<div className="pl-sec-title">Admin panel</div>}
            right={
              <div className="pl-row" style={{ flexWrap: "wrap" }}>
                <label className="pl-check" title="Ako je uključeno, šalje invite posle dodavanja (samo ako je izabran turnir)">
                  <input
                    type="checkbox"
                    checked={sendInviteOnAdd}
                    onChange={(e) => setSendInviteOnAdd(e.target.checked)}
                  />
                  Auto-invite na add
                </label>

                <Button
                  variant="outline"
                  onClick={inviteAllPlayers}
                  disabled={
                    invitingAll ||
                    !activeTournamentId ||
                    players.filter((p) => p.role === "player").length === 0
                  }
                  title={!activeTournamentId ? "Izaberi aktivni turnir prvo" : "Šalje invite svim playerima"}
                >
                  {invitingAll ? "Šaljem..." : "Invite svima"}
                </Button>

                {!rosterLocked ? (
                  <Button
                    variant="solid"
                    onClick={lockRoster}
                    disabled={!activeTournamentId}
                    title={!activeTournamentId ? "Izaberi turnir" : "Zaključaj roster pa tek onda radi žreb"}
                  >
                    Lock roster
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={unlockRoster}
                    disabled={!activeTournamentId}
                    title="Otključaj roster (oprez)"
                  >
                    Unlock
                  </Button>
                )}
              </div>
            }
          >
            <div className="pl-form">
              <Input
                placeholder="Ime (npr. Stefan)"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
              />
              <Input
                placeholder="Email (npr. neko@gmail.com)"
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
              />
              <Button onClick={addPlayer} disabled={savingPlayer}>
                {savingPlayer ? "Čuvam..." : "Dodaj igrača"}
              </Button>
            </div>
            {pMsg && <Msg text={pMsg} />}
            {inviteMsg && <Msg text={inviteMsg} />}
            <Hint>
              Invite radi preko <b>/api/admin/invite</b> (server).
              Env: <b>SUPABASE_SERVICE_ROLE_KEY</b> + Auth Redirect URL.
            </Hint>
          </Card>
        )}

        {isAdmin(role) && (
          <Card title={<div className="pl-sec-title">Kreiraj turnir</div>}>
            <div className="pl-form">
              <Input
                placeholder="Naziv (npr. Sreda Turnir 2026)"
                value={tName}
                onChange={(e) => setTName(e.target.value)}
              />
              <Input
                type="date"
                value={tDate}
                onChange={(e) => setTDate(e.target.value)}
                className="pl-date"
              />
              <Button onClick={createTournament} disabled={savingTournament}>
                {savingTournament ? "Kreiram..." : "Kreiraj"}
              </Button>
            </div>
            {tMsg && <Msg text={tMsg} />}
          </Card>
        )}

        <Card
          title={
            <div>
              <div className="pl-sec-title">Turniri</div>
              <div className="pl-sec-sub">
                Aktivni: <b>{activeTournament ? activeTournament.name : "nema"}</b>
              </div>
            </div>
          }
        >
          {tournaments.length === 0 ? (
            <Hint>Nema turnira.</Hint>
          ) : (
            <div className="pl-list">
              {tournaments.map((t) => {
                const isActive = activeTournamentId === t.id;
                const isEditing = editingTournamentId === t.id;

                return (
                  <div
                    key={t.id}
                    className={cx("pl-item", isActive && "pl-item-active")}
                    onClick={() => setActiveTournamentId(t.id)}
                  >
                    <div className="pl-item-main">
                      {!isEditing ? (
                        <>
                          <div className="pl-item-title">{t.name}</div>
                          <div className="pl-item-sub">{formatDate(t.date)}</div>
                        </>
                      ) : (
                        <div className="pl-row">
                          <Input value={editTournamentName} onChange={(e) => setEditTournamentName(e.target.value)} />
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveTournamentRename(t.id);
                            }}
                          >
                            Sačuvaj
                          </Button>
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTournamentId(null);
                              setEditTournamentName("");
                            }}
                          >
                            Otkaži
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="pl-item-actions">
                      {isActive && <Pill tone="ok">aktivni</Pill>}

                      {isAdmin(role) && !isEditing && (
                        <>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTournamentId(t.id);
                              setEditTournamentName(t.name);
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTournament(t.id);
                            }}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title={
            <div>
              <div className="pl-sec-title">Timovi za turnir</div>
              <div className="pl-sec-sub">
                Ukupno: <b>{tournamentTeams.length}</b>
              </div>
            </div>
          }
        >
          {teamsMsg && <Msg text={teamsMsg} />}
          {ttMsg && <Msg text={ttMsg} />}

          {isAdmin(role) && (
            <div className="pl-form">
              <Select
                value={teamToAddId}
                onChange={(e) => setTeamToAddId(e.target.value)}
                disabled={!activeTournamentId}
              >
                <option value="">
                  {activeTournamentId ? "Izaberi tim..." : "Izaberi turnir prvo"}
                </option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Button onClick={addTeamToTournament} disabled={!activeTournamentId}>
                Dodaj tim
              </Button>
            </div>
          )}

          {tournamentTeams.length === 0 ? (
            <Hint>Nema izabranih timova za ovaj turnir.</Hint>
          ) : (
            <div className="pl-list">
              {tournamentTeams.map((row) => {
                const team = teamById.get(row.team_id);
                const ownerEmail = team ? teamToPlayerEmail.get(team.id) ?? null : null;
                const ownerName = ownerEmail ? (playerByEmail.get(ownerEmail)?.name ?? ownerEmail) : null;

                return (
                  <div key={row.id} className="pl-item">
                    <div className="pl-item-main">
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
                        <div>
                          <div className="pl-item-title">{team ? team.name : row.team_id}</div>
                          <div className="pl-item-sub">
                            Igrač: <b>{ownerName ?? "—"}</b>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isAdmin(role) && (
                      <div className="pl-item-actions">
                        <Button variant="ghost" onClick={() => removeTeamFromTournament(row.id)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title={
            <div>
              <div className="pl-sec-title">Žreb timova</div>
              <div className="pl-sec-sub">
                SAFE FLOW: Invite → Lock roster → Žreb
              </div>
            </div>
          }
          right={
            isAdmin(role) ? (
              <div className="pl-row">
                <Button
                  onClick={drawTeamsForTournament}
                  disabled={drawing || !activeTournamentId || !rosterLocked}
                  title={!rosterLocked ? "Prvo Lock roster" : "Izvrši žreb"}
                >
                  {drawing ? "Izvlačim..." : "🎲 Izvrši žreb"}
                </Button>
                <Button variant="outline" onClick={resetDraw} disabled={!activeTournamentId}>
                  Reset žreba
                </Button>
              </div>
            ) : null
          }
        >
          {tpMsg && <Msg text={tpMsg} />}

          {!rosterLocked && isAdmin(role) && activeTournamentId ? (
            <Hint>
              Pre žreba: pošalji invite svima i klikni <b>Lock roster</b>.
            </Hint>
          ) : null}

          {tournamentPlayers.length === 0 ? (
            <Hint>Još nema žreba za ovaj turnir.</Hint>
          ) : (
            <div className="pl-list">
              {tournamentPlayers.map((tp) => {
                const playerName =
                  players.find((p) => p.email === tp.player_email)?.name ?? tp.player_email;
                const team = teamById.get(tp.team_id);

                return (
                  <div key={tp.id} className="pl-item">
                    <div className="pl-item-main">
                      <div className="pl-item-title">{playerName}</div>
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
                        <div className="pl-muted">{team ? team.name : tp.team_id}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {activeTournamentId ? (
          <ScheduleCard
            isAdminUser={isAdmin(role)}
            tournamentId={activeTournamentId}
            teamOptions={tournamentTeamOptions}
            fixtures={fixtures}
            fixturesLoading={fixturesLoading}
            fixturesError={fixturesError}
            onSaveRound1={handleSaveScheduleRound1}
            onResetFixtures={resetFixtures}
            onGenerateMatchesFromFixtures={generateMatchesFromFixtures}
          />
        ) : (
          <Card title={<div className="pl-sec-title">Raspored (Fixtures)</div>}>
            <Hint>Izaberi aktivan turnir.</Hint>
          </Card>
        )}

        <Card
          title={
            <div>
              <div className="pl-sec-title">Mečevi</div>
              <div className="pl-sec-sub">
                Ukupno: <b>{isAdmin(role) ? matches.length : filteredVisibleMatches.length}</b>
                {!isAdmin(role) ? <> (samo moji mečevi)</> : null}
              </div>
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
                  <option key={r} value={String(r)}>{`Kolo ${r}`}</option>
                ))}
              </Select>

              {isAdmin(role) ? (
                <>
                  <label className="pl-check">
                    <input
                      type="checkbox"
                      checked={doubleRoundRobin}
                      onChange={(e) => setDoubleRoundRobin(e.target.checked)}
                    />
                    2x (LEGACY)
                  </label>

                  <Button variant="outline" onClick={generateSchedule} disabled={generating || !activeTournamentId}>
                    {generating ? "Generišem..." : "Generate (LEGACY)"}
                  </Button>

                  <Button variant="outline" onClick={assignPlayersToMatches} disabled={assigning || !activeTournamentId}>
                    {assigning ? "Dodeljujem..." : "Auto-assign igrače"}
                  </Button>

                  <Button variant="outline" onClick={resetSchedule} disabled={!activeTournamentId}>
                    Reset schedule
                  </Button>
                </>
              ) : null}
            </div>
          }
        >
          {!activeTournamentId ? <Hint>Izaberi aktivni turnir.</Hint> : null}
          {mMsg && <Msg text={mMsg} />}

          {!isAdmin(role) && activeTournamentId && !myTeamId ? (
            <Hint>Nemaš dodeljen tim u ovom turniru (ili još nema žreba).</Hint>
          ) : null}

          {activeTournamentId && (isAdmin(role) ? matches.length : filteredVisibleMatches.length) > 0 ? (
            <div className="pl-list">
              {(isAdmin(role) ? matches : filteredVisibleMatches)
                .filter((m) => {
                  if (roundFilter === "all") return true;
                  const rf = Number(roundFilter);
                  if (Number.isNaN(rf)) return true;
                  return (m.round ?? -1) === rf;
                })
                .map((m) => renderMatchRow(m))}
            </div>
          ) : null}

          {!isAdmin(role) && activeTournamentId && filteredVisibleMatches.length === 0 ? (
            <Hint>Nema mečeva za izabrani filter.</Hint>
          ) : null}
        </Card>

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
            <Hint>Dodaj timove u turnir prvo.</Hint>
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
                  <div key={s.team_id} className={cx("pl-tr", isMine && "pl-tr-mine")}>
                    <div className="pl-muted">{idx + 1}</div>
                    <div className={cx("b", isMine && "pl-mine")}>{s.team_name}</div>
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

        <Card
          title={<div className="pl-sec-title">Igrači</div>}
          right={
            isAdmin(role) ? (
              <Pill tone="muted">
                Invite: {invitingEmail ? `šaljem ${invitingEmail}` : "spreman"}
              </Pill>
            ) : null
          }
        >
          {inviteMsg && <Msg text={inviteMsg} />}

          {players.length === 0 ? (
            <Hint>Nema igrača.</Hint>
          ) : (
            <div className="pl-list">
              {players.map((p) => {
                const isMe = myEmail && p.email === myEmail;
                return (
                  <div key={p.email} className={cx("pl-item", isMe && "pl-item-me")}>
                    <div className="pl-item-main">
                      <div className="pl-item-title">
                        {p.name ?? "(bez imena)"} {isMe ? <span className="pl-me-tag">• ja</span> : null}
                      </div>
                      <div className="pl-item-sub">{p.email}</div>
                    </div>

                    <div className="pl-item-actions">
                      <Pill tone={p.role === "admin" ? "ok" : "muted"}>{p.role}</Pill>

                      {isAdmin(role) && p.role === "player" && (
                        <Button
                          variant="outline"
                          disabled={invitingAll || invitingEmail === p.email || !activeTournamentId}
                          onClick={(e) => {
                            e.stopPropagation?.();
                            invitePlayer(p.email);
                          }}
                          title={!activeTournamentId ? "Izaberi aktivni turnir prvo" : "Pošalji magic link invite na email"}
                        >
                          {invitingEmail === p.email ? "Šaljem..." : "Invite"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="pl-footer">Sledeće: BYE, yearly stats, export CSV.</div>

        <GlobalStyles />
      </div>
    </ErrorBoundary>
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
        --card2: rgba(255, 255, 255, 0.08);
        --bd: rgba(255, 255, 255, 0.12);
        --bd2: rgba(255, 255, 255, 0.16);
        --txt: rgba(255, 255, 255, 0.92);
        --muted: rgba(255, 255, 255, 0.68);
        --muted2: rgba(255, 255, 255, 0.52);
        --ok: #7cffc2;
        --warn: #ffd37c;
        --danger: #ff7c9b;
        --mine: rgba(124, 255, 194, 0.1);
        --minebd: rgba(124, 255, 194, 0.25);
        --me: rgba(124, 215, 255, 0.08);
        --mebd: rgba(124, 215, 255, 0.25);
      }
        /* ✅ mobile overflow fix */
        *,
        *::before,
        *::after {
        box-sizing: border-box;
      }

html,
body {
  width: 100%;
  overflow-x: hidden;
}

      html,
      body {
        height: 100%;
      }

      body {
        margin: 0;
        background: radial-gradient(1200px 600px at 10% 0%, rgba(124, 215, 255, 0.12), transparent 50%),
          radial-gradient(1000px 500px at 90% 10%, rgba(255, 124, 155, 0.1), transparent 55%),
          var(--bg);
        color: var(--txt);
      }

      .pl-wrap {
        padding: 16px;
        max-width: 980px;
        margin: 0 auto;
    }

      .pl-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap; /* ✅ mobile: da dugmad pređu u novi red */
  padding: 14px 14px 18px;
  margin-bottom: 14px;
  border: 1px solid var(--bd);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.07),
    rgba(255, 255, 255, 0.03)
  );
}

/* ✅ mobile: leve info + desne akcije da ne guraju preko */
.pl-topbar > div:first-child {
  flex: 1 1 320px;
  min-width: 0;
}
.pl-topbar > div:last-child {
  flex: 0 1 auto;
  max-width: 100%;
}

.pl-title {
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.2px;
}

.pl-sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
}

.pl-muted {
  color: var(--muted);
}

.pl-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap; /* ✅ da se stvari ne guraju van ekrana */
  min-width: 0;
}

.pl-card {
  border: 1px solid var(--bd);
  border-radius: 16px;
  background: var(--card);
  overflow: hidden;
  margin-bottom: 14px;
}

.pl-card-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-wrap: wrap; /* ✅ */
  min-width: 0;
}

.pl-card-title {
  font-weight: 800;
}
.pl-card-b {
  padding: 14px;
}

.pl-sec-title {
  font-weight: 900;
  font-size: 16px;
}
.pl-sec-sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
}

.pl-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

/* ✅ ključ: uklanjamo min-width:220px koji širi ekran */
.pl-input,
.pl-select {
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--bd2);
  background: rgba(0, 0, 0, 0.18);
  color: var(--txt);
  outline: none;

  min-width: 0;     /* ✅ */
  max-width: 100%;  /* ✅ */
  width: 100%;      /* ✅ u formama lepo legne */
}

.pl-input::placeholder {
  color: var(--muted2);
}

.pl-date {
  min-width: 0;
  width: 180px;      /* ok na desktop */
  max-width: 100%;   /* ✅ */
}

.pl-mini {
  min-width: 72px;
  width: 72px;
}

/* ✅ select koji je ranije 320px je ubijao mobile */
.pl-select-wide {
  min-width: 0;
  width: 100%;
  max-width: 420px;
}

.pl-select-round {
  min-width: 0;
  width: 140px;
  max-width: 100%;
}

.pl-btn {
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 800;
  color: var(--txt);
  transition: transform 0.05s ease, opacity 0.15s ease, background 0.15s ease,
    border 0.15s ease;
  user-select: none;
  white-space: nowrap;
  max-width: 100%; /* ✅ */
}
      .pl-btn:active { transform: scale(0.98); }
      .pl-btn:disabled { cursor: not-allowed; opacity: 0.55; }

      .pl-btn-solid { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.18); }
      .pl-btn-solid:hover { background: rgba(255, 255, 255, 0.18); }

      .pl-btn-outline { background: transparent; border-color: rgba(255, 255, 255, 0.18); }
      .pl-btn-outline:hover { background: rgba(255, 255, 255, 0.08); }

      .pl-btn-ghost { background: transparent; border-color: transparent; }
      .pl-btn-ghost:hover { background: rgba(255, 255, 255, 0.08); }

      .pl-btn-danger { background: rgba(255, 124, 155, 0.14); border-color: rgba(255, 124, 155, 0.26); }
      .pl-btn-danger:hover { background: rgba(255, 124, 155, 0.18); }

      .pl-pill {
        font-size: 12px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: var(--muted);
        background: rgba(0, 0, 0, 0.12);
      }
      .pl-pill-ok { color: var(--ok); border-color: rgba(124, 255, 194, 0.28); }
      .pl-pill-warn { color: var(--warn); border-color: rgba(255, 211, 124, 0.28); }

      .pl-hint { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
      .pl-msg { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
      .pl-msg-err { color: var(--danger); }
      .pl-danger-box { border-color: rgba(255, 124, 155, 0.35); }

      .pl-list { display: grid; gap: 10px; }

      .pl-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.10);
      }

      .pl-item-active {
        border-color: rgba(124, 215, 255, 0.30);
        background: rgba(124, 215, 255, 0.06);
      }

      .pl-item-me { border-color: var(--mebd); background: var(--me); }

      .pl-me-tag {
        font-weight: 900;
        color: rgba(124, 215, 255, 0.90);
        font-size: 12px;
      }

      .pl-item-main { min-width: 0; }
      .pl-item-title {
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 520px;
      }
      .pl-item-sub { margin-top: 4px; color: var(--muted); font-size: 13px; }
      .pl-item-actions { display: flex; gap: 10px; align-items: center; }

      .pl-avatar {
        width: 22px; height: 22px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        opacity: 0.7;
      }
      .pl-dot {
        width: 18px; height: 18px;
        border-radius: 5px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        display: inline-block;
        opacity: 0.8;
      }

      .pl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 860px) {
        .pl-grid { grid-template-columns: 1fr; }
        .pl-select-wide { min-width: 220px; }
      }

      .pl-col {
        padding: 10px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.08);
      }

      .pl-subtitle { font-weight: 900; margin-bottom: 10px; }
      .pl-stack { display: grid; gap: 8px; }

      .pl-fixture-row {
        display: grid;
        grid-template-columns: 70px 1fr 26px 1fr;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.08);
      }

      .pl-fixture-num { font-weight: 900; font-size: 12px; color: var(--muted); }
      .pl-vs { text-align: center; font-weight: 900; color: var(--muted); }

      .pl-line {
        padding: 10px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.08);
      }

      .pl-check { display: inline-flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }

      .pl-match { display: inline-flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .pl-team { display: inline-flex; gap: 8px; align-items: center; font-weight: 900; }

      .pl-score { min-width: 70px; text-align: right; font-weight: 900; }

      .pl-table {
        border: 1px solid rgba(255, 255, 255, 0.10);
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
      .pl-tr-mine { background: var(--mine); border-top-color: rgba(124, 255, 194, 0.16); }
      .pl-mine { color: rgba(124, 255, 194, 0.95); }
      .pl-th { border-top: none; background: rgba(255, 255, 255, 0.06); color: var(--muted); font-size: 13px; }

      .r { text-align: right; }
      .b { font-weight: 900; }

      .pl-footer { margin: 14px 0 22px; color: var(--muted); font-size: 13px; text-align: center; }
    `}</style>
  );
}