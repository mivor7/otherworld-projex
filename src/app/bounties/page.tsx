"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { Countdown } from "@/components/ui";
import { RowSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { CLIENT_CONFIG, fmtRibbit } from "@/lib/client-config";

type Bounty = {
  id: string;
  title: string;
  description: string;
  target: string | null;
  game: string | null;
  kind: string;
  prizeRibbit: string;
  prizeText: string | null;
  status: string;
  endsAt: string;
  progress?:
    | { mode: "credit"; spent: number; threshold: number; pct: number }
    | { mode: "time"; endsAt: string }
    | null;
};

type BoardRow = { rank: number; player: string; score: number };

const GAME_LABELS: Record<string, string> = {
  hopper: "Hopper",
  frogris: "Frogris",
  worm: "Worm Frog",
  flip: "Frog Flip",
  dice: "Pond Dice",
  blackjack: "Blackjack",
};

export default function BountiesPage() {
  const [open, setOpen] = useState<Bounty[]>([]);
  const [closed, setClosed] = useState<Bounty[]>([]);
  const [pool, setPool] = useState<{ houseTakeCredits: number; poolCredits: number; share: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [boardGame, setBoardGame] = useState("hopper");
  const [board, setBoard] = useState<BoardRow[]>([]);

  useEffect(() => {
    fetch("/api/bounties")
      .then((r) => r.json())
      .then((d) => {
        setOpen(d.open ?? []);
        setClosed(d.closed ?? []);
        setPool(d.pool ?? null);
        setLoaded(true);
      })
      .catch(() => {
        setOpen([]);
        setClosed([]);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/leaderboard?game=${boardGame}`)
      .then((r) => r.json())
      .then((rows) => setBoard(Array.isArray(rows) ? rows : []))
      .catch(() => setBoard([]));
  }, [boardGame]);

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/art-bounty.jpg"
        imagePosition="center 48%"
        kicker="Wing III — the board"
        badge="The hunt is always open"
        title="Bounties &"
        titleAccent="competitions"
        subtitle="Prize pools funded by the house take — 30% of every credit the house wins flows here. Top the boards, claim the pool."
      />

      {pool && (
        <div className="panel p-4 mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="kicker !text-[0.6rem]">This week&apos;s pool</span>
          <span className="stat-number text-neon">
            {pool.poolCredits.toLocaleString()} credits
          </span>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            {Math.round(pool.share * 100)}% of the house take actually realized in the
            last 7 days — prizes scale with real play, never promises.
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-8">
        <div className="space-y-4">
          {!loaded && (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )}
          {loaded && open.length === 0 && (
            <EmptyState
              image="/art/art-bounty.jpg"
              title="The board is quiet"
              hint="No open contracts at this moment — new hunts are posted regularly."
              action={
                <Link href="/games" className="btn btn-ghost">
                  Warm up in the arcade →
                </Link>
              }
            />
          )}
          {open.map((b) => (
            <div key={b.id} className="panel panel-hover p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex gap-1.5 mb-2.5 flex-wrap">
                    <span className="badge badge-gold">
                      {b.prizeText ?? `${fmtRibbit(b.prizeRibbit)} $RIBBIT`}
                    </span>
                    <span className="badge">{b.kind}</span>
                    {b.game && (
                      <Link href={`/games/${b.game}`} className="badge badge-live">
                        {GAME_LABELS[b.game] ?? b.game} →
                      </Link>
                    )}
                  </div>
                  <h3 className="!text-[1.05rem]">{b.title}</h3>
                  {b.target && (
                    <div className="mono text-xs text-gold mt-1 uppercase tracking-wider">
                      Target · {b.target}
                    </div>
                  )}
                  <p className="text-fog text-[0.875rem] mt-1.5 leading-relaxed max-w-xl">
                    {b.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="badge badge-live mb-2">
                    <span className="live-dot" /> hunting
                  </span>
                  <div className="kicker !text-[0.6rem] mb-1 mt-2">Closes in</div>
                  <Countdown to={b.endsAt} />
                </div>
              </div>
              {b.progress?.mode === "credit" && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="kicker !text-[0.6rem]">
                      Reward unlocks as the game is played
                    </span>
                    <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                      {b.progress.spent.toLocaleString()} /{" "}
                      {b.progress.threshold.toLocaleString()} credits · {b.progress.pct}%
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "oklch(0.22 0.01 165)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${b.progress.pct}%`,
                        background:
                          "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
                      }}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "var(--text-dim)" }}>
                    Pays out automatically the moment the bar fills — every eligible
                    winner shares it, sized to how they did.
                  </p>
                </div>
              )}
              {b.progress?.mode === "time" && (
                <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
                  Free-game bounty — pays out weekly to every eligible winner.
                </p>
              )}
            </div>
          ))}

          {closed.length > 0 && (
            <>
              <div className="kicker pt-6">Past hunts</div>
              {closed.map((b) => (
                <div
                  key={b.id}
                  className="panel p-4 opacity-70 flex justify-between items-center gap-3"
                >
                  <div className="min-w-0">
                    <span className="font-medium tracking-tight">{b.title}</span>
                    <span className="text-fog text-sm ml-3">
                      {b.prizeText ?? `${fmtRibbit(b.prizeRibbit)} $RIBBIT`}
                    </span>
                  </div>
                  <span className="badge">{b.status}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <aside className="panel p-5 h-fit lg:sticky lg:top-24">
          <div className="kicker mb-1.5">Leaderboards</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Rolling 7 days · best per hunter
          </p>
          <div className="chips mb-4 flex-wrap">
            {Object.entries(GAME_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBoardGame(key)}
                aria-pressed={boardGame === key}
                className={`chip !text-xs !min-h-[1.75rem] ${boardGame === key ? "active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          {board.length === 0 ? (
            <p className="text-fog text-sm">No entries yet this week.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {board.map((row) => (
                  <tr key={row.rank} className="table-row">
                    <td className="py-1.5 pr-2 mono text-xs" style={{ color: "var(--text-dim)" }}>
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="py-1.5 pr-2 mono text-xs">{row.player}</td>
                    <td
                      className={`py-1.5 stat-number text-right ${row.score >= 0 ? "text-neon" : "text-danger"}`}
                    >
                      {boardGame === "hopper"
                        ? row.score
                        : `${row.score > 0 ? "+" : ""}${row.score}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Arcade boards rank best score; the tables rank net credits won.
            Pools pay in $RIBBIT when the bounty closes.{" "}
            <span className="text-neon">Prize boards rank active burners only</span> —{" "}
            {CLIENT_CONFIG.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT
            burned lifetime and {CLIENT_CONFIG.rankedMinWindowBurnedRibbit.toLocaleString()}+
            inside the board week.
          </p>
        </aside>
      </div>
    </div>
  );
}
