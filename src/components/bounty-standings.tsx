"use client";

// Live-bounty panel for a game page: the prize, how full the pool is toward
// its trigger, the current projected pro-rata standings, and — for a signed-in
// eligible player — how much they'd earn if it settled right now. It's an
// estimate that shifts as people play and locks when the trigger fires. Polls
// so it feels live. Renders nothing when the game has no open bounty.
import Link from "next/link";
import { useSession } from "./session";
import { QualifyStatus } from "./qualify-status";
import { BountyEndedCard } from "./bounty-ended-card";
import { useBountyLive } from "./use-bounty-live";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function BountyStandings({ game }: { game: string }) {
  const { me } = useSession();
  // Shared per-game poll — same subscription as the strip above the game, so
  // the page issues one request per tick instead of two. Refreshes on
  // owp:round so rank/projection move the moment a round settles.
  const live = useBountyLive(game);

  const b = live?.bounty;
  const justEnded = live?.justEnded ?? null;

  // Desktop players see the settled-bounty outcome here (the mobile-only strip
  // above the game covers phones — hence lg-only, so it never shows twice).
  // With no bounty at all, say so plainly — a quiet table must never look
  // like a table with a hidden prize.
  if (!b) {
    if (!live) return null; // still loading — don't flash the notice
    return (
      <aside className="hidden lg:block h-fit lg:sticky lg:top-24">
        {justEnded ? (
          <BountyEndedCard data={justEnded} />
        ) : (
          <div className="panel p-5">
            <div className="kicker !text-[0.6rem] mb-2">No live bounty</div>
            <p className="text-xs text-fog leading-relaxed">
              This table has no bounty running right now. You win and lose
              chips as normal, but nothing feeds a $RIBBIT prize until the
              house posts the next round.
            </p>
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--hairline)" }}>
              <Link href="/bounties" className="text-xs text-neon hover:underline">
                See all bounties →
              </Link>
            </div>
          </div>
        )}
      </aside>
    );
  }

  const prize = b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT`;

  return (
    <aside className="panel panel-glow p-5 h-fit lg:sticky lg:top-24">
      {justEnded && (
        <div className="hidden lg:block">
          <BountyEndedCard data={justEnded} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge badge-live">
          <span className="live-dot" /> live bounty
        </span>
        <span className="stat-number text-gold text-sm ml-auto">{prize}</span>
      </div>
      <div className="font-medium tracking-tight mb-3">
        {b.title}
        {b.round !== undefined && (
          <span
            className="mono text-[0.6rem] uppercase tracking-widest ml-2 align-middle"
            style={{ color: "var(--text-dim)" }}
            title={
              b.autoRenew === false
                ? "Final round — this bounty won't re-open when it ends"
                : "A fresh round opens automatically when this one pays"
            }
          >
            round {b.round}
            {b.autoRenew === false && " · final"}
          </span>
        )}
      </div>

      {b.progress?.mode === "credit" && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="kicker !text-[0.6rem]">The pot grows as the game is played</span>
            <span className="mono text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
              {b.progress.potRibbit != null
                ? `${b.progress.potRibbit.toLocaleString()} / ${b.progress.targetRibbit?.toLocaleString()} $RIBBIT · ${b.progress.pct}%`
                : `${b.progress.spent.toLocaleString()} / ${b.progress.threshold.toLocaleString()} chips · ${b.progress.pct}%`}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.01 165)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${b.progress.pct}%`,
                background: "linear-gradient(90deg, oklch(0.66 0.1 150), oklch(0.82 0.11 150))",
              }}
            />
          </div>
          <p className="text-[0.7rem] mt-1.5" style={{ color: "var(--text-dim)" }}>
            Pays out the moment the bar fills — every eligible winner shares it.
          </p>
        </div>
      )}
      {b.progress?.mode === "time" && (
        <p className="text-[0.7rem] mb-4" style={{ color: "var(--text-dim)" }}>
          Free-game bounty — pays weekly to every eligible winner.
        </p>
      )}

      {/* Canonical "what you need to qualify" — identical phrasing everywhere. */}
      {me.signedIn && live?.you && (!live.you.spendEligible || live.you.volumeEligible === false) && (
        <div className="mb-4">
          <QualifyStatus you={live.you} />
        </div>
      )}

      {/* Your live situation once you qualify — never make the player guess. */}
      {me.signedIn && live?.you && live.you.spendEligible && live.you.volumeEligible !== false && (() => {
        const you = live.you;
        const isScore = you.unit === "best score";
        const standLine = isScore
          ? `Your best this bounty: ${you.value.toLocaleString()}`
          : `Your net this bounty: ${you.value > 0 ? "+" : ""}${you.value.toLocaleString()} chips`;
        return (
          <div
            className="rounded-lg p-3 mb-4"
            style={{ background: "oklch(0.78 0.11 150 / 0.08)", border: "1px solid oklch(0.78 0.11 150 / 0.2)" }}
          >
            {you.inRunning && you.projectedRibbit > 0 ? (
              <>
                <div className="kicker !text-[0.6rem] mb-0.5">You&apos;d earn right now</div>
                <div className="stat-number text-neon text-xl leading-none">
                  ~{fmt(you.projectedRibbit)} <span className="text-sm">$RIBBIT</span>
                </div>
                <div className="text-[0.7rem] mt-1" style={{ color: "var(--text-dim)" }}>
                  {standLine} · estimate shifts as others play, locks when it triggers
                </div>
              </>
            ) : (
              <div className="text-xs">
                <div
                  className={`font-medium ${!isScore && you.value < 0 ? "text-danger" : "text-frost"}`}
                >
                  {standLine}
                </div>
                <div className="text-fog mt-1">
                  {you.value > 0
                    ? "You qualify — you're in the standings as the pool fills."
                    : isScore
                    ? "You qualify — post a score above 0 to enter the standings."
                    : "You qualify — finish net-positive (above 0) to enter the standings."}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {!me.signedIn && (
        <p className="text-xs text-fog mb-4">
          Sign in and qualify to see your projected share of this pool.
        </p>
      )}

      {/* Projected standings */}
      <div className="kicker !text-[0.6rem] mb-2">
        Projected split · {b.unit}
      </div>
      {live.entries.length === 0 ? (
        <p className="text-fog text-sm">No eligible players yet — be the first.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {live.entries.slice(0, 8).map((e) => (
              <tr key={e.rank} className={`table-row ${e.isYou ? "text-neon" : ""}`}>
                <td className="py-1.5 pr-2 mono text-xs" style={{ color: e.isYou ? undefined : "var(--text-dim)" }}>
                  {String(e.rank).padStart(2, "0")}
                </td>
                <td className="py-1.5 pr-2 mono text-xs">
                  {e.wallet}
                  {e.staker && <span className="staker-mark ml-1.5">staker</span>}
                  {e.isYou && " · you"}
                </td>
                <td className="py-1.5 pr-2 stat-number text-xs text-right">
                  {e.value.toLocaleString()}
                </td>
                <td className="py-1.5 stat-number text-gold text-xs text-right">
                  ~{fmt(e.projectedRibbit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 pt-3 border-t flex gap-4" style={{ borderColor: "var(--hairline)" }}>
        <Link href="/bounties" className="text-xs text-neon hover:underline">
          All bounties →
        </Link>
        <Link href="/bounties#how-pots-work" className="text-xs text-fog hover:text-frost">
          How pots work →
        </Link>
      </div>
    </aside>
  );
}
