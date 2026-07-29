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
  round?: number;
  autoRenew?: boolean;
  endsAt: string;
  progress?:
    | { mode: "credit"; spent: number; threshold: number; pct: number; potRibbit?: number; targetRibbit?: number; seedRibbit?: number }
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
    const load = () =>
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
    load();
    // Poll so progress bars and countdowns stay live, like the other surfaces.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
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
        badge={house.inviteRequired ? "Invite-only beta" : "The hunt is always open"}
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
                  <h3 className="!text-[1.05rem]">
                    {b.title}
                    {b.round !== undefined && (
                      <span
                        className="mono text-[0.6rem] uppercase tracking-widest ml-2 align-middle"
                        style={{ color: "var(--text-dim)" }}
                        title={
                          b.autoRenew === false
                            ? "Final round — won't re-open when it ends"
                            : "A fresh round opens automatically when this one pays"
                        }
                      >
                        round {b.round}
                        {b.autoRenew === false && " · final"}
                      </span>
                    )}
                  </h3>
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
                      {b.progress.potRibbit != null
                        ? `pot ${b.progress.potRibbit.toLocaleString()} / ${b.progress.targetRibbit?.toLocaleString()} $RIBBIT · ${b.progress.pct}%`
                        : `${b.progress.spent.toLocaleString()} / ${b.progress.threshold.toLocaleString()} chips · ${b.progress.pct}%`}
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
                    The pot grows with every chip wagered — its share of the house edge. The
                    moment it reaches {b.prizeText ?? `${fmtRibbit(b.prizeRibbit)} $RIBBIT`} it pays
                    out automatically, split across all eligible winners by how well they did — and a
                    fresh pot opens.
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
                      {b.round !== undefined && b.round > 0 && (
                        <span className="mono text-[0.6rem] uppercase tracking-widest ml-2" style={{ color: "var(--text-dim)" }}>
                          r{b.round}
                        </span>
                      )}
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
            Arcade boards rank best score; the tables rank net chips won.
            Pools pay in $RIBBIT the moment a bounty triggers.{" "}
            <span className="text-neon">Prize boards rank active spenders only</span> —{" "}
            {house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT
            spent on chips lifetime and{" "}
            {house.rankedMinWindowBurnedRibbit.toLocaleString()}+ inside
            the board week (a rolling 7 days). Anyone can play free; only spenders collect.
          </p>
        </aside>
      </div>

      {/* The fine print — how chips, the edge and the pots actually work,
          with the live numbers and the real math. One coherent story: the 4%
          edge is the house's whole take, and the pot gets half of it.
          NOTE: keep every sentence inside ONE JSX expression (or use explicit
          {" "}) — JSX strips newline-adjacent whitespace and eats spaces. */}
      <section id="how-pots-work" className="panel p-6 sm:p-8 mt-10 scroll-mt-24">
        <div className="kicker mb-1.5">The fine print</div>
        <h2 className="!text-xl mb-5">How chips, the edge and the pots work</h2>
        {(() => {
          const price = house.ribbitPerCredit;
          const burnPct = Math.round(house.buyBurnShare * 100);
          const houseLeg = Math.round(price * (1 - house.buyBurnShare) * 100) / 100;
          const edgePct = Math.round(house.houseEdge * 100);
          const potPct = Math.round(house.bountyPotShare * 100);
          const rate =
            Math.round(house.bountyPotShare * house.houseEdge * (1 - house.buyBurnShare) * price * 100) / 100;
          return (
            <>
              <div className="grid md:grid-cols-2 gap-x-10 gap-y-5 text-sm text-fog leading-relaxed">
                <p>
                  <span className="text-frost font-medium">⛁ Chips are the table currency — tables only.</span>{" "}
                  {`${price.toLocaleString()} $RIBBIT buys one chip (${burnPct}% of the payment is burned forever, the rest lands in the transparent treasury). Chips play blackjack, dice and flip — nothing else. They never convert back to $RIBBIT: the only way to win real $RIBBIT at the tables is through the bounty pots below. The free arcade games never touch chips.`}
                </p>
                <p>
                  <span className="text-frost font-medium">One edge, split in half.</span>{" "}
                  {`The tables keep a flat ${edgePct}% edge — that is the house's entire take from play, published and provably fair. It gets split down the middle: ${potPct}% of it feeds the table's bounty pot, the rest is what the house keeps. Same ${edgePct}%, two halves — there is no second margin anywhere.`}
                </p>
                <div className="md:col-span-2 panel p-4">
                  <div className="kicker !text-[0.6rem] mb-2">The math, end to end</div>
                  <div className="mono text-[0.78rem] leading-loose overflow-x-auto whitespace-pre">
{`1 chip costs        ${price.toLocaleString()} $RIBBIT   →   ${(price - houseLeg).toLocaleString()} burned · ${houseLeg.toLocaleString()} to the house
table edge          ${edgePct}% of every wager
the pot's share     ${potPct}% of that edge
pot growth          ${price} × ${(house.houseEdge).toString()} × ${(1 - house.buyBurnShare).toString()} × ${(house.bountyPotShare).toString()}  =  ${rate} $RIBBIT per chip wagered`}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
                    {`Example: a 4,000 $RIBBIT pot that opens with a 2,000 house seed needs 2,000 more — at ${rate} $RIBBIT per chip that's about ${Math.ceil(2000 / rate).toLocaleString()} chips of play across all players, then it pays.`}
                  </p>
                </div>
                <p>
                  <span className="text-frost font-medium">Pots fill from play and pay instantly.</span>{" "}
                  {`Every chip wagered at a table nudges that table's pot up by ${rate} $RIBBIT — the meter shows exactly where it stands. The moment the pot reaches its prize, every eligible hunter who is net-positive on that table gets paid automatically, split by how much they're up. No claims, no waiting. Rounds are numbered; if the house has re-open on, a fresh pot starts immediately as the next round — a round marked FINAL won't return until the house posts a new bounty.`}
                </p>
                <p>
                  <span className="text-frost font-medium">No live bounty on a table?</span>{" "}
                  {`The table still plays exactly the same — you win and lose chips — but nothing feeds a prize while no bounty is open. The game page says so whenever that's the case, and the pot returns the moment the house posts the next round.`}
                </p>
                <p>
                  <span className="text-frost font-medium">The arcade is a separate, free world.</span>{" "}
                  {`Hopper, Frogris and Worm Frog cost nothing and never use chips. When an episode (bounty) is live, the week's best verified scores split a $RIBBIT pool at the deadline. No live episode = scores are just for bragging — they don't count toward anything until the next episode opens.`}
                </p>
                <p>
                  <span className="text-frost font-medium">Why it&apos;s built this way.</span>{" "}
                  {`A pot can only pay out what play has already funded (plus the house seed it opened with) — the house can never owe more than it has earned, which is what makes every posted prize real instead of a marketing number. Eligibility needs a minimum chip spend so prizes go to real players, not sybil wallets.`}{" "}
                  <Link href="/fairness" className="text-neon hover:underline">
                    Verify the fairness →
                  </Link>
                </p>
              </div>
            </>
          );
        })()}
      </section>
    </div>
  );
}
