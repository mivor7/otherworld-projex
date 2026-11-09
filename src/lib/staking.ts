// There is no staking pool. Leaderboards and bounty standings still ask which
// wallets are staking; the answer is always nobody. A leftover
// STAKE_POOL_ADDRESS must not revive an old pool.

/** Wallets with an open stake. Always empty. */
export async function stakerWallets(): Promise<Set<string>> {
  return new Set();
}
