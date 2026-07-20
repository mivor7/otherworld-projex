"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { Countdown } from "@/components/ui";
import { RowSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { fmtRibbit } from "@/lib/client-config";
import { useHouseConfig } from "@/components/use-house-config";

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

// Same artwork the arcade uses, so a bounty reads as its game at a glance.
const GAME_ART: Record<string, string> = {
  flip: "/art/owp_pump.png",
  dice: "/art/art-dice.jpg",
  blackjack: "/art/owp_bj.png",
  hopper: "/art/owp_frogger.png",
  frogris: "/art/owp_frogris.png",
  worm: "/art/owp_worm.png",
};

export default function BountiesPage() {
  const [open, setOpen] = useState<Bounty[]>([]);
  const [closed, setClosed] = useState<Bounty[]>([]);
  const [totals, setTotals] = useState<{ openPrizeRaw: string; paidOutRaw: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [boardGame, setBoardGame] = useState("hopper");
  const [board, setBoard] = useState<BoardRow[]>([]);
  const house = useHouseConfig();

  useEffect(() => {
    fetch("/api/bounties")
      .then((r) => r.json())
      .then((d) => {
        setOpen(d.open ?? []);
        setClosed(d.closed ?? []);
        setTotals(d.totals ?? null);
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
        subtitle="Fixed $RIBBIT pools, pre-funded by the house. Table bounties unlock as their game gets played; free episodes pay weekly. Every eligible winner shares the pool — paid automatically."
      />

      {totals && (
        <div className="panel p-4 mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-1 text-sm">
          <span>
            <span className="kicker !text-[0.6rem] mr-3">On the board now</span>
            <span className="stat-number text-neon">
              {fmtRibbit(totals.openPrizeRaw)} $RIBBIT
            </span>
          </span>
          <span>
            <span className="kicker !text-[0.6rem] mr-3">Paid to hunters</span>
            <span className="stat-number text-gold">
              {fmtRibbit(totals.paidOutRaw)} $RIBBIT
            </span>
          </span>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            Prizes are fixed up front; their unlock meters are sized so payouts
            never outrun the house.
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
              <div className="flex gap-4">
                {b.game && GAME_ART[b.game] && (
                  <Link
                    href={`/games/${b.game}`}
                    className="shrink-0 hidden sm:block group/thumb"
                    title={GAME_LABELS[b.game] ?? b.game}
                  >
                    <span
                      className="block w-[84px] h-[84px] rounded-lg overflow-hidden border"
                      style={{ borderColor: "var(--hairline-strong)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={GAME_ART[b.game]}
                        alt=""
                        className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105"
                      />
                    </span>
                  </Link>
                )}
                <div className="flex-1 min-w-0">
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
                  <div className="flex items-baseline justify-between mb-1.5 gap-2 flex-wrap">
                    <span className="kicker !text-[0.6rem]">
                      Prize unlocks as {GAME_LABELS[b.game ?? ""] ?? "the game"} is played
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
                    Every credit wagered here fills the bar. The moment it&apos;s full, the{" "}
                    {b.prizeText ?? `${fmtRibbit(b.prizeRibbit)} $RIBBIT`} pays out automatically —
                    split across all eligible winners by how well they did.
                  </p>
                </div>
              )}
              {b.progress?.mode === "time" && (
                <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
                  Free-game bounty — pays out weekly to every eligible winner.
                </p>
              )}
                </div>
              </div>
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
                  <div className="flex items-center gap-3 min-w-0">
                    {b.game && GAME_ART[b.game] && (
                      <span
                        className="block w-10 h-10 rounded-md overflow-hidden border shrink-0"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={GAME_ART[b.game]} alt="" className="w-full h-full object-cover" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium tracking-tight">{b.title}</span>
                      <span className="text-fog text-sm ml-3">
                        {b.prizeText ?? `${fmtRibbit(b.prizeRibbit)} $RIBBIT`}
                      </span>
                    </div>
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
            <div className="overflow-x-auto"><table className="w-full text-sm">
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
            </table></div>
          )}
          <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Arcade boards rank best score; the tables rank net credits won.
            Pools pay in $RIBBIT the moment a bounty triggers.{" "}
            <span className="text-neon">Prize boards rank active spenders only</span> —{" "}
            {house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT
            spent on credits lifetime and{" "}
            {house.rankedMinWindowBurnedRibbit.toLocaleString()}+ inside
            the board week. Anyone can play free; only spenders collect.
          </p>
        </aside>
      </div>
    </div>
  );
}
