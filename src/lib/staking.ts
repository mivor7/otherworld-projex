// Read-only window onto the official $RIBBIT staking pool on Streamflow.
//
// STRICTLY OBSERVATIONAL: the app never signs, never custodies, never builds
// a staking transaction. Users stake on app.streamflow.finance with their own
// wallet; we read the pool + stake-entry accounts off the chain to show pool
// stats, a wallet's position, and the cosmetic "staker" mark on boards.
//
// One snapshot (3 RPC reads) serves everything, cached for a minute and kept
// stale-on-error — an RPC hiccup degrades to slightly old numbers, never to a
// broken page or a dropped badge.
import { SolanaStakingClient } from "@streamflow/staking";
import { ICluster } from "@streamflow/common";
import { PublicKey } from "@solana/web3.js";
import { CONFIG } from "./config";

const TTL_MS = 60_000;

export type PoolSnapshot = {
  mint: string;
  totalStakedRaw: bigint;
  capRaw: bigint | null; // null = uncapped
  lockupSeconds: number;
  aprPct: number | null; // null when no live reward stream in $RIBBIT
  fundedRaw: bigint;
  claimedRaw: bigint;
  expiresAt: Date | null;
  // Open stake per wallet (closed entries excluded), plus its soonest unlock.
  stakes: Map<string, { amountRaw: bigint; unlockTs: number }>;
  fetchedAt: number;
};

let client: SolanaStakingClient | null = null;
let cache: PoolSnapshot | null = null;
let inflight: Promise<PoolSnapshot | null> | null = null;

function getClient(): SolanaStakingClient {
  if (!client) {
    client = new SolanaStakingClient({
      clusterUrl: CONFIG.rpcUrl,
      cluster: ICluster.Mainnet,
    });
  }
  return client;
}

const big = (v: unknown): bigint => BigInt(String(v ?? 0));

async function fetchSnapshot(): Promise<PoolSnapshot> {
  const c = getClient();
  const poolKey = new PublicKey(CONFIG.stakePool);
  const [pool, rewardPools, entries] = await Promise.all([
    c.getStakePool(CONFIG.stakePool),
    c.searchRewardPools({ stakePool: poolKey }),
    c.searchStakeEntries({ stakePool: poolKey }),
  ]);

  // APR from live reward streams paying in $RIBBIT: the stored rewardAmount
  // is (reward tokens per staked token per period) × 10^9 — Streamflow's
  // REWARD_AMOUNT_PRECISION — so yearly rate = amount/1e9 × periods/year.
  let aprPct: number | null = null;
  for (const rp of rewardPools) {
    const a = (rp as { account: Record<string, unknown> }).account;
    if (String(a.mint) !== CONFIG.ribbitMint) continue;
    if (Number(String(a.clawedBackTs ?? 0)) > 0) continue;
    const period = Number(String(a.rewardPeriod ?? 0));
    if (period <= 0) continue;
    const rate = Number(String(a.rewardAmount ?? 0)) / 1e9;
    aprPct = (aprPct ?? 0) + rate * ((365 * 86_400) / period) * 100;
  }

  const stakes = new Map<string, { amountRaw: bigint; unlockTs: number }>();
  let fundedRaw = 0n;
  let claimedRaw = 0n;
  for (const rp of rewardPools) {
    const a = (rp as { account: Record<string, unknown> }).account;
    if (String(a.mint) !== CONFIG.ribbitMint) continue;
    fundedRaw += big(a.fundedAmount);
    claimedRaw += big(a.claimedAmount);
  }
  for (const e of entries) {
    const a = (e as { account: Record<string, unknown> }).account;
    if (Number(String(a.closedTs ?? 0)) > 0) continue; // unstaked
    const wallet = String(a.authority);
    const amountRaw = big(a.amount);
    const unlockTs = Number(String(a.createdTs ?? 0)) + Number(String(a.duration ?? 0));
    const prev = stakes.get(wallet);
    stakes.set(wallet, {
      amountRaw: (prev?.amountRaw ?? 0n) + amountRaw,
      unlockTs: prev ? Math.max(prev.unlockTs, unlockTs) : unlockTs,
    });
  }

  const p = pool as unknown as Record<string, unknown>;
  const totalStakedRaw = big(p.totalStake);
  const expiryTs = Number(String(p.expiryTs ?? 0));
  return {
    mint: String(p.mint),
    totalStakedRaw,
    capRaw: p.isTotalStakeCapped ? totalStakedRaw + big(p.remainingTotalStake) : null,
    lockupSeconds: Number(String(p.minDuration ?? 0)),
    aprPct,
    fundedRaw,
    claimedRaw,
    expiresAt: expiryTs > 0 ? new Date(expiryTs * 1000) : null,
    stakes,
    fetchedAt: Date.now(),
  };
}

/** The cached pool snapshot; stale data on RPC failure, null only before the
 *  very first successful read. Hard 8s ceiling — this feeds hot routes (live
 *  standings), so a hanging RPC must degrade to stale/empty, never stall. */
export async function poolSnapshot(): Promise<PoolSnapshot | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = Promise.race([
      fetchSnapshot(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("staking RPC timeout")), 8_000)
      ),
    ])
      .then((snap) => (cache = snap))
      .catch(() => cache) // stale-on-error
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Wallets with an open stake — the cosmetic "staker" mark on boards. Empty
 *  set (nobody badged) when the chain can't be read; never an error. */
export async function stakerWallets(): Promise<Set<string>> {
  const snap = await poolSnapshot();
  return new Set(snap ? snap.stakes.keys() : []);
}
