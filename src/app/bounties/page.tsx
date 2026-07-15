"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/hero";
import { Countdown } from "@/components/ui";
import { RowSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { fmtRibbit } from "@/lib/client-config";

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
  const [loaded, setLoaded] = useState(false);
  const [boardGame, setBoardGame] = useState("hopper");
  const [board, setBoard] = useState<BoardRow[]>([]);

  useEffect(() => {
    fetch("/api/bounties")
      .then((r) => r.json())
      .then((d) => {
        setOpen(d.open ?? []);
        setClosed(d.closed ?? []);
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/leaderboard?game=${boardGame}`)
      .then((r) => r.json())
      .then((rows) => setBoard(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [boardGame]);

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/art-empty-chest.jpg"
        imagePosition="center 55%"
        kicker="Wing III — the board"
        badge="The hunt is always open"
        title="Bounties &"
        titleAccent="competitions"
        subtitle="Prize pools funded by the house take — 30% of every credit the house wins flows here. Top the boards, claim the pool."
      />

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
              image="/art/art-empty-chest.jpg"
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
            Hopper ranks best arcade score; the tables rank net credits won.
            Pools pay in $RIBBIT when the bounty closes.
          </p>
        </aside>
      </div>
    </div>
  );
}
