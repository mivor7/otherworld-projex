"use client";

import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { MatteMedia } from "@/components/matte-media";
import { fromRawClient, shortWallet } from "@/lib/client-config";
import { useTourSim } from "@/components/tour-sim";

export type HomeSlateItem = {
  image: string;
  title: string;
  href?: string;
  game?: string;
  free?: boolean;
};

export type HomeAwardRow = {
  id: string;
  walletShort: string;
  title: string;
  game: string | null;
  amountRibbit: number;
  ago: string;
  highlight?: boolean;
};

export function HomeBountyBoard({
  gameSlate,
  poolByGame,
  openPrize,
  paidOut,
  awards,
}: {
  gameSlate: HomeSlateItem[];
  poolByGame: Record<string, number>;
  openPrize: number;
  paidOut: number;
  awards: HomeAwardRow[];
}) {
  const tourSim = useTourSim();

  const effectiveOpenPrize = tourSim.active
    ? Math.max(
        openPrize,
        Object.values(tourSim.bounties).reduce((s, b) => s + b.prizeRibbit, 0)
      )
    : openPrize;

  const effectivePaidOut = tourSim.active
    ? paidOut + tourSim.bountyPaidExtra
    : paidOut;

  const effectiveAwards: HomeAwardRow[] = tourSim.active
    ? [
        ...tourSim.bountyWins.map((w) => ({
          id: w.id,
          walletShort: `${shortWallet(tourSim.wallet)} · you`,
          title: w.title,
          game: w.game,
          amountRibbit: fromRawClient(w.amountRaw),
          ago: "just now",
          highlight: true,
        })),
        ...awards,
      ]
    : awards;

  return (
    <section id="owp-bounty-board" className="mt-16 scroll-mt-24">
      <Reveal>
        <div className="panel overflow-hidden">
          {/* header band */}
          <div className="flex items-end justify-between gap-4 flex-wrap p-6 pb-5">
            <div>
              <div className="kicker mb-2">The bounty board</div>
              <h2 className="text-[1.5rem]">Active hunts</h2>
              <p className="text-fog text-[0.85rem] mt-1.5 max-w-md leading-relaxed">
                Every live game carries a fixed $OWP pool that unlocks as
                it&apos;s played. Pick a target, fill the meter, split the pool.
              </p>
            </div>
            <div className="flex items-baseline gap-6 text-right">
              <div>
                <div className="stat-number text-neon text-[1.35rem]">
                  {effectiveOpenPrize.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  $OWP
                </div>
                <div className="kicker !text-[0.6rem]">on the board now</div>
              </div>
              <div>
                <div className="stat-number text-gold text-[1.35rem]">
                  {effectivePaidOut.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  $OWP
                </div>
                <div className="kicker !text-[0.6rem]">paid to hunters, all time</div>
              </div>
            </div>
          </div>

          {/* the games, each with its live bounty pool */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4 sm:px-6">
            {gameSlate.map((e, i) => {
              const simPool =
                tourSim.active && e.game ? tourSim.bounties[e.game] : undefined;
              const poolAmt = simPool
                ? simPool.prizeRibbit
                : e.game
                  ? poolByGame[e.game]
                  : undefined;
              const fillPct =
                simPool && simPool.mode === "credit" && simPool.threshold > 0
                  ? Math.min(100, Math.round((simPool.spent / simPool.threshold) * 100))
                  : null;
              const live = !!e.href;
              const card = (
                <div className="lot-card h-full group">
                  <div className="card-media !aspect-square">
                    <MatteMedia src={e.image} alt={e.title} fit="cover" />
                    {live ? (
                      <span className="badge badge-live absolute top-2 right-2">
                        <span className="live-dot" /> Live
                      </span>
                    ) : (
                      <span className="badge badge-urgent absolute top-2 right-2">
                        Soon
                      </span>
                    )}
                    {poolAmt !== undefined && (
                      <span className="badge badge-gold absolute bottom-2 left-2 !text-[0.6rem]">
                        {poolAmt.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{" "}
                        $OWP
                      </span>
                    )}
                  </div>
                  <div className="card-body !p-3">
                    <h3 className="!text-[0.8rem] !min-h-0">{e.title}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      {live && (
                        <span
                          className="text-[0.55rem] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={
                            e.free
                              ? {
                                  background: "oklch(0.78 0.11 150 / 0.15)",
                                  color: "oklch(0.85 0.12 150)",
                                }
                              : {
                                  background: "oklch(0.78 0.12 85 / 0.15)",
                                  color: "oklch(0.85 0.13 85)",
                                }
                          }
                        >
                          {e.free ? "Free" : "Chips ⛁"}
                        </span>
                      )}
                      <span className="text-[0.66rem]" style={{ color: "var(--text-dim)" }}>
                        {fillPct !== null
                          ? `Pot ${fillPct}% filled`
                          : poolAmt !== undefined
                            ? "Bounty live"
                            : live
                              ? "Play now"
                              : "In production"}
                      </span>
                    </div>
                  </div>
                </div>
              );
              return (
                <Reveal key={e.title} delay={i * 50}>
                  {e.href ? <Link href={e.href}>{card}</Link> : card}
                </Reveal>
              );
            })}
          </div>

          {/* the ledger footer — proof the pools actually pay */}
          <div
            id="owp-bounty-board-ledger"
            className="mt-6 border-t"
            style={{ borderColor: "var(--hairline)" }}
          >
            {effectiveAwards.length === 0 ? (
              <div className="p-5 px-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-fog text-sm">
                  <span className="kicker !text-[0.6rem] mr-2">Recent payouts</span>
                  No pools have triggered yet — the first hunts are filling their
                  meters now.
                </p>
                <Link href="/bounties" className="btn btn-ghost !text-xs">
                  Watch the board →
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-6 pt-4 pb-1">
                  <span className="kicker !text-[0.6rem]">Recent payouts</span>
                  <Link
                    href="/bounties"
                    className="text-xs text-fog hover:text-neon transition-colors"
                  >
                    Full board →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {effectiveAwards.slice(0, 5).map((a) => (
                        <tr
                          key={a.id}
                          data-owp-sim-award={a.highlight ? "1" : undefined}
                          className={`table-row ${a.highlight ? "text-neon" : ""}`}
                        >
                          <td className="py-2.5 px-6 mono text-xs whitespace-nowrap">
                            {a.walletShort}
                          </td>
                          <td className="py-2.5 pr-4 min-w-0">
                            <Link
                              href={a.game ? `/games/${a.game}` : "/bounties"}
                              className="hover:text-neon transition-colors"
                            >
                              {a.title}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-4 stat-number text-gold text-right whitespace-nowrap">
                            +
                            {a.amountRibbit.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}{" "}
                            $OWP
                          </td>
                          <td className="py-2.5 pr-6 text-xs text-right whitespace-nowrap text-fog">
                            {a.ago}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
