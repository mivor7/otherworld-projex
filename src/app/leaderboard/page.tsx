"use client";

// Top Exterminators — the OG site's leaderboard, remastered: every cabinet
// and table, weekly or all-time.
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { EmptyState } from "@/components/empty-state";
import { useHouseConfig } from "@/components/use-house-config";

type Row = { rank: number; player: string; score: number; volume?: number; staker?: boolean };

const GAMES: { id: string; label: string; unit: string; kind: "arcade" | "table" }[] = [
  { id: "hopper", label: "Hopper", unit: "best score", kind: "arcade" },
  { id: "frogris", label: "Frogris", unit: "best score", kind: "arcade" },
  { id: "worm", label: "Worm Frog", unit: "best score", kind: "arcade" },
  { id: "flip", label: "Frog Flip", unit: "net credits", kind: "table" },
  { id: "dice", label: "Pond Dice", unit: "net credits", kind: "table" },
  { id: "blackjack", label: "Blackjack", unit: "net credits", kind: "table" },
];

export default function LeaderboardPage() {
  const house = useHouseConfig();
  const [game, setGame] = useState("hopper");
  const [window_, setWindow] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Intentional reset to show skeletons while the new tab's data loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    const since =
      window_ === "week"
        ? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        : new Date(0).toISOString();
    fetch(`/api/leaderboard?game=${game}&since=${encodeURIComponent(since)}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => {
        setRows([]);
        setLoaded(true);
      });
  }, [game, window_]);

  const meta = GAMES.find((g) => g.id === game)!;

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/art-leaderboard.jpg"
        imagePosition="right 42%"
        kicker="The standings"
        badge="Updated live"
        title="Top"
        titleAccent="Exterminators"
        subtitle="Every cabinet and every table, ranked. Arcade boards track best score; the tables rank net credits won. Weekly boards feed the bounty pools."
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="chips flex-wrap">
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`chip ${game === g.id ? "active" : ""}`}
              aria-pressed={game === g.id}
              onClick={() => setGame(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="chips">
          <button
            className={`chip ${window_ === "week" ? "active" : ""}`}
            aria-pressed={window_ === "week"}
            onClick={() => setWindow("week")}
          >
            This week
          </button>
          <button
            className={`chip ${window_ === "all" ? "active" : ""}`}
            aria-pressed={window_ === "all"}
            onClick={() => setWindow("all")}
          >
            All time
          </button>
        </div>
      </div>

      <div className="panel mt-5 overflow-hidden">
        <div
          className="px-5 py-3.5 flex items-baseline justify-between"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span className="font-medium tracking-tight">{meta.label}</span>
          <span className="kicker !text-[0.6rem]">{meta.unit}</span>
        </div>
        {!loaded ? (
          <div className="p-5 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="shimmer h-6 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              image="/art/owp_pump.png"
              title={`No ${meta.label} entries yet`}
              hint="The podium is open — the first score takes it."
              action={
                <Link href={`/games/${game}`} className="btn btn-primary">
                  Take the seat →
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.rank} className="table-row">
                  <td className="py-2.5 pl-5 pr-3 w-14 mono text-xs" style={{ color: "var(--text-dim)" }}>
                    {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : String(row.rank).padStart(2, "0")}
                  </td>
                  <td className="py-2.5 pr-3 mono text-xs">
                    {row.player}
                    {row.staker && <span className="staker-mark ml-1.5">staker</span>}
                  </td>
                  {meta.kind === "table" && (
                    <td className="py-2.5 pr-3 text-xs text-right" style={{ color: "var(--text-dim)" }}>
                      {row.volume?.toLocaleString()} wagered
                    </td>
                  )}
                  <td
                    className={`py-2.5 pr-5 stat-number text-right ${
                      row.score >= 0 ? "text-neon" : "text-danger"
                    }`}
                  >
                    {meta.kind === "table" && row.score > 0 ? "+" : ""}
                    {row.score.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <p className="text-xs mt-4 leading-relaxed max-w-lg" style={{ color: "var(--text-dim)" }}>
        <span className="text-neon">Skin in the game:</span> prize boards rank
        wallets with {""}
        {house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT spent on
        credits lifetime and {house.rankedMinWindowBurnedRibbit.toLocaleString()}+
        spent inside the board week (table boards also need in-window wagering
        volume). Anyone can play; buying credits mid-week ranks your best score
        retroactively. Every arcade run is replayed move-by-move and verified
        on the server before it can rank — pools pay the moment they trigger,
        listed on the{" "}
        <Link href="/bounties" className="text-neon hover:underline">
          bounty board
        </Link>
        .
      </p>
    </div>
  );
}
