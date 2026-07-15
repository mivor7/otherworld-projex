"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Countdown, SectionTitle } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";

type Bounty = {
  id: string;
  title: string;
  description: string;
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
  flip: "Frog Flip",
  dice: "Pond Dice",
};

export default function BountiesPage() {
  const [open, setOpen] = useState<Bounty[]>([]);
  const [closed, setClosed] = useState<Bounty[]>([]);
  const [boardGame, setBoardGame] = useState("hopper");
  const [board, setBoard] = useState<BoardRow[]>([]);

  useEffect(() => {
    fetch("/api/bounties")
      .then((r) => r.json())
      .then((d) => {
        setOpen(d.open ?? []);
        setClosed(d.closed ?? []);
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
    <div className="pt-10">
      <SectionTitle
        kicker="The hunt is always open"
        title="Bounties & competitions 🏆"
        desc="Prize pools funded by the house take — 30% of every credit the house wins flows here. Top the boards, claim the pool."
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-4">
          {open.length === 0 && (
            <div className="panel p-10 text-center text-fog">
              No open bounties at this moment — new hunts are posted regularly.
            </div>
          )}
          {open.map((b) => (
            <div key={b.id} className="panel panel-glow p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2 mb-2">
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
                  <h3 className="font-bold text-lg">{b.title}</h3>
                  <p className="text-fog text-sm mt-1.5 leading-relaxed max-w-xl">
                    {b.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-fog uppercase tracking-wider mb-1">Ends in</div>
                  <Countdown to={b.endsAt} />
                </div>
              </div>
            </div>
          ))}

          {closed.length > 0 && (
            <>
              <h2 className="font-bold pt-6 text-fog uppercase text-sm tracking-wider">
                Past hunts
              </h2>
              {closed.map((b) => (
                <div key={b.id} className="panel p-4 opacity-70 flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{b.title}</span>
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

        <aside className="panel p-5 h-fit sticky top-24">
          <h3 className="font-bold mb-3">Leaderboards · last 7 days</h3>
          <div className="flex gap-1 mb-4">
            {Object.entries(GAME_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBoardGame(key)}
                className={`btn text-xs px-3 py-1.5 ${boardGame === key ? "btn-primary" : "btn-ghost"}`}
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
                    <td className="py-1.5 pr-2 stat-number text-fog">#{row.rank}</td>
                    <td className="py-1.5 pr-2">{row.player}</td>
                    <td
                      className={`py-1.5 stat-number text-right ${row.score >= 0 ? "text-neon" : "text-danger"}`}
                    >
                      {boardGame === "hopper" ? row.score : `${row.score > 0 ? "+" : ""}${row.score}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-fog mt-4 leading-relaxed">
            Hopper ranks best arcade score; casino boards rank net credits won.
            Prizes are paid in $RIBBIT to the leading wallets when the bounty closes.
          </p>
        </aside>
      </div>
    </div>
  );
}
