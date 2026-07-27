"use client";

// The Vault — read-only window onto the official $RIBBIT staking pool on
// Streamflow. Staking happens on Streamflow with the player's own wallet;
// this page watches the chain, shows the pool and your position, and links
// out. The House never touches staked funds.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { SectionTitle } from "@/components/ui";

type Pool = {
  address: string;
  streamflowUrl: string;
  totalStakedRibbit: number;
  capRibbit: number | null;
  stakersCount: number;
  aprPct: number | null;
  lockupDays: number;
  rewardsFundedRibbit: number;
  rewardsClaimedRibbit: number;
  expiresAt: string | null;
};
type You = { stakedRibbit: number; unlockAt: string | null };

const fmt = (n: number) =>
  n >= 1000 ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function StakingPage() {
  const { me } = useSession();
  const [pool, setPool] = useState<Pool | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/staking")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return;
          if (d?.pool) {
            setPool(d.pool);
            setYou(d.you);
            setFailed(false);
          } else if (d) {
            setFailed(true);
          }
        })
        .catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const pctFull =
    pool?.capRibbit && pool.capRibbit > 0
      ? Math.min(100, Math.round((pool.totalStakedRibbit / pool.capRibbit) * 100))
      : null;

  return (
    <div className="pt-6 max-w-3xl mx-auto">
      <SectionTitle
        compact
        kicker="The Vault"
        title="Staking"
        desc="Lock $RIBBIT in the official Streamflow pool and earn rewards while it sits out of circulation. Non-custodial: your tokens live in Streamflow's audited on-chain program — the House never holds them."
      />

      <div className="panel panel-glow panel-etched p-6 sm:p-8 mb-6">
        {!pool && !failed && <p className="text-fog text-sm">Reading the chain…</p>}
        {!pool && failed && (
          <p className="text-fog text-sm">
            The chain isn&apos;t answering right now — the pool itself is unaffected.
            Stake and manage positions any time on Streamflow below.
          </p>
        )}
        {pool && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 mb-6">
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Total staked</div>
                <div className="stat-number text-neon text-xl leading-none">
                  {fmt(pool.totalStakedRibbit)} <span className="text-xs">$RIBBIT</span>
                </div>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Rewards rate</div>
                <div className="stat-number text-gold text-xl leading-none">
                  {pool.aprPct !== null ? `~${Math.round(pool.aprPct)}%` : "—"}{" "}
                  <span className="text-xs">APR</span>
                </div>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Lockup</div>
                <div className="stat-number text-frost text-xl leading-none">
                  {Math.round(pool.lockupDays)} <span className="text-xs">days</span>
                </div>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Stakers</div>
                <div className="stat-number text-frost text-xl leading-none">{pool.stakersCount}</div>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Rewards funded</div>
                <div className="stat-number text-frost text-xl leading-none">
                  {fmt(pool.rewardsFundedRibbit)} <span className="text-xs">$RIBBIT</span>
                </div>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Pool runs to</div>
                <div className="stat-number text-frost text-xl leading-none">
                  {pool.expiresAt
                    ? new Date(pool.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </div>
              </div>
            </div>

            {pctFull !== null && pool.capRibbit && (
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-dim)" }}>
                  <span>Pool capacity</span>
                  <span className="mono">
                    {fmt(pool.totalStakedRibbit)} / {fmt(pool.capRibbit)} $RIBBIT · {pctFull}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.01 165)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pctFull}%`,
                      background: "linear-gradient(90deg, oklch(0.6 0.12 160), oklch(0.78 0.11 150))",
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {me.signedIn && you && (
          <div
            className="rounded-lg p-3 mb-6 text-sm"
            style={{
              background: you.stakedRibbit > 0 ? "oklch(0.78 0.11 150 / 0.08)" : "oklch(1 0 0 / 0.03)",
              border: `1px solid ${you.stakedRibbit > 0 ? "oklch(0.78 0.11 150 / 0.2)" : "var(--hairline)"}`,
            }}
          >
            {you.stakedRibbit > 0 ? (
              <>
                <span className="staker-mark mr-2">staker</span>
                You have <span className="stat-number text-neon">{fmt(you.stakedRibbit)} $RIBBIT</span> staked
                {you.unlockAt && (
                  <>
                    {" "}· unlocks{" "}
                    {new Date(you.unlockAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </>
                )}
                . Your wallet wears the staker mark across the House boards.
              </>
            ) : (
              <span className="text-fog">
                No active stake on this wallet yet — stake below and the staker mark follows you onto the boards.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={pool?.streamflowUrl ?? `https://app.streamflow.finance/staking/solana/mainnet/`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg px-8"
          >
            Stake on Streamflow →
          </a>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            Opens Streamflow — connect the same wallet you use here.
          </span>
        </div>
      </div>

      <div className="panel p-5 text-sm text-fog space-y-3">
        <p>
          <span className="text-frost font-medium">How it works.</span> Staking locks your
          $RIBBIT in Streamflow&apos;s on-chain program for the lockup period and pays rewards
          from a pool the House funds — your share grows with how much you stake and for how
          long. When the lockup ends, tokens unstake automatically.
        </p>
        <p>
          <span className="text-frost font-medium">Non-custodial.</span> Your tokens never
          pass through the House. They sit in the audited Streamflow program under your own
          wallet&apos;s authority — this page only reads the chain.
        </p>
        <p>
          <span className="text-frost font-medium">The staker mark.</span> Wallets with an
          active stake wear a <span className="staker-mark">staker</span> mark on the{" "}
          <Link href="/leaderboard" className="text-neon hover:underline">
            leaderboards
          </Link>{" "}
          and bounty standings — purely cosmetic, a hat tip to hunters holding with the House.
        </p>
      </div>
    </div>
  );
}
