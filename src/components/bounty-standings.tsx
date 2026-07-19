"use client";

// Live-bounty panel for a game page: the prize, how full the pool is toward
// its trigger, the current projected pro-rata standings, and — for a signed-in
// eligible player — how much they'd earn if it settled right now. It's an
// estimate that shifts as people play and locks when the trigger fires. Polls
// so it feels live. Renders nothing when the game has no open bounty.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./session";
import { useHouseConfig } from "./use-house-config";

type Entry = {
  rank: number;
  wallet: string;
  value: number;
  projectedRibbit: number;
  isYou: boolean;
};
type Progress =
  | { mode: "revenue"; fundedRibbit: number; requiredRibbit: number; pct: number }
  | { mode: "time"; endsAt: string }
  | null;
type Live = {
  bounty: {
    id: string;
    title: string;
    prizeRibbit: number;
    prizeText: string | null;
    autoPay: boolean;
    unit: string;
    progress: Progress;
  } | null;
  entries: Entry[];
  you: { eligible: boolean; value: number; projectedRibbit: number } | null;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function BountyStandings({ game }: { game: string }) {
  const { me } = useSession();
  const house = useHouseConfig();
  const [live, setLive] = useState<Live | null>(null);

  const load = useCallback(() => {
    fetch(`/api/bounties/live?game=${game}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLive(d))
      .catch(() => {});
  }, [game]);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const b = live?.bounty;
  if (!b) return null;

  const prize = b.prizeText ?? `${fmt(b.prizeRibbit)} $RIBBIT`;

  return (
    <aside className="panel panel-glow p-5 h-fit">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge badge-live">
          <span className="live-dot" /> live bounty
        </span>
        <span className="stat-number text-gold text-sm ml-auto">{prize}</span>
      </div>
      <div className="font-medium tracking-tight mb-3">{b.title}</div>

      {b.progress?.mode === "revenue" && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="kicker !text-[0.6rem]">Prize funds as the house earns</span>
            <span className="mono text-[0.65rem]" style={{ color: "var(--text-dim)" }}>
              {b.progress.fundedRibbit.toLocaleString(undefined, { maximumFractionDigits: 0 })} /{" "}
              {b.progress.requiredRibbit.toLocaleString(undefined, { maximumFractionDigits: 0 })} $RIBBIT · {b.progress.pct}%
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
            Pays out once the house has banked enough — every eligible winner shares it.
          </p>
        </div>
      )}
      {b.progress?.mode === "time" && (
        <p className="text-[0.7rem] mb-4" style={{ color: "var(--text-dim)" }}>
          Free-game bounty — pays weekly to every eligible winner.
        </p>
      )}

      {/* Your projected earning */}
      {me.signedIn && live?.you && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: "oklch(0.78 0.11 150 / 0.08)", border: "1px solid oklch(0.78 0.11 150 / 0.2)" }}
        >
          {live.you.eligible && live.you.projectedRibbit > 0 ? (
            <>
              <div className="kicker !text-[0.6rem] mb-0.5">You&apos;d earn right now</div>
              <div className="stat-number text-neon text-xl leading-none">
                ~{fmt(live.you.projectedRibbit)} <span className="text-sm">$RIBBIT</span>
              </div>
              <div className="text-[0.7rem] mt-1" style={{ color: "var(--text-dim)" }}>
                estimate — shifts as others play, locks when it triggers
              </div>
            </>
          ) : (
            <div className="text-xs text-fog">
              You&apos;re not in the running yet — {b.unit === "best score" ? "post a top score" : "finish net-positive"}, and
              spend {house.rankedMinBurnedRibbit.toLocaleString()}+ $RIBBIT on credits (lifetime) and{" "}
              {house.rankedMinWindowBurnedRibbit.toLocaleString()}+ this window to qualify.
            </div>
          )}
        </div>
      )}
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
                  {e.wallet}{e.isYou && " · you"}
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
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--hairline)" }}>
        <Link href="/bounties" className="text-xs text-neon hover:underline">
          All bounties →
        </Link>
      </div>
    </aside>
  );
}
